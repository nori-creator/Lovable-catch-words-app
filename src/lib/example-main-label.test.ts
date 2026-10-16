import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExamplePatternSchema,
  alignExampleExtras,
  applyFixedMainExample,
  checkMainExampleLabel,
  mainExampleLabelRule,
  mainExampleNeedsTidy,
  mainExamplePatch,
  needsMainSceneLabel,
  pickExamplePatterns,
  sameSentence,
  sceneMaxChars,
  type ExamplePattern,
} from "./example-patterns";
import { CardReplySchema } from "./card-schema";
import {
  forgetMainExampleLabelAttempts,
  labelMainExample,
  mainExampleNeedsWork,
  type MainExampleLabelDeps,
} from "./example-scene-label.server";

/**
 * オーナー報告 2026-10-16: 冰淇淋 の1つ目の例文「夏天吃冰淇淋。」（場面の札より前に出来た共有の文）に札が無く、
 * 2つ目の例文には有る。`example_pattern_count` は 2 なのに `example_scene` / `example_scene_for` が無かった。
 */

const MAIN = "夏天吃冰淇淋。";
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
      { scene: LABELS.ja, translation: TRANSLATIONS.ja, chunks: [{ text: "冰淇淋", pos: "O" }] },
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
    expect(ex.example_chunks).toEqual([{ text: "冰淇淋", pos: "O" }]);
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
  it("AI が同じパターンと言った追加の例文は落とし、数は 1 + 残った数", () => {
    const label = checkMainExampleLabel(
      { scene: LABELS.ja, same_as_main: [0] },
      { sentence: MAIN, readerLang: "ja" },
    );
    const fix = mainExamplePatch(productionExtras(), { sentence: MAIN, headword: "冰淇淋", label });
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

// --- 古い行を開いた時の札だけの呼び出し ------------------------------------------------------

type Row = Record<string, unknown>;

function fakeDb(state: { word: Row; owned: boolean }) {
  const updates: Row[] = [];
  const db = {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: t === "words" ? { ...state.word } : null,
            error: null,
          }),
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: state.owned ? { id: "s1" } : null, error: null }),
            }),
          }),
        }),
      }),
      update: (row: Row) => ({
        eq: async () => {
          updates.push(row);
          state.word = { ...state.word, ...row };
          return { error: null };
        },
      }),
    }),
  };
  return { db, updates };
}

