import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExamplePatternSchema,
  alignExampleExtras,
  chunksMatchSentence,
  applyFixedMainExample,
  checkMainExampleLabel,
  mainExampleLabelRule,
  mainExampleNeedsTidy,
  mainExamplePatch,
  mainExampleRepair,
  needsMainSceneLabel,
  pickExamplePatterns,
  sameSentence,
  sceneMaxChars,
  type ExamplePattern,
} from "./example-patterns";
import { CardReplySchema } from "./card-schema";
import { wordExplanationQuery } from "./reader-explanation";
import { reusableForMainSentence, sameHeadword } from "./generated-cards";
import {
  allowSceneLabel,
  applyRepairViaRpc,
  persistMainLabel,
  shouldLabelMainExample,
  forgetMainExampleLabelAttempts,
  labelMainExample,
  type MainExampleLabelDeps,
  type RepairCall,
} from "./example-scene-label.server";

/**
 * オーナー報告 2026-10-16: 冰淇淋 の1つ目の例文「夏天吃冰淇淋。」（場面の札より前に出来た共有の文）に札が無く、
 * 2つ目の例文には有る。`example_pattern_count` は 2 なのに `example_scene` / `example_scene_for` が無かった。
 */

const MAIN = "夏天吃冰淇淋。";
/** 「夏天吃冰淇淋。」を分けたパーツ。 */
const MAIN_CHUNKS = [
  { text: "夏天", pos: "M" },
  { text: "吃", pos: "V" },
  { text: "冰淇淋", pos: "O" },
];
/** 本番の 床 の行（目印なし）のパーツ: 文「我的床很舒服。」ではなく、保存で外れた別の文の物。 */
const OTHER_SENTENCE_CHUNKS = [
  "我",
  "昨天",
  "太",
  "累",
  "了",
  "一",
  "躺到",
  "床",
  "上",
  "就",
  "睡著",
  "了",
].map((text) => ({ text, pos: "" }));
const p = (o: Partial<ExamplePattern>): ExamplePattern => ExamplePatternSchema.parse(o);

/** 本番の 冰淇淋 の読む人の行（ja）の例文の欄（2026-10-16 06:51Z の形）。 */
const productionExtras = () => ({
  explain_lang: "ja",
  example_pattern_count: 2,
  examples_extra: [
    {
      zh: "這家店的冰淇淋口味很多，每一種都想試試。",
      ja: "この店のフレーバーはたくさんあって、全部試してみたい。",
      scene: "アイスクリーム屋のメニューを見たとき",
      scene_for: "這家店的冰淇淋口味很多，每一種都想試試。",
      chunks: [],
    },
  ],
});

/** 3つの読む人の言語の札（同じ場面）。 */
const LABELS = {
  ja: "暑い日に友達と冷たい物を食べたいとき",
  en: "On a hot day, craving something cold with friends",
  "zh-TW": "大熱天想跟朋友吃點冰的時候",
} as const;
const TRANSLATIONS = {
  ja: "夏はアイスを食べる。",
  en: "In summer we eat ice cream.",
  "zh-TW": "",
} as const;
const READERS = ["ja", "en", "zh-TW"] as const;

describe("needsMainSceneLabel — メインの例文にその文のための札が在るか", () => {
  it("本番の 冰淇淋（札も目印も無い）は札が要る", () => {
    expect(needsMainSceneLabel(MAIN, productionExtras())).toBe(true);
  });
  it("別の文のために書いた札は無いのと同じ", () => {
    expect(
      needsMainSceneLabel(MAIN, {
        example_scene: "アイスクリーム屋で注文するとき",
        example_scene_for: "我要一個巧克力冰淇淋。",
      }),
    ).toBe(true);
  });
  it("その文のための札（空白・句読点の違いは同じ文）なら要らない", () => {
    expect(
      needsMainSceneLabel(MAIN, { example_scene: LABELS.ja, example_scene_for: "夏天 吃冰淇淋" }),
    ).toBe(false);
  });
  it("文が無ければ札も要らない", () => {
    expect(needsMainSceneLabel("", {})).toBe(false);
  });
});

describe("mainExampleLabelRule — 決まった文に札だけを書かせる指示", () => {
  it.each(READERS)("%s: 文をそのまま渡し、変えないと言い、字数の上限は読む人の言語の物", (lang) => {
    const rule = mainExampleLabelRule({
      sentence: MAIN,
      headword: "冰淇淋",
      targetName: "台湾華語",
      nl: lang,
      sceneMax: sceneMaxChars(lang),
      extras: ["這家店的冰淇淋口味很多，每一種都想試試。"],
    });
    expect(rule).toContain(`「${MAIN}」`);
    expect(rule).toContain("この文は変えない");
    expect(rule).toContain(`${lang}で${sceneMaxChars(lang)}字以内`);
    expect(rule).toContain("0. 這家店的冰淇淋口味很多，每一種都想試試。");
    expect(rule).toContain("same_as_main");
  });
});

describe("checkMainExampleLabel — 返ってきた札を機械的に確かめる", () => {
  it.each(READERS)("%s: 読む人の言語の札を受け取り、上限まで短くする", (lang) => {
    const label = checkMainExampleLabel(
      { scene: LABELS[lang], translation: TRANSLATIONS[lang], scene_fits: true },
      { sentence: MAIN, readerLang: lang },
    );
    expect(label).not.toBeNull();
    expect([...(label?.scene ?? "")].length).toBeLessThanOrEqual(sceneMaxChars(lang));
    expect(label?.scene.length).toBeGreaterThan(0);
  });
  it("自己点検が false の札は使わない", () => {
    expect(
      checkMainExampleLabel(
        { scene: LABELS.ja, scene_fits: false },
        { sentence: MAIN, readerLang: "ja" },
      ),
    ).toBeNull();
  });
  it("読む人の言語でない札（英語で読む人に日本語）は使わない", () => {
    expect(
      checkMainExampleLabel({ scene: LABELS.ja }, { sentence: MAIN, readerLang: "en" }),
    ).toBeNull();
  });
  it("札が空・形が違えば null", () => {
    expect(checkMainExampleLabel({ scene: "" }, { sentence: MAIN, readerLang: "ja" })).toBeNull();
    expect(checkMainExampleLabel(undefined, { sentence: MAIN, readerLang: "ja" })).toBeNull();
  });
  it("same_as_main は整数の番号だけ", () => {
    const label = checkMainExampleLabel(
      { scene: LABELS.ja, same_as_main: [0, "1", -1, 0] },
      { sentence: MAIN, readerLang: "ja" },
    );
    expect(label?.sameAsMain).toEqual([0, 1]);
  });
});

