import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AiUsagePatternSchema,
  ExtrasSchema,
  MAX_USAGE_PATTERNS,
  USAGE_PROMPT_VERSION,
  type AiUsagePattern,
} from "./extras";
import {
  asExamplePatterns,
  chunkInSentence,
  gateUsagePatterns,
  legacyFieldsFromPatterns,
  usagePatternsJsonExample,
  usagePatternsRule,
  usageFieldsFromPatterns,
  USAGE_PATTERNS_KEYS,
} from "./usage-patterns";
import { CardReplySchema } from "./card-schema";

/**
 * **使い方パターン = 場面 ＋ 公式 ＋ 例文**（オーナー要望 2026-10-23）。門（AI を呼ばない）・結び付き・並び・
 * 今までの欄への写しを固定する。公式の門そのもの（刷子「拿刷子刷牙」ほか）は `chunk-quality.test.ts`、
 * 例文の確かめは `example-patterns.test.ts`。
 */

type Part = {
  text: string;
  pos: string;
  slot?: boolean;
  ja?: string;
  alts?: { text: string; ja: string }[];
};
const parts = (...ps: Array<[string, string] | Part>): Part[] =>
  ps.map((p) => (Array.isArray(p) ? { text: p[0], pos: p[1], ja: "" } : p));
const words = (...ws: string[]) => ws.map((text) => ({ text, pos: "" }));

/** AI の返事のパターン1つ（欠けた欄は既定）。 */
function ai(o: {
  kind?: "action" | "state" | "phrase";
  share?: number;
  scene?: string;
  scene_general?: boolean;
  parts: Part[];
  ja: string;
  fits?: boolean;
  sentence: string;
  translation?: string;
  chunks?: Array<{ text: string; pos: string }>;
  scene_fits?: boolean;
  note?: string;
}): AiUsagePattern {
  return AiUsagePatternSchema.parse({
    kind: o.kind ?? "action",
    share: o.share ?? 0,
    situation: "",
    scene: o.scene ?? "その物を使う時",
    scene_general: o.scene_general,
    chunk: { parts: o.parts, ja: o.ja, fits: o.fits, why: "" },
    example: {
      sentence: o.sentence,
      translation: o.translation ?? "訳です",
      chunks: o.chunks ?? [],
      scene_fits: o.scene_fits,
    },
    note: o.note ?? "",
  });
}

const CTX = {
  headword: "馬桶",
  language: "zh-TW",
  readerLang: "ja",
  meaning: "便器",
  measureWords: [],
};

/** 動詞ごとの別々の場面と文（場面・文がよく似た物は同じパターンに数えられる）。 */
const SCENES: Record<string, [scene: string, sentence: string]> = {
  沖: ["トイレを使った後", "用完記得要沖馬桶喔。"],
  刷: ["週末の掃除で", "我週末會把馬桶刷乾淨。"],
  洗: ["長く放っておいた汚れに気づいて", "這間廁所的馬桶好久沒洗了。"],
  修: ["水漏れを直してもらう時", "水電師傅明天來修馬桶。"],
  換: ["リフォームの話をする時", "房東說下個月要換新的馬桶。"],
};

/** 馬桶 のパターン（オーナーの参考図 2026-10-23 の物）。 */
const STUCK = ai({
  kind: "state",
  share: 50,
  scene: "トイレが詰まった・流れない時",
  parts: [
    { text: "馬桶", pos: "N", ja: "トイレ" },
    {
      text: "塞住了",
      pos: "Vp",
      slot: true,
      ja: "詰まった",
      alts: [
        { text: "不通", ja: "流れない" },
        { text: "壞了", ja: "壊れた" },
      ],
    },
  ],
  ja: "トイレが詰まった",
  sentence: "糟糕，馬桶塞住了，水完全沖不下去！",
  translation: "やばい、トイレが詰まって水が全然流れない！",
  chunks: words("糟糕", "馬桶", "塞住了", "水", "完全", "沖", "不", "下去"),
  note: "塞住了は詰まって動かない状態。水が流れないだけなら不通、壊れて使えないなら壞了。",
});
const FLUSH = ai({
  kind: "action",
  share: 30,
  scene: "トイレを使った後",
  parts: parts(["沖", "V"], ["馬桶", "N"]),
  ja: "トイレを流す",
  sentence: "用完記得要沖馬桶喔。",
  translation: "使ったら流すのを忘れないでね。",
  // 別の文を分けた物（直した文の物）は使わない。
  chunks: words("用完", "記得", "沖", "馬桶"),
});
const SCRUB = ai({
  kind: "action",
  share: 15,
  scene: "トイレを掃除する時",
  parts: parts(["刷", "V"], ["馬桶", "N"]),
  ja: "トイレを磨く",
  sentence: "我週末會用馬桶刷刷馬桶。",
  translation: "週末にブラシでトイレを磨くよ。",
});

