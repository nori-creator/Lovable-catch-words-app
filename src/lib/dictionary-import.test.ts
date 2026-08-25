import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { partitionByLanguage, hasMeaning, levelOk } from "./dictionary-import";
import { csvToRows } from "@/routes/_authenticated/admin.dictionary";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "./target-lang";

/**
 * オーナー指示（2026-08-25）:
 * > 「決して英語と台湾華語混ざらないようにやり方を考えて。」
 *
 * ここで守るのは「**気をつける**」ではなく「**通れない**」こと。
 * 人は言語を選び間違える。だから選び間違えたときに、
 * 中身のほうが門を通れないようにする。
 */

const zh = (headword: string, over = {}) => ({ headword, meaning_ja: "いみ", ...over });
const en = (headword: string, over = {}) => ({
  headword,
  meanings: { "zh-TW": "意思" },
  ...over,
});

describe("**言語が混ざらない**", () => {
  it("繁体字の語は、英語の取り込みを通らない", () => {
    const got = partitionByLanguage([zh("珍珠奶茶"), zh("雨傘"), zh("夜市")], "en");
    expect(got.ok).toEqual([]);
    expect(got.rejected.map((r) => r.reason)).toEqual([
      "wrong_language",
      "wrong_language",
      "wrong_language",
    ]);
  });

  it("英語の語は、台湾華語の取り込みを通らない", () => {
    const got = partitionByLanguage(
      [en("umbrella"), en("night market"), en("bicycle")],
      DEFAULT_TARGET_LANGUAGE,
    );
    expect(got.ok).toEqual([]);
    for (const r of got.rejected) expect(r.reason).toBe("wrong_language");
  });

  it("**混ざった CSV を貼っても、選んだ言語の行だけが入る**", () => {
    // いちばん怖い形: 前の取り込みの残りが混ざっている。
    const mixed = [zh("珍珠奶茶"), en("umbrella"), zh("夜市"), en("bicycle")];
    const asEn = partitionByLanguage(mixed, "en");
    expect(asEn.ok.map((r) => r.headword)).toEqual(["umbrella", "bicycle"]);
    expect(asEn.rejected.map((r) => r.headword)).toEqual(["珍珠奶茶", "夜市"]);

    const asZh = partitionByLanguage(mixed, DEFAULT_TARGET_LANGUAGE);
    expect(asZh.ok.map((r) => r.headword)).toEqual(["珍珠奶茶", "夜市"]);
    expect(asZh.rejected.map((r) => r.headword)).toEqual(["umbrella", "bicycle"]);
  });

  it("かな・ハングル・キリル文字はどちらの取り込みも通らない", () => {
    for (const lang of TARGET_LANGUAGES) {
      const got = partitionByLanguage([zh("シャーペン"), zh("안녕"), zh("Привет")], lang);
      expect(got.ok, lang).toEqual([]);
    }
  });

  it("知らない言語を渡されても既定に落ちる(未知の言語で書き込まない)", () => {
    const got = partitionByLanguage([zh("雨傘")], "kl-GL");
    expect(got.language).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(got.ok.length).toBe(1);
  });

  it("**落ちた行は数と実例で返す**(黙って捨てない)", () => {
    const got = partitionByLanguage([en("umbrella"), zh("雨傘")], "en");
    expect(got.rejected.length).toBe(1);
    // CSV のヘッダー行を足した、人が数える行番号。
    expect(got.rejected[0]).toEqual({ row: 3, headword: "雨傘", reason: "wrong_language" });
  });
});

