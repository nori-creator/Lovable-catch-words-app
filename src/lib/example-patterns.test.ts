import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PROMPT_VERSION,
  ExamplePatternSchema,
  alignExampleExtras,
  applyExamplePatterns,
  exampleMatchesSentence,
  examplePatternsRule,
  guardExampleColumns,
  pickExamplePatterns,
  type ExamplePattern,
} from "./example-patterns";
import { CardReplySchema } from "./card-schema";
import { fillEmptySharedExtras } from "./shared-word-guard";
import { sectionNeedsFill } from "./card-sections";
import { normalizeExtras } from "./extras";

const p = (o: Partial<ExamplePattern>): ExamplePattern => ExamplePatternSchema.parse(o);

const zhOpts = { headword: "眼鏡", language: "zh-TW", readerLang: "ja" };

describe("pickExamplePatterns", () => {
  it("よく使う順に並べ、札と文を組のまま返す", () => {
    const out = pickExamplePatterns(
      [
        p({
          share: 20,
          sentence: "你的眼鏡好好看！",
          scene: "友達の新しいメガネをほめるとき",
          translation: "そのメガネかわいいね！",
        }),
        p({
          share: 60,
          sentence: "我的眼鏡不見了。",
          scene: "メガネが見つからず家で探しているとき",
          translation: "メガネがなくなった。",
        }),
      ],
      zhOpts,
    );
    expect(out.map((e) => e.sentence)).toEqual(["我的眼鏡不見了。", "你的眼鏡好好看！"]);
    expect(out[0].scene).toBe("メガネが見つからず家で探しているとき");
  });

  it("自己点検が false・札が空・見出し語の無い文・同じ文は落とす", () => {
    const out = pickExamplePatterns(
      [
        p({
          share: 90,
          sentence: "我戴眼鏡。",
          scene: "友達が眼鏡をしていないことに気づいたとき",
          scene_fits: false,
        }),
        p({ share: 80, sentence: "我的眼鏡呢？", scene: "" }),
        p({ share: 70, sentence: "我看不清楚。", scene: "遠くの字が読めないとき" }),
        p({ share: 60, sentence: "我的眼鏡不見了。", scene: "メガネを探しているとき" }),
        p({ share: 50, sentence: "我的眼鏡不見了！", scene: "メガネを探しているとき" }),
      ],
      zhOpts,
    );
    expect(out.map((e) => e.sentence)).toEqual(["我的眼鏡不見了。"]);
  });

  it("scene_fits が無い（確かめていない）だけでは落とさない・文字列の false は落とす", () => {
    expect(
      pickExamplePatterns(
        [p({ sentence: "我的眼鏡不見了。", scene: "メガネを探しているとき" })],
        zhOpts,
      ),
    ).toHaveLength(1);
    expect(
      pickExamplePatterns(
        [
          p({
            sentence: "我的眼鏡不見了。",
            scene: "メガネを探しているとき",
            scene_fits: "false" as never,
          }),
        ],
        zhOpts,
      ),
    ).toHaveLength(0);
  });

  it("上限を守る（追加の例文を頼まない呼び出しは1つ）", () => {
    const many = [1, 2, 3, 4, 5].map((n) =>
      p({ share: n, sentence: `眼鏡${n}號在這裡。`, scene: `場面${n}のとき` }),
    );
    expect(pickExamplePatterns(many, { ...zhOpts, max: 1 })).toHaveLength(1);
    expect(pickExamplePatterns(many, zhOpts)).toHaveLength(4);
  });

  it("読む人の言語でない札・訳は使わない", () => {
    const out = pickExamplePatterns(
      [p({ sentence: "我的眼鏡不見了。", scene: "找眼鏡的時候", translation: "我的眼鏡不見了。" })],
      zhOpts,
    );
    expect(out).toHaveLength(0);
  });

  it("英語は活用で形が変わるので、見出し語を含むかは見ない", () => {
    const out = pickExamplePatterns(
      [p({ sentence: "I went home early.", scene: "友達に昨日のことを話すとき" })],
      { headword: "go", language: "en", readerLang: "ja" },
    );
    expect(out).toHaveLength(1);
  });
});