describe("applyFixedMainExample — カード生成・例文の作り直し（メインの文が決まっている時）", () => {
  const extras = pickExamplePatterns(
    [
      // メインと同じ文（句読点だけ違う）→ 落とす
      p({
        share: 50,
        sentence: "夏天吃冰淇淋！",
        scene: "暑い日にアイスが食べたいとき",
        translation: "夏はアイス！",
      }),
      // メインと同じ文型（1字を入れ替えただけ）→ 落とす
      p({
        share: 40,
        sentence: "冬天吃冰淇淋。",
        scene: "寒い日にあえてアイスを食べるとき",
        translation: "冬にアイスを食べる。",
      }),
      p({
        share: 30,
        sentence: "這家店的冰淇淋口味很多，每一種都想試試。",
        scene: "アイスクリーム屋のメニューを見たとき",
        translation: "この店のフレーバーはたくさんあって、全部試してみたい。",
      }),
    ],
    { headword: "冰淇淋", language: "zh-TW", readerLang: "ja", max: 4 },
  );

  it("文は変えず、その文のための札を付け、同じパターンの追加の例文を落とす", () => {
    const label = checkMainExampleLabel(
      { scene: LABELS.ja, translation: TRANSLATIONS.ja, chunks: MAIN_CHUNKS },
      { sentence: MAIN, readerLang: "ja" },
    );
    const card = applyFixedMainExample(
      { example_sentence: "", example_translation: "", extras: { usage_context: "x" } },
      { sentence: MAIN, label, extras, withExtra: true, headword: "冰淇淋" },
    );
    expect(card.example_sentence).toBe(MAIN);
    expect(card.example_translation).toBe(TRANSLATIONS.ja);
    const ex = card.extras as Record<string, unknown>;
    expect(ex.example_scene).toBe(LABELS.ja);
    expect(ex.example_scene_for).toBe(MAIN);
    expect(sameSentence(ex.example_scene_for as string, card.example_sentence)).toBe(true);
    expect(ex.example_chunks).toEqual(MAIN_CHUNKS);
    const list = ex.examples_extra as Array<{ zh: string; scene_for: string }>;
    expect(list.map((e) => e.zh)).toEqual(["這家店的冰淇淋口味很多，每一種都想試試。"]);
    expect(list[0].scene_for).toBe(list[0].zh);
    // メインはいつも別のパターン（同じパターンの物は落とした）: 1 + 残った数
    expect(ex.example_pattern_count).toBe(2);
    expect(ex.usage_context).toBe("x");
  });

  it("札を作れなかった回は札を置かず（別の文の札も残さず）、数は 1 + 残った数", () => {
    const card = applyFixedMainExample(
      {
        example_sentence: "我要一個巧克力冰淇淋。",
        example_translation: "チョコアイスを1つください。",
        extras: { example_scene: "店で注文するとき", example_scene_for: "我要一個巧克力冰淇淋。" },
      },
      { sentence: MAIN, label: null, extras, withExtra: true, headword: "冰淇淋" },
    );
    const ex = card.extras as Record<string, unknown>;
    expect(card.example_sentence).toBe(MAIN);
    expect(card.example_translation).toBe("");
    expect(ex.example_scene).toBeUndefined();
    expect(ex.example_scene_for).toBeUndefined();
    expect((ex.examples_extra as unknown[]).length + 1).toBe(ex.example_pattern_count);
  });

  it("追加の例文を頼まない呼び出しは、札だけを付ける（追加の例文・数を書かない）", () => {
    const label = checkMainExampleLabel({ scene: LABELS.en }, { sentence: MAIN, readerLang: "en" });
    const card = applyFixedMainExample(
      { example_sentence: "", example_translation: "", extras: {} },
      { sentence: MAIN, label, extras, withExtra: false, headword: "冰淇淋" },
    );
    const ex = card.extras as Record<string, unknown>;
    expect(ex.example_scene_for).toBe(MAIN);
    expect(ex.examples_extra).toBeUndefined();
    expect(ex.example_pattern_count).toBeUndefined();
  });

  it("AI の返事の形（example_main）を落とさず受け取る", () => {
    const parsed = CardReplySchema.parse({
      meaning_ja: "アイスクリーム",
      example_main: { scene: LABELS.ja },
    });
    expect(parsed.example_main).toEqual({ scene: LABELS.ja });
  });
});

describe("mainExamplePatch — 保存済みの行に札を付ける差分", () => {
  it("本番の 冰淇淋: 札と目印（= その文）を足す。別のパターンの追加の例文は残し、数は 2 のまま", () => {
    const label = checkMainExampleLabel({ scene: LABELS.ja }, { sentence: MAIN, readerLang: "ja" });
    const fix = mainExamplePatch(productionExtras(), {
      sentence: MAIN,
      headword: "冰淇淋",
      label,
    });
    expect(fix?.patch).toEqual({ example_scene: LABELS.ja, example_scene_for: MAIN });
    expect(fix?.replaceKeys).toEqual([]);
  });
  it("AI が同じパターンと言った追加の例文（文で渡す）は落とし、数は 1 + 残った数", () => {
    const label = checkMainExampleLabel(
      { scene: LABELS.ja, same_as_main: [0] },
      { sentence: MAIN, readerLang: "ja" },
    );
    // 番号（label.sameAsMain）だけでは落とさない — どの一覧の番号か分からないので
    expect(
      mainExamplePatch(productionExtras(), { sentence: MAIN, headword: "冰淇淋", label })?.patch
        .examples_extra,
    ).toBeUndefined();
    const fix = mainExamplePatch(productionExtras(), {
      sentence: MAIN,
      headword: "冰淇淋",
      label,
      samePattern: ["這家店的冰淇淋口味很多，每一種都想試試"],
    });
    expect(fix?.patch.examples_extra).toEqual([]);
    expect(fix?.patch.example_pattern_count).toBe(1);
    expect(fix?.replaceKeys).toEqual(["examples_extra"]);
  });
  it("札が在る行でも、メインと同じ文の追加の例文は AI を呼ばずに落とせる", () => {
    const ex = {
      ...productionExtras(),
      example_scene: LABELS.ja,
      example_scene_for: MAIN,
      example_pattern_count: 3,
      examples_extra: [
        ...productionExtras().examples_extra,
        { zh: "夏天吃冰淇淋", ja: "", scene: "", chunks: [] },
      ],
    };
    expect(mainExampleNeedsTidy(ex, MAIN, "冰淇淋")).toBe(true);
    const fix = mainExamplePatch(ex, { sentence: MAIN, headword: "冰淇淋", label: null });
    expect((fix?.patch.examples_extra as unknown[]).length).toBe(1);
    expect(fix?.patch.example_pattern_count).toBe(2);
    expect(fix?.patch.example_scene).toBeUndefined();
  });
  it("直す物が無ければ null", () => {
    const ex = { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN };
    expect(mainExamplePatch(ex, { sentence: MAIN, headword: "冰淇淋", label: null })).toBeNull();
    expect(mainExampleNeedsTidy(ex, MAIN, "冰淇淋")).toBe(false);
  });
});

