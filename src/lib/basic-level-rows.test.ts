import { describe, expect, it } from "vitest";
import { alignRowMeanings, basicLevelOf, rowNamedBy, rowOfHeadword, rowTagOf } from "./basic-level";
import { finishPhotoCandidates, isReaderTagText, type ReadingCheck } from "./photo-candidates";
import { BASIC_LEVEL_RULE, applyObjectLabels, objectLabelRule } from "./candidate-register";
import { isTargetHeadword, keepTargetHeadwords } from "./target-language";
import { typedObjectLabel } from "./typed-candidates";
import type { UiLang } from "./i18n";

/**
 * **猫の写真のタグが「犬」**（本番 2026-10-15 12:56:07 UTC、日本語の表示）。
 *
 * キジトラの猫（カメラロールの写真）で、タグ「犬」・見出し「写っている物：犬」・候補 貓（一般的な言い方）の意味
 * 「犬」と 虎斑貓（より詳しい言い方）。控え（`generated_cards`）は 貓 =「犬」、虎斑貓 =「キジトラ」。
 *
 * - その回の写真の AI の出力は 229 トークン、画面の候補は 2つ（`candidate_pick` n=2）—
 *   サーバが候補を足していない（足すと 3つ）。だから 貓 は AI がそのまま返した物で、**「犬」は AI の出力**
 *   （指示文の label の例で動物は「柴犬 → 犬」だけ。meaning_ja は label と同じ言い方から始めるよう頼んでいた）。
 * - サーバはそれを通していた: 基本の語の意味の確かめ（`ensureBasicLevel`）は「同じ行の細かい名前か」
 *   （內褲 =「ボクサーパンツ」）しか見ず、別の行の物の名前（犬 = 狗 の行）を見ていなかった。タグは AI の label
 *   「犬」が意味の中に在ったのでそのまま。
 * - 下の「AI の出力に犬が無ければ犬は出ない」の試験が、後の処理が「犬」を作らないことを確かめる（直す前も同じ）。
 */

const keepReading: ReadingCheck = (_lang, _head, item) => item;

type Item = Parameters<typeof finishPhotoCandidates>[0][number];

const finish = (items: Item[], reader: UiLang = "ja") =>
  finishPhotoCandidates(keepTargetHeadwords(items, "zh-TW"), reader, "zh-TW", keepReading).map(
    (c) => ({
      headword: c.headword,
      register: c.register,
      meaning: c.meaning_ja,
      tag: c.object_label,
    }),
  );

const cat = (over: Partial<Item> = {}): Item => ({
  headword: "貓",
  reading_zhuyin: "ㄇㄠ",
  pinyin: "māo",
  meaning_ja: "猫",
  label: "猫",
  register: "common",
  category_key: "animal",
  group: 0,
  ...over,
});
const tabby = (over: Partial<Item> = {}): Item => ({
  headword: "虎斑貓",
  reading_zhuyin: "ㄏㄨˇ ㄅㄢ ㄇㄠ",
  pinyin: "hǔbānmāo",
  meaning_ja: "キジトラ",
  register: "specific",
  category_key: "animal",
  group: 0,
  ...over,
});

