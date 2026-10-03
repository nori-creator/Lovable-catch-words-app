/**
 * **学習言語の字でない見出し語を、保存させない・見せない**（オーナー報告 2026-10-02）。
 *
 * 英語を学んでいるオーナーの図鑑に「ノート」（カタカナ）と「拿鐵」（繁体字）が
 * `words.language = 'en'` で入っていた。どちらも写真から撮った語。
 * 復習では「拿鐵」の繁體中文の4択が 3.5 秒出てから英語の4択に替わった。
 *
 * ここで確かめる物:
 *  - 判定（`isTargetHeadword`）の通す／落とすの表
 *  - 保存の関所（`upsertWord` → `assertTargetHeadword`）が DB に触る前に止めること
 *  - 候補の関所（`keepTargetHeadwords`）— 撮った後の候補・スキャンの検出
 *  - 見せる側の関所（`wordBelongsToTarget`）— 図鑑・復習・端末の束
 *  - 止めた理由が画面の言語の文になること（`readableError`）
 *  - 画面の道が関所を通っていること（ソースの形）
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { upsertWord, type WordUpsertInput } from "./stickers.functions";
import {
  NOT_TARGET_LANGUAGE,
  assertTargetHeadword,
  isTargetHeadword,
  keepTargetHeadwords,
} from "./target-language";
import { headwordMatchesTarget, wordBelongsToTarget } from "./language-filter";
import { readableError } from "./errors";

describe("判定の表（保存の関所と見せる側が使う1つの規則）", () => {
  const accept: Array<[string, string]> = [
    // 英語: 空白・ハイフン・アポストロフィ・数字・アクセント付き・&
    ["notebook", "en"],
    ["latte", "en"],
    ["T-shirt", "en"],
    ["rock 'n' roll", "en"],
    ["rock ‘n’ roll", "en"],
    ["don't", "en"],
    ["night market", "en"],
    ["7-Eleven", "en"],
    ["3D printer", "en"],
    ["café", "en"],
    ["jalapeño", "en"],
    ["R&B", "en"],
    // 台湾華語: 漢字・々・〇・漢字にくっついた大文字の略語・数字
    ["拿鐵", "zh-TW"],
    ["珍珠奶茶", "zh-TW"],
    ["時時刻刻", "zh-TW"],
    ["一〇一大樓", "zh-TW"],
    ["〇", "zh-TW"],
    ["T恤", "zh-TW"],
    ["卡拉OK", "zh-TW"],
    ["Q彈", "zh-TW"],
    ["3C產品", "zh-TW"],
    ["2個", "zh-TW"],
    // 日本語（iOS 版が先に使う。PR #141）: かな・漢字・頭の大文字+カタカナ
    ["ノート", "ja"],
    ["手帳", "ja"],
    ["人々", "ja"],
    ["Tシャツ", "ja"],
  ];
  it.each(accept)("通す: %s (%s)", (w, lang) => {
    expect(isTargetHeadword(w, lang)).toBe(true);
    expect(() => assertTargetHeadword(w, lang)).not.toThrow();
  });

  const reject: Array<[string, string]> = [
    // 報告の行そのもの
    ["ノート", "en"],
    ["拿鐵", "en"],
    ["手", "en"],
    ["筆記型電腦", "en"],
    ["腳", "en"],
    ["クロワッサン", "zh-TW"],
    // 英語に漢字・かな・ハングル・キリル文字・数字だけ
    ["notebookノート", "en"],
    ["안녕", "en"],
    ["Привет", "en"],
    ["123", "en"],
    // 台湾華語に欧文の語・注釈・小文字の付け足し・かな
    ["latte", "zh-TW"],
    ["MRT", "zh-TW"],
    ["文旦juice", "zh-TW"],
    ["文旦JUICE", "zh-TW"],
    ["烤肉 (BBQ)", "zh-TW"],
    ["シャーペン", "zh-TW"],
    // 日本語に欧文
    ["notebook", "ja"],
    ["ノートbook", "ja"],
    // 空
    ["", "en"],
    ["   ", "zh-TW"],
  ];
  it.each(reject)("落とす: %s (%s)", (w, lang) => {
    expect(isTargetHeadword(w, lang)).toBe(false);
    expect(() => assertTargetHeadword(w, lang)).toThrow(NOT_TARGET_LANGUAGE);
  });
});

describe("保存の関所（`upsertWord`）— 写真・文字・声・見出しの直し・iOS が通る1本道", () => {
  const word = (headword: string): WordUpsertInput =>
    ({
      headword,
      reading_zhuyin: "",
      pinyin: "",
      meaning_ja: "書き込み用の紙を綴じたもの。手帳。",
      part_of_speech: "名詞",
      level: "",
      category_key: "stationery",
      example_sentence: "",
      example_translation: "",
    }) as WordUpsertInput;

  /** DB に触ったら分かる偽物。 */
  const spyDb = () => {
    const from = vi.fn(() => {
      throw new Error("DB に触った");
    });
    return { db: { from }, from };
  };

  it.each([
    ["ノート", "en"],
    ["拿鐵", "en"],
    ["クロワッサン", "zh-TW"],
  ])(
    "「%s」を %s として**行を探す前に**止める（既存の誤った行に札を足さない）",
    async (h, lang) => {
      const { db, from } = spyDb();
      await expect(upsertWord(db, "u1", word(h), lang)).rejects.toThrow(NOT_TARGET_LANGUAGE);
      expect(from).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["notebook", "en"],
    ["拿鐵", "zh-TW"],
    ["ノート", "ja"],
  ])("「%s」(%s) は関所を通って DB へ進む", async (h, lang) => {
    const { db, from } = spyDb();
    // 偽の DB は触った瞬間に投げる = 関所は通ったということ。
    await expect(upsertWord(db, "u1", word(h), lang)).rejects.toThrow("DB に触った");
    expect(from).toHaveBeenCalledWith("words");
  });
});