describe("中身の検査", () => {
  it("意味が1つも無い行は落とす", () => {
    const got = partitionByLanguage([{ headword: "umbrella" }], "en");
    expect(got.rejected[0].reason).toBe("no_meaning");
  });

  it("**新しい欄でも古い欄でも、意味が在れば通る**", () => {
    expect(hasMeaning({ headword: "x", meaning_ja: "いみ" })).toBe(true);
    expect(hasMeaning({ headword: "x", meanings: { "zh-TW": "意思" } })).toBe(true);
    expect(hasMeaning({ headword: "x", meanings: { ja: "  " } })).toBe(false);
    expect(hasMeaning({ headword: "x", meanings: {} })).toBe(false);
    expect(hasMeaning({ headword: "x" })).toBe(false);
  });

  it("級は6段の中だけ。無いのは通す", () => {
    expect(levelOk({ headword: "x" })).toBe(true);
    expect(levelOk({ headword: "x", level_step: null })).toBe(true);
    for (const n of [1, 3, 6])
      expect(levelOk({ headword: "x", level_step: n }), String(n)).toBe(true);
    for (const n of [0, 7, -1, 1.5]) {
      expect(levelOk({ headword: "x", level_step: n }), String(n)).toBe(false);
    }
  });

  it("**級が外れた行は入れない**(DB の CHECK に当たって取り込み全体が落ちる)", () => {
    const got = partitionByLanguage([en("umbrella", { level_step: 9 })], "en");
    expect(got.ok).toEqual([]);
    expect(got.rejected[0].reason).toBe("bad_level");
  });

  it("見出し語の前後の空白は落として入れる", () => {
    const got = partitionByLanguage([en("  umbrella  ")], "en");
    expect(got.ok[0].headword).toBe("umbrella");
  });
});

describe("server が言語を決め打っていない", () => {
  /**
   * 元の `importDictionaryEntries` は `language: DEFAULT_TARGET_LANGUAGE` と
   * **書いてあった**。英語の CSV を貼っても台湾華語として入る。
   * オーナーはここから辞書を入れるので、ここが決め打ちだと
   * 「混ざらない」は成立しない。
   */
  it("取り込みの server に言語の決め打ちが無い", () => {
    const src = fs.readFileSync("src/lib/admin.functions.ts", "utf8");
    expect(src.includes("language: DEFAULT_TARGET_LANGUAGE")).toBe(false);
  });

  /**
   * **文字列が在るかだけでは足りない。** 最初はここで
   * `src.includes("partitionByLanguage")` を見ていたが、門を素通りに
   * 差し替えても **import 行に名前が残るので通ってしまった**
   * （わざと壊して分かった）。
   *
   * 見るべきは「**門を通した結果で書き込んでいるか**」。
   */
  it("**取り込みの server が、門を通した結果だけを書き込んでいる**", () => {
    const src = fs.readFileSync("src/lib/admin.functions.ts", "utf8");
    // 門を呼んで、その `ok` を取り出していること。
    expect(src).toMatch(/const \{[^}]*\bok\b[^}]*\} = partitionByLanguage\(/);
    // **生の行をそのまま payload にしていないこと。**
    expect(src.includes("data.rows.map("), "生の行から payload を作っている").toBe(false);
    // payload は `ok` から作る。
    expect(src.includes("ok.map(")).toBe(true);
  });
});