describe("猫の写真に「犬」（本番 2026-10-15 12:56）", () => {
  it("本番の返事そのまま: 貓 に label・意味「犬」 → 意味もタグも「猫」、虎斑貓 はキジトラのまま", () => {
    const out = finish([cat({ meaning_ja: "犬", label: "犬" }), tabby()]);
    expect(out).toEqual([
      { headword: "貓", register: "common", meaning: "猫", tag: "猫" },
      { headword: "虎斑貓", register: "specific", meaning: "キジトラ", tag: "猫" },
    ]);
  });

  it("label だけ「犬」・意味だけ「犬」・英語の表示で「dog」でも、猫のタグは猫", () => {
    expect(finish([cat({ label: "犬" }), tabby()]).map((c) => [c.meaning, c.tag])).toEqual([
      ["猫", "猫"],
      ["キジトラ", "猫"],
    ]);
    expect(finish([cat({ meaning_ja: "犬", label: "猫" }), tabby()])[0]).toMatchObject({
      meaning: "猫",
      tag: "猫",
    });
    expect(
      finish(
        [cat({ meaning_ja: "dog", label: "dog" }), tabby({ meaning_ja: "tabby cat" })],
        "en",
      ).map((c) => [c.headword, c.meaning, c.tag]),
    ).toEqual([
      ["貓", "cat", "cat"],
      ["虎斑貓", "tabby cat", "cat"],
    ]);
  });

  it("AI の出力に「犬」が無ければ、どの形でも猫の写真に「犬」は出ない（後の処理は作らない）", () => {
    const shapes: Item[][] = [
      [cat(), tabby()],
      [tabby({ label: "猫", register: "common" })],
      [tabby({ label: "キジトラ", register: "common" })],
      [tabby({ register: "common" })],
      [tabby({ label: "猫", register: "common" }), cat({ register: "specific", label: null })],
      [cat({ headword: "貓咪" }), tabby()],
      [cat({ headword: "米克斯貓", meaning_ja: "雑種猫" }), tabby()],
      [cat({ headword: "米克斯", meaning_ja: "雑種猫" }), tabby()],
      [cat({ meaning_ja: "ネコ", label: "ネコ" }), tabby()],
      [cat({ meaning_ja: "", label: "猫" }), tabby()],
      [cat({ headword: "花貓", meaning_ja: "三毛猫" })],
      [cat({ group: null }), tabby({ group: null })],
      // 台湾の字にしか無い見出しの代わりに日本の字（猫）で返った回 — 見出しは落ち、残りで物ができる。
      [cat({ headword: "猫" }), tabby({ register: "common", label: "猫" })],
    ];
    for (const reader of ["ja", "en", "zh-TW"] as const) {
      for (const shape of shapes) {
        const out = finish(shape, reader);
        expect([
          reader,
          shape[0].headword,
          out.some((c) => /犬|dog|狗/.test(c.tag + c.meaning)),
        ]).toEqual([reader, shape[0].headword, false]);
        expect(out.some((c) => c.headword === "狗")).toBe(false);
      }
    }
  });

  it("米克斯（ミックス）は犬にも猫にも使う: 猫のタグ・意味なら 貓 を足す（前は 狗・「犬」を足していた）", () => {
    expect(
      finish([cat({ headword: "米克斯", meaning_ja: "雑種猫", label: "猫" }), tabby()]).map((c) => [
        c.headword,
        c.register,
        c.tag,
      ]),
    ).toEqual([
      ["貓", "common", "猫"],
      ["米克斯", "specific", "猫"],
      ["虎斑貓", "specific", "猫"],
    ]);
    expect(
      finish([
        { headword: "米克斯", meaning_ja: "雑種犬", label: "犬", category_key: "animal", group: 0 },
      ]).map((c) => [c.headword, c.tag]),
    ).toEqual([
      ["狗", "犬"],
      ["米克斯", "犬"],
    ]);
    expect(basicLevelOf("米克斯犬", "zh-TW")?.headword).toBe("狗");
    expect(basicLevelOf("米克斯貓", "zh-TW")?.headword).toBe("貓");
    expect(basicLevelOf("米克斯", "zh-TW")).toBeNull();
  });

  it("貓咪（猫の口語）に label「犬」が付いても 狗 を足さない。label「猫」なら 貓 を足し、貓咪 は口語", () => {
    expect(
      finish([cat({ headword: "貓咪", label: "犬" })]).map((c) => [c.headword, c.meaning, c.tag]),
    ).toEqual([["貓咪", "猫", "猫"]]);
    expect(finish([cat({ headword: "貓咪" })]).map((c) => [c.headword, c.register, c.tag])).toEqual(
      [
        ["貓", "common", "猫"],
        ["貓咪", "colloquial", "猫"],
      ],
    );
  });

  it("細かい名前の意味が別の物の名前なら空にする（細かい名前の意味は表が知らないので書き換えない）", () => {
    expect(
      finish([tabby({ meaning_ja: "犬", label: "犬", register: "common" })]).map((c) => [
        c.headword,
        c.meaning,
        c.tag,
      ]),
    ).toEqual([
      ["貓", "猫", "猫"],
      ["虎斑貓", "", "猫"],
    ]);
  });

  it("基本の語の意味が別の言語で返り空になった時は表の名前（日本語の表示に英語の cat）", () => {
    expect(finish([cat({ meaning_ja: "cat", label: "cat" }), tabby()])[0]).toMatchObject({
      meaning: "猫",
      tag: "猫",
    });
  });
});