describe("候補の関所（`keepTargetHeadwords`）— 撮った後の候補・スキャンの検出", () => {
  it("英語を学ぶ人の候補から、カタカナと繁体字を落とす", () => {
    const got = keepTargetHeadwords(
      [
        { headword: "ノート", meaning_ja: "ノート" },
        { headword: "notebook", meaning_ja: "ノート" },
        { headword: "拿鐵", meaning_ja: "カフェラテ" },
        { headword: "latte (拿鐵)", meaning_ja: "カフェラテ" },
      ],
      "en",
    );
    expect(got.map((g) => g.headword)).toEqual(["notebook", "latte"]);
    // ほかの欄はそのまま。
    expect(got[1].meaning_ja).toBe("カフェラテ");
  });

  it("スキャンの言い換え候補も同じ関所に通し、同じ語は2回出さない", () => {
    const got = keepTargetHeadwords(
      [
        { headword: "拿鐵", alternatives: ["latte", "ラテ"] },
        { headword: "coffee", alternatives: ["coffee", "咖啡", "café"] },
        { headword: "coffee", alternatives: [] },
      ],
      "en",
    );
    expect(got).toEqual([{ headword: "coffee", alternatives: ["café"] }]);
  });

  it("台湾華語を学ぶ人には「T恤」を残し、「クロワッサン」を落とす", () => {
    const got = keepTargetHeadwords(
      [{ headword: "T恤" }, { headword: "クロワッサン" }, { headword: "可頌" }],
      "zh-TW",
    );
    expect(got.map((g) => g.headword)).toEqual(["T恤", "可頌"]);
  });
});

describe("見せる側の関所（`wordBelongsToTarget`）— 図鑑・今日の列・端末の束", () => {
  it("報告の行は英語の一覧に出さない", () => {
    expect(wordBelongsToTarget({ language: "en", headword: "ノート" }, "en")).toBe(false);
    expect(wordBelongsToTarget({ language: "en", headword: "拿鐵" }, "en")).toBe(false);
    expect(wordBelongsToTarget({ language: "zh-TW", headword: "クロワッサン" }, "zh-TW")).toBe(
      false,
    );
  });

  it("正しい行はそのまま出す", () => {
    expect(wordBelongsToTarget({ language: "en", headword: "notebook" }, "en")).toBe(true);
    expect(wordBelongsToTarget({ language: "zh-TW", headword: "拿鐵" }, "zh-TW")).toBe(true);
    // 言語の列が空の古い行は台湾華語の行として数える（`matchesTargetLanguage` の注）。
    expect(wordBelongsToTarget({ language: null, headword: "珍珠奶茶" }, "zh-TW")).toBe(true);
    expect(wordBelongsToTarget({ language: "ja", headword: "ノート" }, "ja")).toBe(true);
  });

  it("言語の列が違えば、字が合っていても出さない（いままでの絞りのまま）", () => {
    expect(wordBelongsToTarget({ language: "zh-TW", headword: "拿鐵" }, "en")).toBe(false);
    expect(wordBelongsToTarget({ language: "en", headword: "latte" }, "zh-TW")).toBe(false);
  });

  it("見出し語が無い行は字で隠さない（材料が無いのに消さない）", () => {
    expect(headwordMatchesTarget("", "en")).toBe(true);
    expect(headwordMatchesTarget(null, "en")).toBe(true);
    expect(wordBelongsToTarget({ language: "en" }, "en")).toBe(true);
    expect(wordBelongsToTarget(null, "en")).toBe(false);
  });
});