describe("gateUsagePatterns — 通る物（馬桶）", () => {
  const g = gateUsagePatterns([FLUSH, STUCK, SCRUB], CTX);

  it("share の大きい順に並べ、保存の形（zh/ja・chunk_in_example・chunks）に写す", () => {
    expect(g.dropped).toEqual([]);
    expect(g.kept.map((p) => p.chunk.parts.map((x) => x.text).join("＋"))).toEqual([
      "馬桶＋塞住了",
      "沖＋馬桶",
      "刷＋馬桶",
    ]);
    const [stuck, flush] = g.kept;
    expect(stuck).toMatchObject({
      kind: "state",
      share: 50,
      scene: "トイレが詰まった・流れない時",
      example: {
        zh: "糟糕，馬桶塞住了，水完全沖不下去！",
        ja: "やばい、トイレが詰まって水が全然流れない！",
        chunk_in_example: true,
      },
      note: "塞住了は詰まって動かない状態。水が流れないだけなら不通、壊れて使えないなら壞了。",
    });
    // 文を語に分けた物は、つなぐと文に戻る時だけ。
    expect(stuck.example.chunks.map((c) => c.text)).toEqual([
      "糟糕",
      "馬桶",
      "塞住了",
      "水",
      "完全",
      "沖",
      "不",
      "下去",
    ]);
    expect(flush.example.chunks).toEqual([]);
    // 自己点検の欄は保存しない。入れ替えの札（候補2つ以上・程度の語でない）は残る。
    expect(stuck.chunk).not.toHaveProperty("fits");
    expect(stuck.chunk.parts[1].slot).toBe(true);
    expect(stuck.chunk.parts[1].alts).toHaveLength(2);
    // 保存の形そのもの（`ExtrasSchema` を通しても欠けない）。
    const ex = ExtrasSchema.parse({ usage_patterns: g.kept, usage_v: USAGE_PROMPT_VERSION });
    expect(ex.usage_patterns).toEqual(g.kept);
    expect(ex.usage_v).toBe(USAGE_PROMPT_VERSION);
  });

  it("公式の字が例文に無ければ、パターンは残して chunk_in_example: false", () => {
    const g2 = gateUsagePatterns(
      [
        ai({
          parts: parts(["沖", "V"], ["馬桶", "N"]),
          ja: "トイレを流す",
          sentence: "馬桶要記得沖。",
        }),
      ],
      CTX,
    );
    expect(g2.kept).toHaveLength(1);
    expect(g2.kept[0].example.chunk_in_example).toBe(false);
  });
});