describe("猫・犬のタグは表示言語ごとに表の名前（猫 / cat / 貓、犬 / dog / 狗）", () => {
  it("猫", () => {
    expect(finish([cat(), tabby()], "ja")[0].tag).toBe("猫");
    expect(
      finish(
        [cat({ meaning_ja: "cat", label: "cat" }), tabby({ meaning_ja: "tabby cat" })],
        "en",
      )[0].tag,
    ).toBe("cat");
    // 繁體中文で読む人: 見出し語と同じ字でもタグは「貓」（前は写しとして落ち、空だった）。日本・簡体の「猫」にしない。
    expect(finish([cat({ meaning_ja: "貓", label: "貓" }), tabby()], "zh-TW")[0].tag).toBe("貓");
    expect(finish([cat({ meaning_ja: "猫", label: "猫" }), tabby()], "zh-TW")[0].tag).toBe("貓");
  });

  it("犬（柴犬の写真・狗 が1つ目・意味の取り違え 狗 =「猫」）", () => {
    const dog = (over: Partial<Item> = {}): Item => ({
      headword: "狗",
      meaning_ja: "犬",
      label: "犬",
      register: "common",
      category_key: "animal",
      group: 0,
      ...over,
    });
    expect(finish([dog(), { headword: "柴犬", meaning_ja: "柴犬", group: 0 }])).toEqual([
      { headword: "狗", register: "common", meaning: "犬", tag: "犬" },
      { headword: "柴犬", register: "specific", meaning: "柴犬", tag: "犬" },
    ]);
    expect(finish([dog({ meaning_ja: "猫", label: "猫" })])[0]).toMatchObject({
      meaning: "犬",
      tag: "犬",
    });
    expect(finish([dog({ meaning_ja: "dog", label: "dog" })], "en")[0].tag).toBe("dog");
    expect(finish([dog({ meaning_ja: "狗", label: "狗" })], "zh-TW")[0].tag).toBe("狗");
    expect(
      finish([{ headword: "柴犬", meaning_ja: "柴犬", category_key: "animal", group: 0 }]).map(
        (c) => [c.headword, c.tag],
      ),
    ).toEqual([
      ["狗", "犬"],
      ["柴犬", "犬"],
    ]);
  });
});