describe("パーツもその文の物にそろえる（PR #189 の点検 P2）", () => {
  it("chunksMatchSentence: つなぐと文になるパーツだけ（空白・句読点の違いは同じ）", () => {
    expect(chunksMatchSentence(MAIN_CHUNKS, MAIN)).toBe(true);
    expect(chunksMatchSentence(MAIN_CHUNKS, "夏天 吃冰淇淋！")).toBe(true);
    expect(chunksMatchSentence(OTHER_SENTENCE_CHUNKS, "我的床很舒服。")).toBe(false);
    expect(
      chunksMatchSentence(
        ["I", "eat", "ice cream", "in summer"].map((text) => ({ text })),
        "I eat ice cream in summer.",
      ),
    ).toBe(true);
    expect(chunksMatchSentence([], MAIN)).toBe(false);
    expect(chunksMatchSentence(undefined, MAIN)).toBe(false);
  });

  it("checkMainExampleLabel: 別の文を分けたパーツは受け取らない（札は使う）", () => {
    const label = checkMainExampleLabel(
      {
        scene: LABELS.ja,
        chunks: [
          { text: "我要", pos: "V" },
          { text: "冰淇淋", pos: "O" },
        ],
      },
      { sentence: MAIN, readerLang: "ja" },
    );
    expect(label?.scene).toBe(LABELS.ja);
    expect(label?.chunks).toEqual([]);
  });

  const BED = "我的床很舒服。";
  const bedRow = () => ({
    explain_lang: "ja",
    example_chunks: OTHER_SENTENCE_CHUNKS,
    example_pattern_count: 1,
  });

  it("札を付ける行の別の文のパーツは空にする（空で上書きする鍵として渡す）", () => {
    const label = checkMainExampleLabel(
      { scene: "ベッドに寝転んだとき" },
      { sentence: BED, readerLang: "ja" },
    );
    const fix = mainExamplePatch(bedRow(), { sentence: BED, headword: "床", label });
    expect(fix?.patch.example_scene_for).toBe(BED);
    expect(fix?.patch.example_chunks).toEqual([]);
    expect(fix?.replaceKeys).toContain("example_chunks");
  });

  it("札と一緒に書かせたこの文のパーツがあれば、それに入れ替える", () => {
    const bedChunks = ["我的", "床", "很", "舒服"].map((text) => ({ text, pos: "" }));
    const label = checkMainExampleLabel(
      { scene: "ベッドに寝転んだとき", chunks: bedChunks },
      { sentence: BED, readerLang: "ja" },
    );
    const fix = mainExamplePatch(bedRow(), { sentence: BED, headword: "床", label });
    expect(fix?.patch.example_chunks).toEqual(bedChunks);
    expect(fix?.replaceKeys).not.toContain("example_chunks");
  });

  it("在るパーツがこの文の物なら残す（触らない）", () => {
    const label = checkMainExampleLabel({ scene: LABELS.ja }, { sentence: MAIN, readerLang: "ja" });
    const fix = mainExamplePatch(
      { ...productionExtras(), example_chunks: MAIN_CHUNKS },
      { sentence: MAIN, headword: "冰淇淋", label },
    );
    expect(fix?.patch).toEqual({ example_scene: LABELS.ja, example_scene_for: MAIN });
  });
});

describe("alignExampleExtras — 前から在る文が残る保存", () => {
  it("別の文の札を外し、残る文と同じ追加の例文を落として、数を 1 + 残った数にする", () => {
    const out = alignExampleExtras(
      {
        example_scene: "店で注文するとき",
        example_scene_for: "我要一個巧克力冰淇淋。",
        example_pattern_count: 3,
        examples_extra: [
          { zh: "夏天吃冰淇淋！", ja: "", scene: "", chunks: [] },
          { zh: "這家店的冰淇淋口味很多。", ja: "", scene: "", chunks: [] },
        ],
      },
      MAIN,
    ) as Record<string, unknown>;
    expect(out.example_scene).toBeUndefined();
    expect((out.examples_extra as Array<{ zh: string }>).map((e) => e.zh)).toEqual([
      "這家店的冰淇淋口味很多。",
    ]);
    expect(out.example_pattern_count).toBe(2);
  });
});