describe("gateUsagePatterns — 落とす物", () => {
  it("公式が門で落ちればパターンごと落ちる（理由は chunk_…）", () => {
    const g = gateUsagePatterns(
      [
        // 見出し語が1つの札として入っていない。
        ai({ parts: parts(["沖", "V"], ["馬桶刷", "N"]), ja: "x", sentence: "我沖馬桶。" }),
        // 自己点検 false。
        ai({
          parts: parts(["沖", "V"], ["馬桶", "N"]),
          ja: "トイレを流す",
          fits: false,
          sentence: "我沖馬桶。",
        }),
        // 量詞の型。
        ai({ parts: parts(["一個", "M"], ["馬桶", "N"]), ja: "トイレ1つ", sentence: "一個馬桶。" }),
        // 訳が無い（日本語で読む人）。
        ai({ parts: parts(["沖", "V"], ["馬桶", "N"]), ja: "", sentence: "我沖馬桶。" }),
      ],
      CTX,
    );
    expect(g.kept).toEqual([]);
    expect(g.dropped.map((d) => d.reason)).toEqual([
      "chunk_headword_not_token",
      "chunk_self_check",
      "chunk_measure_word",
      "chunk_no_translation",
    ]);
  });

  it("例文が使えない（見出し語が無い・学習言語でない・札が無い・scene_fits false・重ね言葉）", () => {
    const base = { parts: parts(["沖", "V"], ["馬桶", "N"]), ja: "トイレを流す" };
    const g = gateUsagePatterns(
      [
        ai({ ...base, sentence: "我沖廁所。" }),
        ai({ ...base, sentence: "トイレを流す。" }),
        ai({ ...base, sentence: "我沖馬桶。", scene: "" }),
        ai({ ...base, sentence: "我沖馬桶。", scene: "沖馬桶的時候" }),
        ai({ ...base, sentence: "我沖馬桶。", scene_fits: false }),
        ai({ ...base, sentence: "" }),
      ],
      CTX,
    );
    expect(g.kept).toEqual([]);
    expect(g.dropped.map((d) => d.reason)).toEqual([
      "example_headword_missing",
      "example_not_target_language",
      "example_scene_empty",
      "example_scene_empty",
      "example_scene_fits",
      "example_empty",
    ]);
  });

  it("場面の自己点検（scene_general）が false — 例文の文脈を書いた場面 — は落とす", () => {
    const g = gateUsagePatterns([{ ...STUCK, scene_general: false }], CTX);
    expect(g.kept).toEqual([]);
    expect(g.dropped[0].reason).toBe("scene_specific");
  });

  it("同じ公式・似た例文の2つ目は落とす。場面が例文の訳とそっくりなら記録に残す（落とさない）", () => {
    const g = gateUsagePatterns(
      [
        FLUSH,
        {
          ...FLUSH,
          scene: "トイレを出る時",
          example: { ...FLUSH.example, sentence: "記得要沖馬桶。" },
        },
        ai({
          parts: parts(["沖掉", "V"], ["馬桶", "N"]),
          ja: "トイレを流し切る",
          sentence: "用完記得要沖馬桶喔！",
          scene: "トイレを出る時",
        }),
        ai({
          parts: parts(["洗", "V"], ["馬桶", "N"]),
          ja: "トイレを洗う",
          sentence: "我在洗馬桶。",
          translation: "トイレを洗っている",
          scene: "トイレを洗っているとき",
        }),
      ],
      CTX,
    );
    expect(g.kept.map((p) => p.example.zh)).toEqual(["用完記得要沖馬桶喔。", "我在洗馬桶。"]);
    expect(g.dropped.map((d) => d.reason)).toEqual(["duplicate_chunk", "duplicate_example"]);
    expect(g.warnings).toEqual([{ text: "洗馬桶", reason: "scene_like_translation" }]);
  });

  it("読む人の言語でない訳・ポイントは空にする", () => {
    const g = gateUsagePatterns(
      [
        {
          ...STUCK,
          note: "塞住了表示堵住不動的狀態",
          example: { ...STUCK.example, translation: "馬桶塞住了水沖不下去" },
        },
      ],
      CTX,
    );
    expect(g.kept[0].example.ja).toBe("");
    expect(g.kept[0].note).toBe("");
  });

  it("上限は MAX_USAGE_PATTERNS（4）", () => {
    // 場面・文がよく似たパターンは1つに数える（`nearDuplicateExample`）ので、どれも別の場面にする。
    const many = Object.entries(SCENES).map(([v, [scene, sentence]], i) =>
      ai({
        share: 50 - i,
        parts: parts([v, "V"], ["馬桶", "N"]),
        ja: `トイレを${v}する`,
        sentence,
        scene,
      }),
    );
    const g = gateUsagePatterns(many, CTX);
    expect(g.kept).toHaveLength(MAX_USAGE_PATTERNS);
    expect(g.dropped).toEqual([{ text: "換馬桶", reason: "over_limit" }]);
  });
});