function setup(opts: {
  lang: (typeof READERS)[number];
  reader?: Row | null;
  sharedExtras?: Row;
  owned?: boolean;
  reply?: string;
}) {
  const state = {
    word: {
      headword: "冰淇淋",
      language: "zh-TW",
      example_sentence: MAIN,
      extras: opts.sharedExtras ?? productionExtras(),
    } as Row,
    owned: opts.owned ?? true,
  };
  const { db, updates } = fakeDb(state);
  const merges: Array<{ key: unknown; patch: Record<string, unknown> }> = [];
  const prompts: string[] = [];
  const reader =
    opts.reader === undefined
      ? {
          example_translation: "夏にアイスを食べる。",
          extras: { ...productionExtras(), explain_lang: opts.lang },
          source: "ai",
        }
      : opts.reader;
  const deps: MainExampleLabelDeps = {
    admin: db,
    readReader: async () => reader as never,
    mergeReader: async (_a, _w, key, patch) => {
      merges.push({ key, patch: patch as Record<string, unknown> });
      return true;
    },
    allow: async () => undefined,
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
  return { deps, state, updates, merges, prompts };
}

describe("labelMainExample — 古い行を開いた時に札だけを書く", () => {
  beforeEach(() => forgetMainExampleLabelAttempts());

  it.each(READERS)(
    "%s: 決まった文を渡して札だけを書かせ、読む人の行に札と目印を書く",
    async (lang) => {
      const t = setup({ lang, sharedExtras: { ...productionExtras(), explain_lang: lang } });
      const r = await labelMainExample(t.deps, {
        userId: "u1",
        wordId: "w1",
        key: { explainLang: lang, l1: "ja" },
      });
      expect(r.outcome).toBe("labelled");
      expect(t.deps.generate).toHaveBeenCalledTimes(1);
      expect(t.prompts[0]).toContain(`「${MAIN}」`);
      expect(t.prompts[0]).toContain("この文は変えない");
      expect(t.prompts[0]).toContain(`${sceneMaxChars(lang)}字以内`);
      expect(t.merges).toHaveLength(1);
      const patch = t.merges[0].patch.extras as Record<string, unknown>;
      expect(patch.example_scene_for).toBe(MAIN);
      expect(String(patch.example_scene).length).toBeGreaterThan(0);
      // 文そのものは書かない
      expect(t.updates.every((u) => !("example_sentence" in u))).toBe(true);
      // 共有の行（同じ言語）にも札が付く
      const shared = t.state.word.extras as Record<string, unknown>;
      expect(shared.example_scene_for).toBe(MAIN);
      expect(needsMainSceneLabel(MAIN, shared)).toBe(false);
    },
  );

  it("同じ行はしばらく呼び直さない", async () => {
    const t = setup({ lang: "ja", reply: JSON.stringify({ example_main: { scene: "" } }) });
    const input = { userId: "u1", wordId: "w1", key: { explainLang: "ja", l1: "ja" } };
    expect((await labelMainExample(t.deps, input)).outcome).toBe("failed");
    expect((await labelMainExample(t.deps, input)).outcome).toBe("skipped");
    expect(t.deps.generate).toHaveBeenCalledTimes(1);
    expect(t.merges).toHaveLength(0);
  });

  it("読む人の言語でない札は書かない", async () => {
    const t = setup({
      lang: "en",
      reply: JSON.stringify({ example_main: { scene: LABELS.ja } }),
    });
    const r = await labelMainExample(t.deps, {
      userId: "u1",
      wordId: "w1",
      key: { explainLang: "en", l1: "ja" },
    });
    expect(r.outcome).toBe("failed");
    expect(t.merges).toHaveLength(0);
    expect(t.updates).toHaveLength(0);
  });

  it("自分の図鑑に無い語は呼ばない", async () => {
    const t = setup({ lang: "ja", owned: false });
    const r = await labelMainExample(t.deps, {
      userId: "u1",
      wordId: "w1",
      key: { explainLang: "ja", l1: "ja" },
    });
    expect(r).toEqual({ outcome: "skipped", reason: "not owned" });
    expect(t.deps.generate).not.toHaveBeenCalled();
  });

  it("共有の行に札が在れば、AI を呼ばずに読む人の行へ写す", async () => {
    const t = setup({
      lang: "ja",
      sharedExtras: { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN },
    });
    const r = await labelMainExample(t.deps, {
      userId: "u1",
      wordId: "w1",
      key: { explainLang: "ja", l1: "ja" },
    });
    expect(r.outcome).toBe("labelled");
    expect(t.deps.generate).not.toHaveBeenCalled();
    expect((t.merges[0].patch.extras as Row).example_scene).toBe(LABELS.ja);
  });

  it("AI が同じパターンと言った追加の例文は落とす（入れ替える鍵として渡す）", async () => {
    const t = setup({
      lang: "ja",
      reply: JSON.stringify({ example_main: { scene: LABELS.ja, same_as_main: [0] } }),
    });
    await labelMainExample(t.deps, {
      userId: "u1",
      wordId: "w1",
      key: { explainLang: "ja", l1: "ja" },
    });
    const patch = t.merges[0].patch as { extras: Row; replaceKeys: string[] };
    expect(patch.extras.examples_extra).toEqual([]);
    expect(patch.extras.example_pattern_count).toBe(1);
    expect(patch.replaceKeys).toEqual(["examples_extra"]);
  });

  it("札がもう在る行は何もしない（開くたびに呼ばない）", async () => {
    const done = { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN };
    const t = setup({
      lang: "ja",
      reader: { example_translation: "x", extras: done, source: "ai" },
      sharedExtras: done,
    });
    const r = await labelMainExample(t.deps, {
      userId: "u1",
      wordId: "w1",
      key: { explainLang: "ja", l1: "ja" },
    });
    expect(r.outcome).toBe("skipped");
    expect(t.deps.generate).not.toHaveBeenCalled();
  });
});

describe("mainExampleNeedsWork — getWordExplanation が裏の呼び出しを頼むか", () => {
  it("本番の 冰淇淋 の行は頼む / 札が在れば頼まない / 学習言語でない文は頼まない", () => {
    expect(mainExampleNeedsWork(productionExtras(), MAIN, "冰淇淋", "zh-TW")).toBe(true);
    expect(
      mainExampleNeedsWork(
        { ...productionExtras(), example_scene: LABELS.ja, example_scene_for: MAIN },
        MAIN,
        "冰淇淋",
        "zh-TW",
      ),
    ).toBe(false);
    expect(mainExampleNeedsWork(productionExtras(), "Eat ice cream.", "冰淇淋", "zh-TW")).toBe(
      false,
    );
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
    expect(ai).toMatch(/keepVerifiedExample && !fixedExampleMain/);
  });

  it("単語の詳細を開いた時: 札の無い行は返事の後で札だけを書く", () => {
    const we = src("word-explanation.functions.ts");
    expect(we).toMatch(/mainExampleNeedsWork\(/);
    expect(we).toMatch(/scheduleMainExampleLabel\(/);
    // サーバだけの道具は handler の中で読み込む（画面の束に入れない）
    expect(we).not.toMatch(/^import .*example-scene-label\.server/m);
  });
});