describe("allowSceneLabel — 記録された同意だけを見る（古い iOS の見出しの免除を使わない — P2）", () => {
  const reserve = vi.fn(async () => undefined);
  beforeEach(() => reserve.mockClear());

  it.each([
    ["同意なし", { agreed: false, recorded: true }],
    ["表が無い（記録できない）", { agreed: false, recorded: false }],
    ["表が無いのに agreed（来ない形だが通さない）", { agreed: true, recorded: false }],
  ])("%s: 投げて、枠もとらない", async (_name, status) => {
    await expect(
      allowSceneLabel("u1", { consentStatus: async () => status, reserve }),
    ).rejects.toThrow("AI_CONSENT_REQUIRED");
    expect(reserve).not.toHaveBeenCalled();
  });

  it("記録された今の版の同意があれば、その日の枠を1回分とる", async () => {
    await allowSceneLabel("u1", {
      consentStatus: async () => ({ agreed: true, recorded: true }),
      reserve,
    });
    expect(reserve).toHaveBeenCalledWith("u1");
  });

  it("本番の道は assertAiConsent（見出しの無い iOS を通す）を使わない", () => {
    const src = fs.readFileSync(path.join(__dirname, "example-scene-label.server.ts"), "utf8");
    expect(src).not.toMatch(/assertAiConsent\(/);
    expect(src).toMatch(/consent\.getAiConsentStatus\(id\)/);
  });
});

describe("wordExplanationQuery — 札を書きに行った返事はすぐ古くする（P2）", () => {
  const q = wordExplanationQuery(
    async () => ({ picked: null, unavailable: false }),
    "w1",
    { explainLang: "ja", l1: "ja" },
    undefined,
  );
  const stale = q.staleTime as (x: { state: { data?: unknown } }) => number;
  it("labelPending の返事は 0（次に開いた時に読み直す）・ふつうの返事は 30 分", () => {
    expect(
      stale({ state: { data: { picked: null, unavailable: false, labelPending: true } } }),
    ).toBe(0);
    expect(stale({ state: { data: { picked: null, unavailable: false } } })).toBe(30 * 60 * 1000);
    expect(stale({ state: {} })).toBe(30 * 60 * 1000);
  });
});

describe("どの道もメインの例文の札を作る（配線）", () => {
  const src = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");

  it("generateCard: 共有の語に在る文を引き、その文に札を付けて作る", () => {
    const ai = src("ai.functions.ts");
    expect(ai).toMatch(/readExistingMainSentence\(cardAdmin/);
    expect(ai).toMatch(/fixedMain\s*\?\s*\[\s*mainExampleLabelRule\(/);
    expect(ai).toMatch(/example_main\{scene,translation,chunks/);
    expect(ai).toMatch(/card = applyFixedMainExample\(card, \{/);
  });

  it("例文の作り直し: 札の無い古い文には同じ呼び出しで札を書かせる・人が確かめた語は文を決まった文にする", () => {
    const ai = src("ai.functions.ts");
    expect(ai).toMatch(/needMainLabel \? `\$\{mainLabelRule\(/);
    expect(ai).toMatch(/example: fixedExampleMain/);
    // 人が確かめた語の札も、行の書き戻しではなく persistMainLabel で書く
    expect(ai).toMatch(
      /main_label: \{ scene: label\.scene, chunks: label\.chunks, translation: "" \}/,
    );
  });

  it("generateCard: 見出し語が変わった回（手紙 → 信）は予備の例文をメインにする（P2）", () => {
    const ai = src("ai.functions.ts");
    expect(ai).toMatch(/- example_fallback: \*\*予備の例文1つ\*\*/);
    expect(ai).toMatch(/\} else if \(fixedMain\) \{[\s\S]{0,400}card\.example_fallback/);
    expect(ai).toMatch(/example_fallback: _fallback/);
    const parsed = CardReplySchema.parse({
      meaning_ja: "手紙",
      example_fallback: { sentence: "我收到一封信。", scene: "郵便受けを開けたとき" },
    });
    expect(parsed.example_fallback?.sentence).toBe("我收到一封信。");
    expect(
      CardReplySchema.parse({ meaning_ja: "手紙", example_fallback: "壊れた形" }).example_fallback,
    ).toBeUndefined();
  });

  it("単語の詳細を開いた時: 札の無い行は返事の後で札だけを書く（読む人の行が無い語は共有の行 — P2）", () => {
    const we = src("word-explanation.functions.ts");
    expect(we).toMatch(/shouldLabelMainExample\(/);
    expect(we).toMatch(/scheduleMainExampleLabel\(/);
    // 読む人の行が無くても、返す前に共有の行（同じ言語）の札を頼む
    expect(we).toMatch(
      /if \(!picked\) \{[\s\S]{0,600}scheduleLabelIfNeeded\(\{[\s\S]{0,200}reader: null,\s*shared: sharedExtrasIn\(word\.extras, data\.explain_lang\)/,
    );
    expect(we).toMatch(/labelPending/);
    // 画面に出す行の出どころ（verified か）も渡す
    // 読む人の行があっても、同じ言語の共有の行（図鑑から開いた詳細が出す）も見る
    expect(we).toMatch(
      /reader: \{ extras: picked\.extras, source: picked\.source \},\s*shared: sharedExtrasIn\(word\.extras, picked\.explain_lang\)/,
    );
    // サーバだけの道具は handler の中で読み込む（画面の束に入れない）
    expect(we).not.toMatch(/^import .*example-scene-label\.server/m);
  });

  it("Web: 札を書きに行った返事で札の控えを古くする・図鑑から開いた詳細でも同じ解説を引く", () => {
    const hook = fs.readFileSync(
      path.join(__dirname, "../hooks/use-explanation-label-refresh.ts"),
      "utf8",
    );
    expect(hook).toMatch(/queryKey: \["sticker", stickerId\], refetchType: "none"/);
    expect(hook).toMatch(/\.\.\.wordExplanationQuery\(fetchExplanation, wordId, wantKey, cached\)/);
    const sheet = fs.readFileSync(path.join(__dirname, "../components/StickerSheet.tsx"), "utf8");
    expect(sheet).toMatch(/useRefreshStickerAfterLabel\(explanation, stickerId\)/);
    const detail = fs.readFileSync(
      path.join(__dirname, "../components/screens/StickerDetailScreen.tsx"),
      "utf8",
    );
    expect(detail).toMatch(/useReaderExplanationForDetail\(s\?\.word_id, stickerId\)/);
  });

  it("項目の作り直しの札も、行を丸ごと書き戻さずに名前を挙げた鍵だけを書く（P1）", () => {
    const ai = src("ai.functions.ts");
    expect(ai).not.toMatch(/clear_main_chunks|main_translation/);
    expect(ai).toMatch(/main_label: mainLabel/);
    expect(ai).toMatch(
      /persistMainLabel\(\{\s*wordId: data\.word_id,\s*key: readerKey,\s*sentence: mainSentence,/,
    );
  });
});

describe("same_as_main は番号として確かな物だけ（PR #189 の点検 — 1つ目の追加の例文を消さない）", () => {
  it.each([[null], [false], [""], [" "], ["1.5"], ["x"], [-1], [1.5], [true], [{}]])(
    "%j は捨てる",
    (bad) => {
      const label = checkMainExampleLabel(
        { scene: LABELS.ja, same_as_main: [bad] },
        { sentence: MAIN, readerLang: "ja" },
      );
      expect(label?.sameAsMain).toEqual([]);
    },
  );
  it('整数と数字だけの文字列（" 2 "）は番号にする', () => {
    const label = checkMainExampleLabel(
      { scene: LABELS.ja, same_as_main: [1, " 2 ", null, 1] },
      { sentence: MAIN, readerLang: "ja" },
    );
    expect(label?.sameAsMain).toEqual([1, 2]);
  });
});

describe("reusableForMainSentence — 控えのカードはいまの共有の文と同じ時だけ返す（PR #189 の点検）", () => {
  it("共有の文が変わっていたら返さない・同じなら返す・文が無ければ返す", () => {
    const card = { example_sentence: "我要一個巧克力冰淇淋。", headword_zh: "冰淇淋" };
    expect(
      reusableForMainSentence(card, {
        inputHeadword: "冰淇淋",
        currentMain: MAIN,
        language: "zh-TW",
      }),
    ).toBe(false);
    expect(
      reusableForMainSentence(
        { ...card, example_sentence: "夏天吃冰淇淋" },
        { inputHeadword: "冰淇淋", currentMain: MAIN, language: "zh-TW" },
      ),
    ).toBe(true);
    expect(
      reusableForMainSentence(card, {
        inputHeadword: "冰淇淋",
        currentMain: null,
        language: "zh-TW",
      }),
    ).toBe(true);
  });
  it("見出し語が入力と変わったカード（手紙 → 信）は入力の語の文と比べない", () => {
    expect(
      reusableForMainSentence(
        { example_sentence: "我收到一封信。", headword_zh: "信" },
        { inputHeadword: "手紙", currentMain: "我寫了一封手紙。", language: "zh-TW" },
      ),
    ).toBe(true);
  });
  it("generateCard は控えを返す前にいまの共有の文と比べる", () => {
    const ai = fs.readFileSync(path.join(__dirname, "ai.functions.ts"), "utf8");
    expect(ai).toMatch(
      /reusableForMainSentence\(reused, \{\s*inputHeadword: data\.headword,\s*currentMain,/,
    );
    // 見出し語の比べは学習言語ごとの比べ方（Apple と apple は同じ語）
    expect(ai).toMatch(/fixedMain && sameHeadword\(resolvedHead, data\.headword, cardLanguage\)/);
  });
  it("sameHeadword: 大文字小文字・前後の空白・英語の冠詞の違いは同じ語（P2）", () => {
    expect(sameHeadword("Apple", "apple", "en")).toBe(true);
    expect(sameHeadword("an apple", "Apple ", "en")).toBe(true);
    expect(sameHeadword("信", "手紙", "zh-TW")).toBe(false);
    expect(
      reusableForMainSentence(
        { example_sentence: "I eat an apple.", headword_zh: "apple" },
        { inputHeadword: "Apple", currentMain: "Apples are red.", language: "en" },
      ),
    ).toBe(false);
  });
});

// --- 古い行を開いた時の札だけの呼び出し ------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * `apply_main_example_label`（SQL）と同じ決まりで、**書く時点の行に**名前を挙げた鍵だけを重ねる偽物。
 * SQL そのものは supabase/migrations/20261016120000_apply_main_example_label.sql。
 */
function patchLikeSql(extras: Row | null, sentence: string, r: RepairCall["repair"]): Row {
  let e: Row = { ...(extras ?? {}) };
  if (r.scene !== null) e = { ...e, example_scene: r.scene, example_scene_for: sentence };
  if (r.chunks !== null) e = { ...e, example_chunks: r.chunks };
  else if (
    r.staleChunks !== null &&
    JSON.stringify(e.example_chunks) === JSON.stringify(r.staleChunks)
  )
    e = { ...e, example_chunks: [] };
  if (r.drop.length > 0 && Array.isArray(e.examples_extra))
    e = {
      ...e,
      examples_extra: (e.examples_extra as Row[]).filter(
        (x) => !r.drop.includes(String(x?.zh ?? "")),
      ),
    };
  if (r.recount)
    e = {
      ...e,
      example_pattern_count: 1 + (Array.isArray(e.examples_extra) ? e.examples_extra.length : 0),
    };
  return e;
}

type World = {
  word: Row;
  reader: Row | null;
  owned: boolean;
  calls: RepairCall[];
};

function fakeAdmin(w: World) {
  return {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: t === "words" ? { ...w.word } : null, error: null }),
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: w.owned ? { id: "s1" } : null, error: null }),
            }),
          }),
        }),
      }),
      // 丸ごと書き戻す道は無い（書くのは apply_main_example_label だけ）
      update: () => {
        throw new Error("whole-row update is not allowed");
      },
    }),
  };
}

function applyLikeSql(w: World, c: RepairCall): boolean {
  w.calls.push(c);
  if (String(w.word.example_sentence ?? "").trim() !== c.sentence) return false;
  const target = c.l1 === null ? (w.word.extras as Row | null) : (w.reader?.extras as Row | null);
  if (c.l1 === null) {
    const lang = String((target?.explain_lang as string | undefined)?.trim() || "ja");
    if (lang !== c.explainLang) return false;
  } else if (!w.reader || w.reader.source === "verified") return false;
  if (c.repair.scene !== null && target?.example_scene_for === c.sentence) return false;
  const next = patchLikeSql(target, c.sentence, c.repair);
  if (JSON.stringify(next) === JSON.stringify(target)) return false;
  if (c.l1 === null) w.word = { ...w.word, extras: next };
  else {
    const tr = String(w.reader!.example_translation ?? "").trim();
    w.reader = {
      ...w.reader!,
      extras: next,
      example_translation: !tr && c.translation ? c.translation : w.reader!.example_translation,
    };
  }
  return true;
}

function setup(opts: {
  lang: (typeof READERS)[number];
  reader?: Row | null;
  sharedExtras?: Row;
  owned?: boolean;
  reply?: string;
  allow?: MainExampleLabelDeps["allow"];
}) {
  const w: World = {
    word: {
      headword: "冰淇淋",
      language: "zh-TW",
      example_sentence: MAIN,
      extras: opts.sharedExtras ?? productionExtras(),
    },
    reader:
      opts.reader === undefined
        ? {
            example_translation: "",
            extras: { ...productionExtras(), explain_lang: opts.lang },
            source: "ai",
          }
        : opts.reader,
    owned: opts.owned ?? true,
    calls: [],
  };
  const prompts: string[] = [];
  const deps: MainExampleLabelDeps = {
    admin: fakeAdmin(w),
    readReader: async () => (w.reader ? ({ ...w.reader } as never) : null),
    applyRepair: async (c) => applyLikeSql(w, c),
    allow: opts.allow ?? (async () => undefined),
    generate: vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return (
        opts.reply ??
        JSON.stringify({ example_main: { scene: LABELS[opts.lang], scene_fits: true } })
      );
    }),
    parseJson: (t) => JSON.parse(t),
    languageName: (l) => l,
  };
  const readerExtras = () => (w.reader?.extras ?? {}) as Row;
  const sharedExtras = () => (w.word.extras ?? {}) as Row;
  return { deps, w, prompts, readerExtras, sharedExtras };
}

const run = (deps: MainExampleLabelDeps, lang = "ja", userId = "u1") =>
  labelMainExample(deps, { userId, wordId: "w1", key: { explainLang: lang, l1: "ja" } });

describe("labelMainExample — 古い行を開いた時に札だけを書く", () => {
  beforeEach(() => forgetMainExampleLabelAttempts());

  it.each(READERS)(
    "%s: 決まった文を渡して札だけを書かせ、両方の行に札と目印を書く",
    async (lang) => {
      const t = setup({ lang, sharedExtras: { ...productionExtras(), explain_lang: lang } });
      expect((await run(t.deps, lang)).outcome).toBe("labelled");
      expect(t.deps.generate).toHaveBeenCalledTimes(1);
      expect(t.prompts[0]).toContain(`「${MAIN}」`);
      expect(t.prompts[0]).toContain("この文は変えない");
      expect(t.prompts[0]).toContain(`${sceneMaxChars(lang)}字以内`);
      for (const ex of [t.readerExtras(), t.sharedExtras()]) {
        expect(ex.example_scene_for).toBe(MAIN);
        expect(String(ex.example_scene).length).toBeGreaterThan(0);
        expect(needsMainSceneLabel(MAIN, ex)).toBe(false);
      }
      // 文そのものは変えない
      expect(t.w.word.example_sentence).toBe(MAIN);
    },
  );

  it("**間に書いたほかの処理の鍵を消さない**（行を丸ごと書き戻さない — P1）", async () => {
    const t = setup({ lang: "ja" });
    const usage = [{ parts: [{ text: "吃" }, { text: "冰淇淋" }], ja: "アイスを食べる" }];
    // AI を待つ間に、項目の作り直しが両方の行へ使い方の型を書いた
    t.deps.generate = vi.fn(async () => {
      t.w.word = { ...t.w.word, extras: { ...t.sharedExtras(), usage_chunks: usage } };
      t.w.reader = { ...t.w.reader!, extras: { ...t.readerExtras(), usage_chunks: usage } };
      return JSON.stringify({ example_main: { scene: LABELS.ja } });
    });
    expect((await run(t.deps)).outcome).toBe("labelled");
    for (const ex of [t.readerExtras(), t.sharedExtras()]) {
      expect(ex.usage_chunks).toEqual(usage);
      expect(ex.example_scene_for).toBe(MAIN);
    }
    // 書くのは名前を挙げた鍵だけ（丸ごとの extras を渡さない）
    for (const c of t.w.calls)
      expect(Object.keys(c.repair).sort()).toEqual([
        "chunks",
        "drop",
        "recount",
        "scene",
        "staleChunks",
      ]);
  });

  it("同じ行はしばらく呼び直さない", async () => {
    const t = setup({ lang: "ja", reply: JSON.stringify({ example_main: { scene: "" } }) });
    expect((await run(t.deps)).outcome).toBe("failed");
    expect((await run(t.deps)).outcome).toBe("skipped");
    expect(t.deps.generate).toHaveBeenCalledTimes(1);
    expect(t.w.calls).toHaveLength(0);
  });

  it("読む人の言語でない札は書かない", async () => {
    const t = setup({ lang: "en", reply: JSON.stringify({ example_main: { scene: LABELS.ja } }) });
    expect((await run(t.deps, "en")).outcome).toBe("failed");
    expect(t.w.calls).toHaveLength(0);
  });

  it("自分の図鑑に無い語は呼ばない", async () => {
    const t = setup({ lang: "ja", owned: false });
    expect(await run(t.deps)).toEqual({ outcome: "skipped", reason: "not owned" });
    expect(t.deps.generate).not.toHaveBeenCalled();
  });

  it("共有の行に札が在れば、AI を呼ばず・同意も見ずに読む人の行へ写す（P2）", async () => {
    const allow = vi.fn(async () => {
      throw new Error("AI_CONSENT_REQUIRED");
    });
    const t = setup({
      lang: "ja",
      allow,
      sharedExtras: { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN },
    });
    expect((await run(t.deps)).outcome).toBe("labelled");
    expect(t.deps.generate).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
    expect(t.readerExtras().example_scene).toBe(LABELS.ja);
  });

  it("札が在って掃除だけの行も、同意なしで直す（AI に何も送らない — P2）", async () => {
    const allow = vi.fn(async () => {
      throw new Error("AI_CONSENT_REQUIRED");
    });
    const dup = {
      ...productionExtras(),
      example_scene: LABELS.ja,
      example_scene_for: MAIN,
      example_pattern_count: 3,
      examples_extra: [
        ...productionExtras().examples_extra,
        { zh: "夏天吃冰淇淋", ja: "", scene: "" },
      ],
    };
    const t = setup({
      lang: "ja",
      allow,
      reader: { example_translation: "x", extras: dup, source: "ai" },
      sharedExtras: dup,
    });
    expect((await run(t.deps)).outcome).toBe("tidied");
    expect(allow).not.toHaveBeenCalled();
    expect(t.deps.generate).not.toHaveBeenCalled();
    expect((t.readerExtras().examples_extra as unknown[]).length).toBe(1);
    expect(t.readerExtras().example_pattern_count).toBe(2);
  });

  it("AI が同じパターンと言った追加の例文は文で落とす（読む人の行と共有の行で一覧が違っても — P1）", async () => {
    const readerOnly = { zh: "我想吃草莓口味的冰淇淋。", ja: "", scene: "店で味を選ぶとき" };
    const sharedOnly = {
      zh: "冰淇淋融化了，滴到手上。",
      ja: "",
      scene: "公園でアイスが溶けたとき",
    };
    const t = setup({
      lang: "ja",
      reader: {
        example_translation: "x",
        extras: { explain_lang: "ja", example_pattern_count: 2, examples_extra: [readerOnly] },
        source: "ai",
      },
      sharedExtras: { explain_lang: "ja", example_pattern_count: 2, examples_extra: [sharedOnly] },
      reply: JSON.stringify({ example_main: { scene: LABELS.ja, same_as_main: [0] } }),
    });
    await run(t.deps);
    expect(t.prompts[0]).toContain(`0. ${readerOnly.zh}`);
    expect(t.readerExtras().examples_extra).toEqual([]);
    expect(t.readerExtras().example_pattern_count).toBe(1);
    expect(t.sharedExtras().examples_extra).toEqual([sharedOnly]);
    expect(t.sharedExtras().example_pattern_count).toBe(2);
    expect(t.sharedExtras().example_scene_for).toBe(MAIN);
  });

  it("壊れた番号の返事では、追加の例文を1つも消さない", async () => {
    const t = setup({
      lang: "ja",
      reply: JSON.stringify({
        example_main: { scene: LABELS.ja, same_as_main: [null, "", false, " "] },
      }),
    });
    await run(t.deps);
    expect(t.readerExtras().examples_extra).toEqual(productionExtras().examples_extra);
    expect(t.sharedExtras().examples_extra).toEqual(productionExtras().examples_extra);
  });

  it("行のパーツが別の文の物なら、同じ呼び出しでこの文のパーツを書かせて入れ替える", async () => {
    const legacy = { ...productionExtras(), example_chunks: OTHER_SENTENCE_CHUNKS };
    const t = setup({
      lang: "ja",
      reader: { example_translation: "x", extras: legacy, source: "ai" },
      sharedExtras: legacy,
      reply: JSON.stringify({ example_main: { scene: LABELS.ja, chunks: MAIN_CHUNKS } }),
    });
    await run(t.deps);
    expect(t.prompts[0]).toContain("chunks: その文をパーツ分解した");
    expect(t.readerExtras().example_chunks).toEqual(MAIN_CHUNKS);
    expect(t.sharedExtras().example_chunks).toEqual(MAIN_CHUNKS);
  });

  it("この文のパーツを書けなかった回は、別の文のパーツを両方の行から消す", async () => {
    const legacy = { ...productionExtras(), example_chunks: OTHER_SENTENCE_CHUNKS };
    const t = setup({
      lang: "ja",
      reader: { example_translation: "x", extras: legacy, source: "ai" },
      sharedExtras: legacy,
    });
    await run(t.deps);
    expect(t.readerExtras().example_chunks).toEqual([]);
    expect(t.sharedExtras().example_chunks).toEqual([]);
    expect(t.sharedExtras().example_scene_for).toBe(MAIN);
  });

  it("訳の無い読む人の行には、札と一緒に書かせた訳を入れる", async () => {
    const t = setup({
      lang: "ja",
      reply: JSON.stringify({ example_main: { scene: LABELS.ja, translation: TRANSLATIONS.ja } }),
    });
    await run(t.deps);
    expect(t.prompts[0]).toContain("translation: その文の自然な訳");
    expect(t.w.reader?.example_translation).toBe(TRANSLATIONS.ja);
  });

  it("人が確かめた読む人の行は書かない（共有の行だけ直す）", async () => {
    const t = setup({
      lang: "ja",
      reader: { example_translation: "x", extras: productionExtras(), source: "verified" },
    });
    await run(t.deps);
    expect(t.w.calls.every((c) => c.l1 === null)).toBe(true);
    expect(needsMainSceneLabel(MAIN, t.readerExtras())).toBe(true);
    expect(t.sharedExtras().example_scene_for).toBe(MAIN);
  });

  it("札がもう在る行は何もしない（開くたびに呼ばない）", async () => {
    const done = { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN };
    const t = setup({
      lang: "ja",
      reader: { example_translation: "x", extras: done, source: "ai" },
      sharedExtras: done,
    });
    expect((await run(t.deps)).outcome).toBe("skipped");
    expect(t.deps.generate).not.toHaveBeenCalled();
  });
});

describe("同じ行の仕事は1つずつ・書く時の条件（PR #189 の点検）", () => {
  beforeEach(() => forgetMainExampleLabelAttempts());

  it("同時に来た2つの仕事は、AI を1回だけ呼ぶ", async () => {
    const t = setup({ lang: "ja" });
    const [a, b] = await Promise.all([run(t.deps, "ja", "u1"), run(t.deps, "ja", "u2")]);
    expect([a.outcome, b.outcome].sort()).toEqual(["labelled", "skipped"]);
    expect(t.deps.generate).toHaveBeenCalledTimes(1);
  });

  it("同意の無い人の仕事が終われば、次の人はすぐ札を付けられる（取った印は外す）", async () => {
    const denied = setup({
      lang: "ja",
      allow: async () => {
        throw new Error("AI_CONSENT_REQUIRED");
      },
    });
    expect((await run(denied.deps, "ja", "u1")).outcome).toBe("failed");
    expect(denied.deps.generate).not.toHaveBeenCalled();
    const ok = setup({ lang: "ja" });
    expect((await run(ok.deps, "ja", "u2")).outcome).toBe("labelled");
  });

  it("ほかの実行環境が先に札を付けていたら、上書きしない（SQL の条件）", async () => {
    const t = setup({ lang: "ja" });
    const other = { ...productionExtras(), example_scene: "先に付いた札", example_scene_for: MAIN };
    t.deps.generate = vi.fn(async () => {
      t.w.word = { ...t.w.word, extras: other };
      t.w.reader = { ...t.w.reader!, extras: other };
      return JSON.stringify({ example_main: { scene: LABELS.ja } });
    });
    await run(t.deps);
    expect(t.sharedExtras().example_scene).toBe("先に付いた札");
    expect(t.readerExtras().example_scene).toBe("先に付いた札");
  });

  it("メインの例文が間に変わっていたら書かない", async () => {
    const t = setup({ lang: "ja" });
    t.deps.generate = vi.fn(async () => {
      t.w.word = { ...t.w.word, example_sentence: "別的句子。" };
      return JSON.stringify({ example_main: { scene: LABELS.ja } });
    });
    expect((await run(t.deps)).outcome).toBe("failed");
    expect(needsMainSceneLabel(MAIN, t.sharedExtras())).toBe(true);
  });
});

describe("mainExampleRepair / apply_main_example_label — 部分的に書く（P1）", () => {
  it("札・パーツ・落とす文・数え直しを値で渡す（丸ごとの extras は渡さない）", () => {
    const legacy = {
      ...productionExtras(),
      example_chunks: OTHER_SENTENCE_CHUNKS,
      examples_extra: [...productionExtras().examples_extra, { zh: "夏天吃冰淇淋！", ja: "" }],
      example_pattern_count: 3,
    };
    const label = checkMainExampleLabel({ scene: LABELS.ja }, { sentence: MAIN, readerLang: "ja" });
    expect(mainExampleRepair(legacy, { sentence: MAIN, headword: "冰淇淋", label })).toEqual({
      scene: LABELS.ja,
      chunks: null,
      staleChunks: OTHER_SENTENCE_CHUNKS,
      drop: ["夏天吃冰淇淋！"],
      recount: true,
    });
    const done = { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN };
    expect(mainExampleRepair(done, { sentence: MAIN, headword: "冰淇淋", label: null })).toBeNull();
  });

  it("本番の呼び出し: RPC に引数を名前つきで渡し、true の時だけ書けたとする", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const call: RepairCall = {
      wordId: "w1",
      explainLang: "ja",
      l1: null,
      sentence: MAIN,
      repair: { scene: LABELS.ja, chunks: null, staleChunks: null, drop: [], recount: false },
      translation: null,
    };
    expect(await applyRepairViaRpc({ rpc }, call)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("apply_main_example_label", {
      p_word_id: "w1",
      p_explain_lang: "ja",
      p_l1: null,
      p_sentence: MAIN,
      p_scene: LABELS.ja,
      p_chunks: null,
      p_stale_chunks: null,
      p_drop: [],
      p_recount: false,
      p_translation: null,
    });
    const missing = vi.fn(async () => ({
      data: null,
      error: { message: "function does not exist" },
    }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await applyRepairViaRpc({ rpc: missing }, call)).toBe(false);
  });

  it("SQL: extras は名前を挙げた鍵だけを重ねる・札はまだの行だけ・人が確かめた行と変わった文には書かない", () => {
    const sql = fs.readFileSync(
      path.join(__dirname, "../../supabase/migrations/20261016120000_apply_main_example_label.sql"),
      "utf8",
    );
    expect(sql).toMatch(
      /e := e \|\| jsonb_build_object\('example_scene', p_scene, 'example_scene_for', p_sentence\)/,
    );
    expect(sql).toMatch(
      /\(w\.extras ->> 'example_scene_for'\) is distinct from btrim\(p_sentence\)/,
    );
    expect(sql).toMatch(
      /\(e\.extras ->> 'example_scene_for'\) is distinct from btrim\(p_sentence\)/,
    );
    expect(sql).toMatch(/e\.source is distinct from 'verified'/);
    expect(sql).toMatch(/for share;/);
    expect(sql).toMatch(
      /grant execute on function public\.apply_main_example_label\([^)]*\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.apply_main_example_label\([^)]*\) from authenticated;/,
    );
    // サーバの仕事は extras を丸ごと書かない
    const job = fs.readFileSync(path.join(__dirname, "example-scene-label.server.ts"), "utf8");
    expect(job).not.toMatch(/\.update\(/);
  });
});

describe("shouldLabelMainExample — 直せる行がある時だけ頼む（PR #189 の点検）", () => {
  const word = { language: "zh-TW", headword: "冰淇淋", example_sentence: MAIN };
  const agreed = vi.fn(async () => ({ agreed: true, recorded: true }));
  const none = vi.fn(async () => ({ agreed: false, recorded: true }));
  const base = { userId: "u1", wordId: "w1", word, owns: async () => true };
  const done = { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN };
  beforeEach(() => {
    agreed.mockClear();
    none.mockClear();
  });

  it("人が確かめた読む人の行だけなら頼まない（同意も読まない）", async () => {
    expect(
      await shouldLabelMainExample({
        ...base,
        reader: { extras: productionExtras(), source: "verified" },
        shared: null,
        consentStatus: agreed,
      }),
    ).toBe(false);
    expect(agreed).not.toHaveBeenCalled();
  });

  it("読む人の行は札が在っても、同じ言語の共有の行に札が無ければ頼む（写すだけなので同意は要らない — P2）", async () => {
    expect(
      await shouldLabelMainExample({
        ...base,
        reader: { extras: done, source: "ai" },
        shared: productionExtras(),
        consentStatus: none,
      }),
    ).toBe(true);
    expect(none).not.toHaveBeenCalled();
  });

  it("読む人の行が無く共有の行に札が無い語は、同意のある人にだけ頼む", async () => {
    expect(
      await shouldLabelMainExample({
        ...base,
        reader: null,
        shared: productionExtras(),
        consentStatus: agreed,
      }),
    ).toBe(true);
    expect(
      await shouldLabelMainExample({
        ...base,
        reader: null,
        shared: productionExtras(),
        consentStatus: none,
      }),
    ).toBe(false);
  });

  it("どちらの行にも直す物が無ければ頼まない", async () => {
    expect(
      await shouldLabelMainExample({
        ...base,
        reader: { extras: done, source: "ai" },
        shared: done,
        consentStatus: agreed,
      }),
    ).toBe(false);
  });

  it("自分の図鑑に無い語には頼まない", async () => {
    expect(
      await shouldLabelMainExample({
        ...base,
        owns: async () => false,
        reader: { extras: productionExtras(), source: "ai" },
        shared: null,
        consentStatus: agreed,
      }),
    ).toBe(false);
  });

  it("学習言語でない文の語には頼まない", async () => {
    expect(
      await shouldLabelMainExample({
        ...base,
        word: { ...word, example_sentence: "Eat ice cream." },
        reader: { extras: productionExtras(), source: "ai" },
        shared: null,
        consentStatus: agreed,
      }),
    ).toBe(false);
  });
});

describe("persistMainLabel — 項目の作り直しが書かせた札を部分的に書く（P1）", () => {
  function admin(word: Row, reader: Row | null) {
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
      data: true,
      error: null,
    }));
    const chain = (data: unknown): Record<string, unknown> => {
      const q: Record<string, unknown> = {
        eq: () => q,
        maybeSingle: async () => ({ data, error: null }),
      };
      return q;
    };
    return {
      rpc,
      db: {
        rpc,
        from: (t: string) => ({ select: () => chain(t === "words" ? word : reader) }),
      },
    };
  }
  const word = {
    headword: "冰淇淋",
    language: "zh-TW",
    example_sentence: MAIN,
    extras: productionExtras(),
  };
  const label = { scene: LABELS.ja, chunks: MAIN_CHUNKS, translation: TRANSLATIONS.ja };
  const key = { explainLang: "ja", l1: "ja" };

  it("札の無い行（読む人の行・同じ言語の共有の行）にだけ、名前を挙げた鍵で書く", async () => {
    const a = admin(word, { extras: productionExtras(), example_translation: "", source: "ai" });
    expect(await persistMainLabel({ wordId: "w1", key, sentence: MAIN, label, admin: a.db })).toBe(
      true,
    );
    expect(a.rpc).toHaveBeenCalledTimes(2);
    const [reader, shared] = a.rpc.mock.calls.map((c) => c[1]);
    expect(reader).toMatchObject({
      p_l1: "ja",
      p_scene: LABELS.ja,
      p_chunks: MAIN_CHUNKS,
      p_translation: TRANSLATIONS.ja,
    });
    expect(shared).toMatchObject({ p_l1: null, p_scene: LABELS.ja, p_translation: null });
  });

  it("語のメインの例文が変わっていたら書かない・人が確かめた読む人の行は書かない", async () => {
    const changed = admin({ ...word, example_sentence: "別的句子。" }, null);
    expect(
      await persistMainLabel({ wordId: "w1", key, sentence: MAIN, label, admin: changed.db }),
    ).toBe(false);
    expect(changed.rpc).not.toHaveBeenCalled();
    const verified = admin(word, {
      extras: productionExtras(),
      example_translation: "",
      source: "verified",
    });
    await persistMainLabel({ wordId: "w1", key, sentence: MAIN, label, admin: verified.db });
    expect(verified.rpc.mock.calls.map((c) => c[1].p_l1)).toEqual([null]);
  });
});
