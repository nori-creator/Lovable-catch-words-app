import { describe, expect, it } from "vitest";
import {
  examplePatternsRule,
  pairTutorialExamples,
  pickExamplePatterns,
  redundantMeasure,
  type ExamplePattern,
} from "./example-patterns";

const p = (sentence: string, scene: string, share: number): ExamplePattern => ({
  situation: "",
  share,
  sentence,
  translation: "訳",
  scene,
  chunks: [],
  scene_fits: true,
});

describe("量詞と見出し語の字を重ねない（オーナー報告 2026-10-15 花束: 送了一束花束）", () => {
  it("数・指示詞＋量詞＋見出し語で、見出し語がその量詞の字を含む文を見つける", () => {
    expect(redundantMeasure("他在畢業典禮上送了一束花束給女朋友。", "花束")).toBe(true);
    expect(redundantMeasure("這束花束看起來非常新鮮漂亮。", "花束")).toBe(true);
    expect(redundantMeasure("我想要一杯杯子。", "杯子")).toBe(true);
    expect(redundantMeasure("請給我兩封信封。", "信封")).toBe(true);
    // 重ならない言い方
    expect(redundantMeasure("他送了女朋友一個花束。", "花束")).toBe(false);
    expect(redundantMeasure("這個花束好漂亮！", "花束")).toBe(false);
    expect(redundantMeasure("我買了一個杯子。", "杯子")).toBe(false);
    expect(redundantMeasure("花束很漂亮。", "花束")).toBe(false);
    // 1字の語・漢字でない言語は見ない
    expect(redundantMeasure("一束束", "束")).toBe(false);
    expect(redundantMeasure("I bought a bunch of flowers.", "flowers")).toBe(false);
  });

  it("例文のパターンから重ね言葉の文を落とし、自然な文を1つ目にする", () => {
    const picked = pickExamplePatterns(
      [
        p("他在畢業典禮上送了一束花束給女朋友。", "卒業式で恋人に花を渡すとき", 70),
        p("這個花束好漂亮，是誰送的？", "家で花束を見つけて聞くとき", 30),
      ],
      { headword: "花束", language: "zh-TW", readerLang: "ja" },
    );
    expect(picked.map((e) => e.sentence)).toEqual(["這個花束好漂亮，是誰送的？"]);
  });

  it("指示文に重ね言葉の決まりがある", () => {
    const rule = examplePatternsRule({
      headword: "花束",
      targetName: "台湾華語",
      nl: "日本語",
      max: 3,
      levelRule: "",
      sourceRule: "",
      chunkRoles: "S / V / O",
    });
    expect(rule).toMatch(/重ね言葉にしない/);
    expect(rule).toMatch(/✗「送了一束花束」「這束花束」/);
  });
});

describe("チュートリアルのカードの例文も場面の札と組（2026-10-15）", () => {
  type TutorialCard = {
    example_sentence: string;
    example_translation: string;
    extras: {
      example_scene?: string;
      example_scene_for?: string;
      example_chunks?: unknown[];
      examples_extra?: Array<{
        zh: string;
        ja: string;
        scene: string;
        scene_for?: string;
        chunks: unknown[];
      }>;
    };
  };
  const card = (sentence: string, scene: string, extra: Array<[string, string]>): TutorialCard => ({
    example_sentence: sentence,
    example_translation: "訳",
    extras: {
      example_scene: scene,
      examples_extra: extra.map(([zh, sc]) => ({ zh, ja: "訳", scene: sc, chunks: [] })),
    },
  });

  it("札のある文に目印（example_scene_for / scene_for）を付ける", () => {
    const out = pairTutorialExamples(
      card("我買了一個花束。", "花屋で", [
        ["這個花束好漂亮。", "もらった時"],
        ["花束在桌上。", ""],
      ]),
      "花束",
    );
    expect(out.extras.example_scene_for).toBe("我買了一個花束。");
    expect(out.extras.examples_extra?.map((e) => [e.zh, e.scene_for ?? null])).toEqual([
      ["這個花束好漂亮。", "這個花束好漂亮。"],
      ["花束在桌上。", null],
    ]);
  });

  it("重ね言葉の追加の例文は落とし、メインが重ね言葉なら重ならない追加の例文を上げる", () => {
    const out = pairTutorialExamples(
      card("他送了一束花束給我。", "誕生日に", [
        ["這束花束很香。", "香りをかいで"],
        ["這個花束是你買的嗎？", "家族に聞く時"],
      ]),
      "花束",
    );
    expect(out.example_sentence).toBe("這個花束是你買的嗎？");
    expect(out.extras.example_scene).toBe("家族に聞く時");
    expect(out.extras.example_scene_for).toBe("這個花束是你買的嗎？");
    expect(out.extras.examples_extra).toEqual([]);
  });
});