describe("applyExamplePatterns", () => {
  const card: {
    example_sentence: string;
    example_translation: string;
    extras: Record<string, unknown>;
  } = { example_sentence: "", example_translation: "", extras: { usage_context: "x" } };
  const picked = [
    {
      sentence: "我的眼鏡不見了。",
      translation: "メガネがなくなった。",
      scene: "メガネを探しているとき",
      chunks: [],
    },
    {
      sentence: "你的眼鏡好好看！",
      translation: "そのメガネいいね！",
      scene: "友達のメガネをほめるとき",
      chunks: [],
    },
  ];

  it("1つ目をメインの例文に、残りを追加の例文に写し、札に文の目印を付ける", () => {
    const out = applyExamplePatterns(card, picked, { withExtra: true });
    expect(out.example_sentence).toBe("我的眼鏡不見了。");
    expect(out.extras.example_scene).toBe("メガネを探しているとき");
    expect(out.extras.example_scene_for).toBe("我的眼鏡不見了。");
    expect(out.extras.example_v).toBe(EXAMPLE_PROMPT_VERSION);
    expect(out.extras.examples_extra).toEqual([
      {
        zh: "你的眼鏡好好看！",
        ja: "そのメガネいいね！",
        scene: "友達のメガネをほめるとき",
        chunks: [],
      },
    ]);
    expect(out.extras.example_pattern_count).toBe(2);
    expect(out.extras.usage_context).toBe("x");
  });

  it("追加の例文を頼まない呼び出しでは examples_extra と数を書かない", () => {
    const out = applyExamplePatterns(card, picked.slice(0, 1), { withExtra: false });
    expect(out.extras).not.toHaveProperty("examples_extra");
    expect(out.extras).not.toHaveProperty("example_pattern_count");
  });

  it("1つも残らなければカードはそのまま", () => {
    expect(applyExamplePatterns(card, [], { withExtra: true })).toBe(card);
  });

  it("1つの場面だけの語は、追加の例文の節を作り直しに行かない", () => {
    const out = applyExamplePatterns(card, picked.slice(0, 1), { withExtra: true });
    expect(out.extras.examples_extra).toEqual([]);
    expect(
      sectionNeedsFill("examples_extra", {
        headword: "眼鏡",
        language: "zh-TW",
        extras: normalizeExtras(out.extras),
      }),
    ).toBe(false);
  });
});

describe("文と札を組で扱う（2026-10-15 眼鏡）", () => {
  const fresh = {
    example_scene: "メガネを探しているとき",
    example_chunks: [{ text: "眼鏡", pos: "N" }],
    example_scene_for: "我的眼鏡不見了。",
    example_v: 2,
    usage_context: "毎日",
  };

  it("共有の行の文が別の文なら、札・パーツは埋めない（ほかの項目は埋める）", () => {
    const filled = fillEmptySharedExtras(
      {
        usage_context: "",
        example_scene: "",
        related_words: [{ word: "a", kind: "rel", note: "n" }],
      },
      alignExampleExtras(fresh, "我戴眼鏡。"),
    );
    expect(filled?.example_scene).toBe("");
    expect(filled).not.toHaveProperty("example_scene_for");
    expect(filled?.usage_context).toBe("毎日");
  });

  it("同じ文（句読点の違いだけ）なら札も埋める", () => {
    expect(alignExampleExtras(fresh, "我的眼鏡不見了！")).toBe(fresh);
  });

  it("目印の無い古い extras は触らない", () => {
    const legacy = { example_scene: "昔の札" };
    expect(alignExampleExtras(legacy, "我戴眼鏡。")).toBe(legacy);
  });

  it("訳だけを別の文の訳で埋めない", () => {
    expect(
      guardExampleColumns(
        { example_translation: "メガネがなくなった。" },
        { example_sentence: "我戴眼鏡。" },
        { example_sentence: "我的眼鏡不見了。" },
      ),
    ).toEqual({});
    // 文も一緒に埋める回・文がまだ無い回は、そのまま
    expect(
      guardExampleColumns(
        { example_sentence: "我的眼鏡不見了。", example_translation: "メガネがなくなった。" },
        { example_sentence: "" },
        { example_sentence: "我的眼鏡不見了。" },
      ),
    ).toHaveProperty("example_translation");
    expect(exampleMatchesSentence("我的眼鏡不見了。", "")).toBe(true);
  });
});

describe("examplePatternsRule / CardReplySchema", () => {
  const rule = (max: number) =>
    examplePatternsRule({
      headword: "眼鏡",
      targetName: "台湾華語",
      nl: "日本語",
      max,
      levelRule: "例文のレベル: TOCFL 1",
      sourceRule: "例文の作り方",
      chunkRoles: "S / V / O",
    });

  it("パターン → 一文 → その文のための札 → 確かめ の順に頼み、数を水増ししない", () => {
    const r = rule(4);
    expect(r).toMatch(/1〜4個/);
    expect(r).toMatch(/数を合わせるために場面を作らない/);
    expect(r).toMatch(/scene_fits/);
    expect(r.indexOf("sentence")).toBeLessThan(r.indexOf("scene を書く"));
    expect(r).toMatch(/例文のレベル: TOCFL 1/);
    expect(rule(1)).toMatch(/いちばんよく使うパターン1つだけ/);
  });

  it("返事の example_patterns が壊れていてもカードは落ちない", () => {
    const card = CardReplySchema.parse({ meaning_ja: "メガネ", example_patterns: "壊れた" });
    expect(card.example_patterns).toEqual([]);
    const ok = CardReplySchema.parse({
      meaning_ja: "メガネ",
      example_patterns: [
        { sentence: "我的眼鏡不見了。", scene: "x", share: "60", scene_fits: true },
      ],
    });
    expect(ok.example_patterns[0].share).toBe(60);
  });
});