describe("gateUsagePatterns — 並び", () => {
  it("同じ kind が3つ以上なら、3つ目以降を share に関係なく後ろへ（種類が偏らないため）", () => {
    const act = (v: string, share: number) =>
      ai({
        kind: "action",
        share,
        parts: parts([v, "V"], ["馬桶", "N"]),
        ja: `トイレを${v}する`,
        sentence: SCENES[v][1],
        scene: SCENES[v][0],
      });
    const g = gateUsagePatterns(
      [act("沖", 60), act("刷", 50), act("洗", 40), { ...STUCK, share: 30 }],
      CTX,
    );
    expect(g.kept.map((p) => p.chunk.parts.map((x) => x.text).join(""))).toEqual([
      "沖馬桶",
      "刷馬桶",
      "馬桶塞住了",
      "洗馬桶",
    ]);
  });

  const BOBA = {
    headword: "珍珠奶茶",
    language: "zh-TW",
    readerLang: "ja",
    meaning: "タピオカミルクティー",
  };
  const drink = ai({
    share: 90,
    parts: parts(["喝", "V"], ["珍珠奶茶", "N"]),
    ja: "タピオカミルクティーを飲む",
    sentence: "我想喝珍珠奶茶。",
    scene: "タピオカを飲む時",
  });
  const order = ai({
    share: 40,
    kind: "phrase",
    parts: parts(["珍珠奶茶", "N"], ["微糖少冰", "N"]),
    ja: "タピオカミルクティー、微糖で氷少なめ",
    sentence: "我要一杯珍珠奶茶微糖少冰。",
    scene: "ドリンクスタンドで注文する時",
  });
  const point = ai({
    share: 30,
    parts: parts(["點", "V"], ["珍珠奶茶", "N"]),
    ja: "タピオカミルクティーを頼む",
    sentence: "幫我點一杯珍珠奶茶。",
    scene: "誰かに注文を頼む時",
  });

  it("弱い相手（喝＋珍珠奶茶）は、強い公式が2つ以上あれば落とす（generic_partner）", () => {
    const g = gateUsagePatterns([drink, order, point], BOBA);
    expect(g.kept.map((p) => p.chunk.parts.map((x) => x.text).join(""))).toEqual([
      "珍珠奶茶微糖少冰",
      "點珍珠奶茶",
    ]);
    expect(g.dropped).toEqual([{ text: "喝珍珠奶茶", reason: "generic_partner" }]);
  });

  it("強い公式が1つしか無ければ、弱い相手は落とさず最後に残す（share が大きくても）", () => {
    const g = gateUsagePatterns([drink, order], BOBA);
    expect(g.kept.map((p) => p.chunk.parts.map((x) => x.text).join(""))).toEqual([
      "珍珠奶茶微糖少冰",
      "喝珍珠奶茶",
    ]);
    expect(g.dropped).toEqual([]);
  });
});

describe("chunkInSentence（公式の字が例文に続けて入っているか）", () => {
  it("そのままの字", () => {
    expect(chunkInSentence({ parts: words("馬桶", "塞住了") }, "糟糕，馬桶塞住了！", "zh-TW")).toBe(
      "馬桶塞住了",
    );
    expect(chunkInSentence({ parts: words("沖", "馬桶") }, "馬桶要記得沖。", "zh-TW")).toBeNull();
  });

  it("入れ替えの札は、どの候補に替えた形でもよい", () => {
    const chunk = {
      parts: [
        { text: "馬桶", pos: "N" },
        {
          text: "塞住了",
          pos: "Vp",
          slot: true,
          alts: [
            { text: "不通", ja: "" },
            { text: "壞了", ja: "" },
          ],
        },
      ],
    };
    expect(chunkInSentence(chunk, "馬桶不通了，怎麼辦？", "zh-TW")).toBe("馬桶不通");
    // 続けて入っていない（馬桶又不通了）物は結び付かない。
    expect(chunkInSentence(chunk, "馬桶又不通了。", "zh-TW")).toBeNull();
    expect(chunkInSentence(chunk, "我家的馬桶壞了。", "zh-TW")).toBe("馬桶壞了");
    expect(chunkInSentence(chunk, "馬桶很乾淨。", "zh-TW")).toBeNull();
  });

  it("台湾華語の「名詞＋状態動詞」は 很 を補った形でも探す（滷味＋入味）", () => {
    expect(
      chunkInSentence(
        { parts: parts(["滷味", "N"], ["入味", "Vs"]) },
        "這家的滷味很入味。",
        "zh-TW",
      ),
    ).toBe("滷味很入味");
  });

  it("英語は空白で結び、大小は見ない。区切りの札（＋）は無視する", () => {
    expect(
      chunkInSentence({ parts: words("put on", "socks") }, "I Put on socks every day.", "en"),
    ).toBe("Put on socks");
    expect(chunkInSentence({ parts: words("沖", "＋", "馬桶") }, "記得沖馬桶。", "zh-TW")).toBe(
      "沖馬桶",
    );
    expect(chunkInSentence({ parts: [] }, "記得沖馬桶。", "zh-TW")).toBeNull();
  });
});