describe("猫 と 貓、犬 と 狗（日本語の名前は見出し語の写しではない）", () => {
  it("日本の新字体の「猫」は台湾華語の見出し語にならないが、日本語で読む人のタグにはなる", () => {
    expect(isTargetHeadword("猫", "zh-TW")).toBe(false);
    expect(isTargetHeadword("貓", "zh-TW")).toBe(true);
    expect(isReaderTagText("猫", "ja", "貓")).toBe(true);
    // 表の無い道（applyObjectLabels だけ）でも「猫」は写しとして落ちない。
    expect(
      applyObjectLabels([{ headword: "貓", meaning_ja: "猫", label: "猫", group: 0 }], (t, c) =>
        isReaderTagText(t, "ja", c.headword),
      )[0].object_label,
    ).toBe("猫");
    // 本当の写し（台湾の字のまま）は日本語のタグにしない。
    expect(isReaderTagText("貓", "ja", "貓")).toBe(false);
  });

  it("犬 は台湾華語でも使う字（見出し語になる）。日本語の「犬」は 狗 のタグで、狗 の写しではない", () => {
    expect(isTargetHeadword("犬", "zh-TW")).toBe(true);
    expect(isReaderTagText("犬", "ja", "狗")).toBe(true);
    expect(rowOfHeadword("犬", "zh-TW")).toBeNull();
    expect(rowOfHeadword("狗", "zh-TW")?.headword).toBe("狗");
  });

  it("意味がどの行の物か（字の形ではなく、表に書いた言い方で見る）", () => {
    const row = (t: string, r: UiLang) => rowNamedBy(t, r, "zh-TW")?.headword ?? null;
    expect([
      row("猫", "ja"),
      row("ネコ", "ja"),
      row("子猫", "ja"),
      row("キジトラ猫", "ja"),
    ]).toEqual(["貓", "貓", "貓", "貓"]);
    expect([row("犬", "ja"), row("イヌ", "ja"), row("子犬", "ja"), row("柴犬", "ja")]).toEqual([
      "狗",
      "狗",
      "狗",
      "狗",
    ]);
    expect([row("cat", "en"), row("kitten", "en"), row("dog", "en"), row("puppy", "en")]).toEqual([
      "貓",
      "貓",
      "狗",
      "狗",
    ]);
    // 台湾の字で読む人: 「猫」（簡体・日本の字）も猫、「犬」は犬。
    expect([
      row("貓", "zh-TW"),
      row("猫", "zh-TW"),
      row("狗", "zh-TW"),
      row("犬", "zh-TW"),
    ]).toEqual(["貓", "貓", "狗", "狗"]);
    expect([row("キジトラ", "ja"), row("パンダ", "ja"), row("ホットドッグ", "ja")]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("タグの表の名前（基本の語とその口語だけ。細かい名前・表の外は null）", () => {
    expect([
      rowTagOf("貓", "ja", "zh-TW"),
      rowTagOf("貓", "en", "zh-TW"),
      rowTagOf("貓", "zh-TW", "zh-TW"),
    ]).toEqual(["猫", "cat", "貓"]);
    expect([
      rowTagOf("狗", "ja", "zh-TW"),
      rowTagOf("狗", "en", "zh-TW"),
      rowTagOf("狗", "zh-TW", "zh-TW"),
    ]).toEqual(["犬", "dog", "狗"]);
    expect(rowTagOf("貓咪", "ja", "zh-TW")).toBe("猫");
    expect(rowTagOf("虎斑貓", "ja", "zh-TW")).toBeNull();
    expect(rowTagOf("杯子", "ja", "zh-TW")).toBeNull();
    expect(rowTagOf("貓", "ja", "en")).toBeNull();
  });
});

describe("ほかの行も同じ取り違えをしない（字が同じ 花・椅子、似た字の別の物）", () => {
  it("花・椅子（日本語の名前が見出し語と同じ字）: 日本語のタグは 花・椅子、英語 flower・chair、繁體中文 花・椅子", () => {
    for (const [head, ja, en] of [
      ["花", "花", "flower"],
      ["椅子", "椅子", "chair"],
    ] as const) {
      const item = { headword: head, meaning_ja: ja, label: ja, register: "common", group: 0 };
      expect(finish([item], "ja")[0]).toMatchObject({ meaning: ja, tag: ja });
      expect(finish([{ ...item, meaning_ja: en, label: en }], "en")[0]).toMatchObject({
        meaning: en,
        tag: en,
      });
      expect(finish([item], "zh-TW")[0].tag).toBe(head);
    }
  });

  it("基本の語の意味が別の行の物の名前なら表の名前（花 =「犬」→ 花、椅子 =「花」→ 椅子、內褲 =「パン」→ 下着）", () => {
    const fixed = alignRowMeanings(
      [
        { headword: "花", meaning_ja: "犬" },
        { headword: "椅子", meaning_ja: "花" },
        { headword: "內褲", meaning_ja: "パン" },
        // 同じ物の別の書き方はそのまま（タグは表の名前）。
        { headword: "內褲", meaning_ja: "パンツ" },
        { headword: "貓", meaning_ja: "ネコ" },
        // 表の外の語は何もしない。
        { headword: "杯子", meaning_ja: "犬" },
      ],
      "ja",
      "zh-TW",
    );
    expect(fixed.map((c) => c.meaning_ja)).toEqual(["花", "椅子", "下着", "パンツ", "ネコ", "犬"]);
    expect(
      finish([{ headword: "內褲", meaning_ja: "パンツ", label: "下着", group: 0 }])[0],
    ).toMatchObject({ meaning: "パンツ", tag: "下着" });
  });

  it("似た字でも別の物は基本の語に上げない（パンダ・タヌキ・ウミネコ・オットセイ・天狗・火花・綿）", () => {
    for (const h of [
      "大熊貓",
      "小熊貓",
      "狸貓",
      "麝香貓",
      "海貓",
      "山貓",
      "海狗",
      "天狗",
      "單身狗",
      "走狗",
      "火花",
      "棉花",
      "水花",
    ]) {
      expect([h, basicLevelOf(h, "zh-TW")?.headword ?? null]).toEqual([h, null]);
    }
    for (const [h, basic] of [
      ["橘貓", "貓"],
      ["三花貓", "貓"],
      ["流浪貓", "貓"],
      ["土狗", "狗"],
      ["米克斯犬", "狗"],
      ["櫻花", "花"],
      ["玫瑰", "花"],
    ]) {
      expect([h, basicLevelOf(h, "zh-TW")?.headword]).toEqual([h, basic]);
    }
    // パンダの写真に 貓・「猫」を足さない。
    expect(
      finish([
        { headword: "大熊貓", meaning_ja: "ジャイアントパンダ", category_key: "animal", group: 0 },
      ]).map((c) => [c.headword, c.tag]),
    ).toEqual([["大熊貓", "ジャイアントパンダ"]]);
  });
});

describe("打った語の候補も同じ表で確かめる", () => {
  it("学習言語で 貓 と打って AI が意味「犬」を返しても、意味とタグは猫", () => {
    const ranked = alignRowMeanings([{ headword: "貓", meaning_ja: "犬" }], "ja", "zh-TW");
    expect(ranked[0].meaning_ja).toBe("猫");
    const tag = typedObjectLabel(
      "貓",
      "learning",
      ranked[0],
      (t, h) => isReaderTagText(t, "ja", h),
      rowTagOf(ranked[0].headword, "ja", "zh-TW"),
    );
    expect(tag).toBe("猫");
    // 表示言語で打った語（ネコ）は打った語のまま。
    expect(
      typedObjectLabel(
        "ネコ",
        "display",
        { headword: "貓", meaning_ja: "猫" },
        (t, h) => isReaderTagText(t, "ja", h),
        "猫",
      ),
    ).toBe("ネコ");
  });
});

describe("指示文: label・意味は写真の物の headword の訳（例を写さない）", () => {
  it("猫の例と、例を写さない一言が入っている", () => {
    const rule = objectLabelRule("日本語");
    expect(rule).toMatch(/キジトラの猫 → 「猫」/);
    expect(rule).toMatch(/headword そのものを日本語に訳した語/);
    expect(rule).toMatch(/上の例の語を写さない/);
    expect(BASIC_LEVEL_RULE).toMatch(/キジトラの猫 → 貓 → 虎斑貓/);
  });
});