describe("止めた理由は画面の言語の文で出す", () => {
  const t = (k: string) => `[${k}]`;
  it.each(["ja", "en", "zh-TW"] as const)("%s", (lang) => {
    expect(readableError(new Error(NOT_TARGET_LANGUAGE), "FB", lang, t)).toBe(
      "[err.notTargetLanguage]",
    );
  });
});

describe("画面の道が関所を通っている（ソースの形）", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

  it("スキャン: 漢字を含む物だけを残す決め打ちを使わない", () => {
    const src = read("components/screens/ScanScreen.tsx");
    expect(src).not.toMatch(/\/\[㐀-鿿/);
    expect(src).toMatch(/isTargetHeadword\(it\.headword, targetLanguage\)/);
    // 言い換えの候補も絞ってから見せる・渡す。
    expect(src).toMatch(/\.\.\.targetAlternatives\(chip\.item\)/);
    expect(src).toMatch(/alternatives: unsure \? alternatives : \[\]/);
    // 保存に使う学習言語で検出を頼む。
    expect(src).toMatch(/data: \{ imageBase64: frame, lat, lng, targetLanguage \}/);
  });

  it("スキャンの検出・撮った後の候補: サーバでも学習言語の語だけを返す", () => {
    const scan = read("lib/scan.functions.ts");
    expect(scan).toMatch(/parsed\.items = keepTargetHeadwords\(parsed\.items, target\)/);
    const ai = read("lib/ai.functions.ts");
    expect(ai).toMatch(/keepTargetHeadwords\(parsed\.suggestions, data\.targetLanguage\)/);
  });

  it("撮る画面: 候補・スキャンの受け渡しを絞り、保存の前に確かめる", () => {
    const src = read("components/screens/CaptureScreen.tsx");
    expect(src).toMatch(
      /setSuggestions\(keepTargetHeadwords\(suggestRes\.suggestions, targetLanguage\)\)/,
    );
    expect(src).toMatch(
      /async function handleSave\(\) \{[\s\S]{0,700}?if \(!isTargetHeadword\(selectedHead, targetLanguage\)\)/,
    );
    // `?word=` は打った語と同じ道（直に confirmWord へ渡さない）。
    expect(src).toMatch(/void searchWord\(wordParam\)/);
  });

  it("スキャンのキャッチの面: 保存の前に確かめ、サーバの理由をそのまま言う", () => {
    const src = read("components/ScanCatchSheet.tsx");
    expect(src).toMatch(/!upgrade && !isTargetHeadword\(headword, targetLanguage\)/);
    expect(src).toMatch(/toast\.error\(reason\)/);
  });

  it("保存の関所は `upsertWord` の先頭（行を探すより前）", () => {
    const src = read("lib/stickers.functions.ts");
    const fn = src.slice(src.indexOf("export async function upsertWord"));
    const guard = fn.indexOf("assertTargetHeadword(word.headword, language)");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(fn.indexOf('.from("words")'));
  });

  it("図鑑・今日の列・端末の束は見出しの字も見る", () => {
    expect(read("lib/stickers.functions.ts")).toMatch(
      /rows = rows\.filter\(\(r\) => headwordMatchesTarget\(r\.words\?\.headword, targetLanguage\)\)/,
    );
    expect(read("lib/reviews.functions.ts")).toMatch(
      /\.filter\(\(r\) => wordBelongsToTarget\(r\.stickers\?\.words, targetLanguage\)\);[\s\S]{0,800}?ordered\.slice\(0, fetchLimit\)/,
    );
    expect(read("components/screens/ReviewScreen.tsx")).toMatch(
      /batch\.cards\.every\(\(c\) => wordBelongsToTarget\(c, target\)\)/,
    );
  });
});