describe("legacyFieldsFromPatterns（今までの欄を書き続ける）", () => {
  const kept = gateUsagePatterns([STUCK, FLUSH], CTX).kept;

  it("1つ目のパターンの例文がメインの例文、2つ目から追加の例文。公式の写しが usage_chunks", () => {
    const f = legacyFieldsFromPatterns(kept, { headword: "馬桶", withExtra: true });
    expect(f.example_sentence).toBe("糟糕，馬桶塞住了，水完全沖不下去！");
    expect(f.example_translation).toBe("やばい、トイレが詰まって水が全然流れない！");
    expect(f.extras).toMatchObject({
      example_scene: "トイレが詰まった・流れない時",
      example_scene_for: "糟糕，馬桶塞住了，水完全沖不下去！",
      example_chunks: kept[0].example.chunks,
      example_pattern_count: 2,
      usage_v: USAGE_PROMPT_VERSION,
      usage_patterns: kept,
      usage_chunks: [kept[0].chunk, kept[1].chunk],
    });
    expect(f.extras.example_chunks).toHaveLength(8);
    expect(f.extras.examples_extra).toEqual([
      {
        zh: "用完記得要沖馬桶喔。",
        ja: "使ったら流すのを忘れないでね。",
        scene: "トイレを使った後",
        scene_for: "用完記得要沖馬桶喔。",
        chunks: [],
      },
    ]);
    expect(typeof f.extras.example_v).toBe("number");
    expect(usageFieldsFromPatterns(kept).usage_chunks).toEqual(f.extras.usage_chunks);
  });

  it("追加の例文を頼まない呼び出しでは examples_extra と数を書かない", () => {
    const f = legacyFieldsFromPatterns(kept, { headword: "馬桶", withExtra: false });
    expect(f.example_sentence).toBe("糟糕，馬桶塞住了，水完全沖不下去！");
    expect(f.extras).not.toHaveProperty("examples_extra");
    expect(f.extras).not.toHaveProperty("example_pattern_count");
  });

  it("**決まったメインの例文は変えない**: パターンの例文は全部追加の例文へ（同じ文・似た文は落とす）", () => {
    const f = legacyFieldsFromPatterns(kept, {
      headword: "馬桶",
      withExtra: true,
      fixedMain: {
        sentence: "我家的馬桶壞了。",
        label: null,
        translation: "うちのトイレが壊れた。",
      },
    });
    expect(f.example_sentence).toBe("我家的馬桶壞了。");
    expect(f.example_translation).toBe("うちのトイレが壊れた。");
    expect(f.extras).not.toHaveProperty("example_scene");
    expect((f.extras.examples_extra as Array<{ zh: string }>).map((e) => e.zh)).toEqual([
      "糟糕，馬桶塞住了，水完全沖不下去！",
      "用完記得要沖馬桶喔。",
    ]);
    expect(f.extras.example_pattern_count).toBe(3);
    expect(f.extras.usage_chunks).toHaveLength(2);
    // 決まった文と同じ文のパターンは追加の例文に入らない。
    const same = legacyFieldsFromPatterns(kept, {
      headword: "馬桶",
      withExtra: true,
      fixedMain: {
        sentence: "用完記得要沖馬桶喔。",
        label: { scene: "トイレを使った後", translation: "", chunks: [], sameAsMain: [] },
      },
    });
    expect((same.extras.examples_extra as Array<{ zh: string }>).map((e) => e.zh)).toEqual([
      "糟糕，馬桶塞住了，水完全沖不下去！",
    ]);
    expect(same.extras.example_scene).toBe("トイレを使った後");
    expect(same.extras.example_scene_for).toBe("用完記得要沖馬桶喔。");
  });

  it("パターンが1つも無ければ例文の欄は書かない（公式は空の配列）", () => {
    const f = legacyFieldsFromPatterns([], { headword: "馬桶", withExtra: true });
    expect(f).not.toHaveProperty("example_sentence");
    expect(f.extras).toEqual({
      usage_patterns: [],
      usage_v: USAGE_PROMPT_VERSION,
      usage_chunks: [],
    });
  });
});