describe("生成した CSV が、実際の取り込みを通る", () => {
  /**
   * **生成の側だけを見ても足りない。** 書き出した CSV が、取り込み欄の
   * パーサ（`csvToRows`）と門（`partitionByLanguage`）を本当に通るかを、
   * **取り込む側から**確かめる。
   *
   * ここに置いているのは、`scripts/import-lexicon.mjs -- csv` が出す形と
   * 1文字も違わない見本。実物の 25,595行でも同じ手順で確かめた
   * （6ファイル全部が1行も落ちずに通り、台湾華語として貼ると0行）。
   */
  const SAMPLE = [
    "headword,reading_primary,reading_alt,meanings,pos,level_step,freq_rank,exam_tags,forms,entry_type,source,notes",
    'bicycle,ˈbaɪsɪkəl,ˈbaisikl,"{""zh-TW"":""n. 腳踏車""}",n.,1,4366,zk|gk|cet4,"{""plural"":""bicycles""}",word,dict,ECDICT',
    'a bit,,,"{""zh-TW"":""一點兒；有一點兒""}",,4,,,,phrase,dict,ECDICT',
    'umbrella,əmˈbɹɛlə,ʌmˈbrelə,"{""zh-TW"":""n. 傘, 雨傘""}",n.,1,5664,zk|gk,"{""plural"":""umbrellas""}",word,dict,ECDICT',
  ].join("\n");

  it("**英語として貼ると、全部通る**", () => {
    const rows = csvToRows(SAMPLE);
    const got = partitionByLanguage(rows, "en");
    expect(got.rejected).toEqual([]);
    expect(got.ok.map((r) => r.headword)).toEqual(["bicycle", "a bit", "umbrella"]);
  });

  it("**同じ CSV を台湾華語として貼ると、1行も入らない**", () => {
    const got = partitionByLanguage(csvToRows(SAMPLE), DEFAULT_TARGET_LANGUAGE);
    expect(got.ok).toEqual([]);
    expect(got.rejected.length).toBe(3);
  });

  it("読み・意味・活用・級が読めている", () => {
    const rows = csvToRows(SAMPLE);
    const b = rows.find((r) => r.headword === "bicycle")!;
    expect(b.reading_primary).toBe("ˈbaɪsɪkəl");
    expect(b.reading_alt).toBe("ˈbaisikl");
    expect(b.meanings?.["zh-TW"]).toContain("腳踏車");
    expect(b.forms?.plural).toBe("bicycles");
    expect(b.level_step).toBe(1);
    expect(b.freq_rank).toBe(4366);
    expect(b.exam_tags).toEqual(["zk", "gk", "cet4"]);
    expect(b.entry_type).toBe("word");
  });

  it("**言い回し（空欄だらけの行）も落ちない**", () => {
    const rows = csvToRows(SAMPLE);
    const p = rows.find((r) => r.headword === "a bit")!;
    expect(p.reading_primary).toBeUndefined();
    expect(p.meanings?.["zh-TW"]).toBe("一點兒；有一點兒");
    expect(partitionByLanguage([p], "en").ok.length).toBe(1);
  });

  it("**中文の語釈の改行は `\\n` に逃がされている**(ECDICT の語釈は複数行)", () => {
    // 生成側は `JSON.stringify` を通すので、語釈の中の**本物の改行**は
    // `\\n` の2文字に逃がされる。だから JSON の欄が複数行になることは無い。
    // **これは偶然ではなく、頼っている性質**なので数えておく。
    // （逃がされていない本物の改行を JSON.parse は受け付けない。）
    const cell = JSON.stringify({ "zh-TW": "n. 電話\nvt. 打電話" });
    expect(cell.includes("\n"), "本物の改行が残っている").toBe(false);
    expect(cell).toContain("\\n");

    const csv = ["headword,meanings", `phone,"${cell.replace(/"/g, '""')}"`].join("\n");
    const rows = csvToRows(csv);
    expect(rows.length).toBe(1);
    expect(rows[0].meanings?.["zh-TW"]).toContain("電話");
    expect(rows[0].meanings?.["zh-TW"]).toContain("打電話");
    expect(partitionByLanguage(rows, "en").ok.length).toBe(1);
  });

  it("**括られたセルの中の本物の改行で行が切れない**(notes など)", () => {
    // JSON 以外の欄は逃がされないので、本物の改行が入り得る。
    // ここで行が切れると、25,000行の CSV が途中から全部ずれる。
    const csv =
      "headword,meanings,notes\n" +
      'cat,"{""zh-TW"":""n. 貓""}","1行目\n2行目"\n' +
      'dog,"{""zh-TW"":""n. 狗""}",short';
    const rows = csvToRows(csv);
    expect(rows.map((r) => r.headword)).toEqual(["cat", "dog"]);
    expect(rows[0].notes).toContain("2行目");
  });

  it("壊れた JSON の欄は空にして、行そのものは残す", () => {
    const csv = ["headword,meanings,forms", 'cat,"{""zh-TW"":""貓""}",not-json'].join("\n");
    const rows = csvToRows(csv);
    expect(rows[0].forms).toBeUndefined();
    expect(partitionByLanguage(rows, "en").ok.length).toBe(1);
  });
});