describe("usagePatternsRule（指示文）と返事の形", () => {
  const rule = usagePatternsRule({
    headword: "馬桶",
    code: "zh-TW",
    targetName: "台湾華語",
    nl: "日本語",
    meaningHint: "便器",
    levelGoal: "TOCFL-3",
    levelRule: "例文のレベル: TOCFL 1",
    sourceRule: "例文の作り方",
    chunkRoles: "S / V / O",
    learnerL1: "日本語話者",
    l1Gram: "語順の注意",
    sceneMax: 24,
  });

  it("公式 → 場面 → 例文 → ポイント の順に頼む（場面は公式から書く）", () => {
    const at = (s: string) => {
      const i = rule.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(at("先に公式（chunk）を決める")).toBeLessThan(at("次に場面（scene）を公式から書く"));
    expect(at("次に場面（scene）を公式から書く")).toBeLessThan(at("最後に例文（example）"));
    expect(at("最後に例文（example）")).toBeLessThan(at("5. **note**"));
  });

  it("オーナーの決まり（2026-10-23）が入っている", () => {
    for (const must of [
      "2〜4 個",
      "数を揃えるためにパターンを作らない",
      "同じ kind ばかりにしない",
      "程度の語（很・超・非常・有點・蠻）は slot にしない",
      "学ぶ語そのものは決して slot にしない",
      "2〜3パーツが基本",
      "別の100の名詞にも当てはまるか",
      "吹＋電風扇、沖＋馬桶、搭＋手扶梯",
      "馬桶＋塞住了 / 沖＋馬桶",
      "一人称のセリフ",
      "請問馬桶在哪裡？",
      "公式の字をそのまま続けて含める",
      "12〜28 字",
      "✗「家の掃除の分担を話す時」✗「困って」✗「注意・お願い」",
      "日本語で24字以内",
      "scene_general",
      "scene_fits",
      "fits",
      "chunks は sentence を語に分けた",
      "S / V / O",
      "例文のレベル: TOCFL 1",
      "例文の作り方",
      "便器",
      "TOCFL-3",
      "日本語話者が崩しやすい型",
      "語順の注意",
      "塞住了は詰まって動かない状態",
    ]) {
      expect(rule, must).toContain(must);
    }
    // 外した見本（どの名詞にも付く型）は戻さない。
    expect(rule).not.toContain("芒果＋很＋甜");
  });

  it("返事の鍵の一覧と見本の JSON は同じ欄を持ち、`CardReplySchema` が受ける", () => {
    for (const k of [
      "kind",
      "share",
      "situation",
      "scene",
      "scene_general",
      "chunk",
      "example",
      "note",
    ]) {
      expect(USAGE_PATTERNS_KEYS).toContain(k);
      expect(usagePatternsJsonExample("台湾華語", "日本語")).toContain(`"${k}"`);
    }
    const parsed = CardReplySchema.parse({ meaning_ja: "便器", usage_patterns: [STUCK] });
    expect(parsed.usage_patterns[0].chunk.parts[1].alts).toHaveLength(2);
    expect(
      CardReplySchema.parse({ meaning_ja: "便器", usage_patterns: "壊れた" }).usage_patterns,
    ).toEqual([]);
  });

  it("生成と作り直しが同じ指示文・同じ門を通り、例文の配列（example_patterns）と公式（usage_chunks）は頼まない", () => {
    const ai = fs.readFileSync(path.join(__dirname, "ai.functions.ts"), "utf8");
    expect(ai.match(/usagePatternsRule\(\{/g)).toHaveLength(2);
    expect(ai.match(/gateUsagePatterns\(/g)).toHaveLength(2);
    expect(ai).toMatch(/\$\{USAGE_PATTERNS_KEYS\} \/ /);
    expect(ai).not.toMatch(/example_patterns\[\{share,sentence/);
    expect(ai).not.toMatch(/"usage_chunks\[\{parts/);
    // 作り直しはパターンと公式の写しを**入れ替える**（古い物に足さない）。例文の欄は書かない。
    expect(ai).toMatch(/usage_chunks: \["usage_patterns", "usage_chunks"\]/);
    expect(ai).toMatch(/return usageFieldsFromPatterns\(gate\.kept\);/);
  });
});

/** `asExamplePatterns` は見出し語が変わった回の道具。ここでは形だけ見る。 */
describe("asExamplePatterns", () => {
  it("パターンの例文を、例文のパターンの形（自己点検 true）に", () => {
    const kept = gateUsagePatterns([STUCK], CTX).kept;
    expect(asExamplePatterns(kept)[0]).toMatchObject({
      share: 50,
      sentence: "糟糕，馬桶塞住了，水完全沖不下去！",
      scene: "トイレが詰まった・流れない時",
      scene_fits: true,
    });
  });
});
