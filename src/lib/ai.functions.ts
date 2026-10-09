import { createServerFn } from "@tanstack/react-start";
import { meaningRule, distinctionRule, shortMeaning, withShortMeaning } from "@/lib/meaning-rule";
import { mnemonicRule } from "@/lib/mnemonic-rule";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";
import {
  hasSection as profileHasSection,
  readingPromptNames,
  targetProfile,
} from "./target-profile";
import { resolveLevel } from "./level-source";
import { JLPT_SCALE, LEVEL_INDEXES, parseLevelStep } from "./level-scale";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { pickReportedItem, reportContext } from "@/lib/report-locate";
import { CATEGORY_CHOICE_RULES_JA, CATEGORY_KEYS, ROOM_KEYS, normalizeCategory } from "./category";
import { orderByRegister } from "./candidate-order";
import {
  ConjugationRowSchema,
  CounterSchema,
  ExtrasSchema,
  KanjiBreakdownSchema,
  RegenUsageChunksSchema,
  emptyExtras,
  mergeExtras,
  normalizeExtras,
} from "./extras";
import { readerText, scrubForReader, scrubForeignNotes } from "./note-language";
import { explanationKey } from "./word-explanation";
import { mergeIntoReaderExplanation, readReaderExplanation } from "./word-explanation.functions";
import { worldExampleRule, sharedExampleSourceRule } from "./example-sources";
import { CardSchema, CardShapeError, type GeneratedCard } from "./card-schema";
import { fillSharedWordFromCard, recordGeneratedCards, trustedCardFrom } from "./generated-cards";
import { runAfterResponse } from "./after-response";
import {
  AiAttemptsFailed,
  hedgeAfterFromEnv,
  runAiAttempts,
  type AiAttemptRecord,
} from "./ai-attempts";
import { fitSuggestionsToReader } from "./first-catch-meaning";
import { WordCandidatesSchema, legacyUsageOf, normalizeRegister } from "./text-search-flow";

// 形は `card-schema.ts` に移したが、**取り込み元は変えない** —
// 5箇所が `@/lib/ai.functions` から型を取っている。移した都合を
// 呼ぶ側に押し付けない。
export type { GeneratedCard };
import { coerceTargetHeadword, isTargetHeadword, keepTargetHeadwords } from "./target-language";
import { taiwanUsageFrom } from "./taiwan-usage";
import {
  REGEN_SECTIONS,
  sectionNeedsFill,
  type RegenSection,
  type SectionId,
} from "./card-sections";
import { stripUnrequested, wantsSection } from "./card-request";
import {
  consensusFixPatch,
  dictionaryFixPatch,
  shouldApplyCorrection,
  type ReadingAnswer,
  verdictFromLlm,
  type CorrectionVerdict,
} from "./correction-judge";
import { choice as jevChoice, choiceProb } from "./jev";
import { reportMayRegenerate } from "./plan-limits";
import {
  DICTIONARY_SELECT,
  resolveDictionaryFields,
  type RawDictionaryRow,
} from "./dictionary-entry";
import {
  assertWithinDailyCap,
  getAi,
  getAiFor,
  getAiAttemptChain,
  getUserLevelGoal,
  getUserTargetLanguage,
  levelInstruction,
  explanationLanguageRule,
  getExplanationLanguage,
  explanationLanguageName,
  getLearnerL1,
  l1Rule,
  isProUser,
  logUsage,
  parseJsonFromAiText,
  withModelFallback,
  generateStructured,
  type AiConfig,
} from "./ai-provider.server";

/**
 * 台湾華語の読みの検査（`tw-reading.server.ts`）。辞書（pinyin-pro）が大きいので
 * **使うときに読む** — 静的に読むと、サーバー関数の中身ごと束ねる UI ハーネスに入る。
 */
const loadReadingCheck = () => import("./tw-reading.server").then((m) => m.correctTaiwanReading);

const SuggestInput = z.object({
  // Cap ~8MB base64 (~6MB raw) to prevent cost/memory abuse via AI vision calls.
  imageBase64: z.string().min(100).max(8_000_000),
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
  levelGoal: z.string().default("TOCFL-2"),
});

const SuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        headword: z.string(),
        reading_zhuyin: z.string().optional().default(""),
        pinyin: z.string().optional().default(""),
        meaning_ja: z.string(),
        /** 他の候補との**使い分け**を一言(例: トイレに置く方)。
            日本語の1語が台湾華語では複数の別語になるので、意味だけでは選べない。
            出せなかった回もあるので既定は空 — 空なら描かない。 */
        distinction: z.string().optional().default(""),
        // カード側で踏んだのと同じ罠。棚名が一覧の外だと、
        // **5件まとめて**落ちて「AI did not return structured suggestions」
        // しか残らない。棚は後から直せるので、ここで語を捨てない。
        category_key: z.enum(CATEGORY_KEYS).catch("other"),
        /**
         * その呼び方の**ふだん度**（2026-09-27）。`common` = ネイティブが日常で
         * いちばんよく口にする呼び方、`specific` = 正確・専門的な名前、
         * `proper` = 固有名詞。並べ替えにだけ使う（**消さない**）。
         */
        register: z.enum(["common", "casual", "specific", "proper"]).optional().catch(undefined),
        /**
         * **写真のどの物か**の番号（2026-09-27）。写っている別々の物に 0,1,2…、
         * 同じ物の別の呼び方には同じ番号。画面はこれで1段目（物ごとに1語）と
         * 2段目（その物のほかの言い方）に分ける（`groupCandidates`）。
         */
        group: z.number().int().min(0).max(20).optional().catch(undefined),
      }),
    )
    // 件数も固定しない。4件返ってきた回に**1件も出さない**のは重すぎる。
    // 物ごとに別の言い方も返すので、上限は 12。
    .min(1)
    .max(12),
});

/**
 * **候補の意味と読みを控える**（監査 2026-10-03 M3、`generated-cards.ts`）。
 *
 * キャッチの画面は候補を選んだ瞬間にその意味でカードを出し、`generateCard` の完成を
 * 待たずに保存できる。その時に新しく作る共有の語の行は、画面の送った文ではなくこの控えから
 * 中身を取る。返事は待たせない（人が候補を選んで保存するまでには間がある）。
 */
async function recordCandidateReceipts(
  language: string,
  items: ReadonlyArray<{
    headword: string;
    meaning_ja?: string;
    reading_zhuyin?: string;
    pinyin?: string;
    category_key?: string;
  }>,
): Promise<void> {
  if (items.length === 0) return;
  await runAfterResponse("record candidate receipts", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await recordGeneratedCards(
      supabaseAdmin,
      items.map((c) => ({
        language,
        headword: c.headword,
        kind: "candidate" as const,
        card: {
          meaning_ja: c.meaning_ja,
          reading_zhuyin: c.reading_zhuyin,
          pinyin: c.pinyin,
          category_key: c.category_key,
        },
      })),
    );
  });
}

/** 撮った後の候補: 1回ごとの締め切り（1番手・2番手）。画面の待ちは 20 秒。 */
const SUGGEST_ATTEMPT_TIMEOUTS = [18_000, 13_000];
/** 1番手がこの時間までに答えなければ2番手を並べる（`AI_HEDGE_AFTER_MS` で変更、`0` で止める）。 */
const SUGGEST_HEDGE_AFTER_MS = 6_000;

/**
 * 撮った後の候補の1回を `ai_runs` に残す（`loop="capture_suggest"`）。中身は成否・待ち時間・
 * 答えた AI の名前・各回の結果だけ — 写真・語は入れない。返事は待たせない。
 */
function recordSuggestRun(
  context: { userId: string; supabase: { from: (t: "ai_runs") => unknown } },
  run: {
    ok: boolean;
    ms: number;
    aiMs: number | null;
    via?: string;
    hedged?: boolean;
    attempts: AiAttemptRecord[];
  },
): void {
  console.info(
    `suggestWords: ${run.ok ? "ok" : "failed"} in ${run.ms}ms` +
      (run.via ? ` via ${run.via}` : "") +
      (run.hedged ? " (hedged)" : ""),
  );
  void runAfterResponse("suggestWords: ai_runs", async () => {
    const table = context.supabase.from("ai_runs") as {
      insert: (row: unknown) => PromiseLike<{ error: { message: string } | null }>;
    };
    const { error } = await table.insert({
      user_id: context.userId,
      loop: "capture_suggest",
      iterations: run.attempts.length,
      accepted: run.ok ? 1 : 0,
      meta: {
        ok: run.ok,
        ms: run.ms,
        ai_ms: run.aiMs,
        ...(run.via ? { via: run.via } : {}),
        hedged: run.hedged ?? false,
        attempts: run.attempts.map((a) => ({
          label: a.label,
          ms: a.ms,
          outcome: a.outcome,
          ...(a.code ? { code: a.code } : {}),
          ...(a.startMs ? { startMs: a.startMs } : {}),
        })),
      },
    });
    if (error) console.warn("suggestWords: ai_runs insert failed", error.message);
  });
}

export const suggestWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data, context }) => {
    // 外部の AI へ送る前の同意（`ai-consent.ts`）。無ければ何も送らずに断る。
    await (await import("./ai-consent.server")).assertAiConsent(context.userId);
    const startedAt = Date.now();
    // AI の前の読み出し（使う AI・枠の確保・級・解説の言語）は**並べて**待つ（実物確認
    // 2026-10-03: シャッターから候補まで 4.5〜42 秒。前はここで4〜5往復を1つずつ待っていた）。
    // 枠の確保が断られたら、そこで止まる（AI は呼ばない）。
    // レベルはクライアントの申告ではなく**プロフィールを正**とする
    // (以前は既定の TOCFL-2 が常に使われ、設定が効いていなかった)。
    // 級は**細かさの目安**としてだけ使う(下の `specificity`)。
    const [chain, , levelGoal, langRule, reader] = await Promise.all([
      getAiAttemptChain("scan"),
      assertWithinDailyCap(context.userId, "suggest"),
      getUserLevelGoal(context.userId),
      explanationLanguageRule(context.userId, data.targetLanguage),
      getExplanationLanguage(context.userId),
    ]);
    const profile = targetProfile(data.targetLanguage);
    // **JLPT は数字の向きが逆**(N5 が入門)。数字を拾うと N5 の人が「上位」になり、
    // 専門の名前ばかり出る。JLPT だけは段(N5→1 … N1→5)で読む。
    // 台湾華語・英語の読み方は変えない(CEFR の "B1" を 1 と読んでいるのは前からの形)。
    const jlptStep = profile.levels.id === JLPT_SCALE.id ? parseLevelStep(levelGoal) : null;
    const levelNum =
      typeof jlptStep === "number" ? jlptStep : Number(levelGoal.match(/(\d)/)?.[1] ?? 2);

    // **ここに `levelInstruction` をそのまま掛けない。**
    //
    // あれは「語彙は必ずこの範囲に収める」と言う指示で、**解説や例文**には
    // 正しい。しかし**学ぶ語の候補**に掛けると、その人が既に知っている
    // 語しか出せなくなる。オーナー指摘(2026-08-20):
    //
    //   「三杯雞の画像をとっても雞肉としか表示されない。服を撮ったときに
    //     衣服としか表示されない。レベルの高い人が衣服という単語を
    //     調べないよね。短袖とかは調べるけど」
    //
    // 候補にとってレベルは**上限ではなく下限**で、「どこまで細かい名前で
    // 呼ぶか」を決める物。だから級の縛りは外し、細かさの指示に置き換える。
    // **例は言語ごとに違う。** 「短袖」「三杯雞」は台湾華語の例で、
    // 英語の学習者に渡しても手掛かりにならない。表は
    // `target-profile.ts` の `capture.specificity` が持つ。
    const band = levelNum <= 2 ? 0 : levelNum <= 4 ? 1 : 2;
    const bandName = ["入門〜基礎", "中位", "上位"][band];
    const specificity = `学習者は${bandName}の級。${profile.capture.specificity[band]}`;

    // **分岐しない。** 前は「台湾華語なら40行、それ以外は1行」だった。
    // カテゴリの規則も「上位の分類語に逃げない」も**写真の話であって
    // 言語の話ではない**ので、どの言語にも要る。言語で変わる所だけを
    // プロフィールから受け取る。
    const prompt = `この画像から、${profile.promptName}の学習対象として有用な名詞を5つ選んでください。
- ${profile.capture.scriptRule}
${specificity}
${langRule}
- 画像に明確に写っているものだけ

**写っている物そのものの名前を出す（いちばん大事）:**
- その言語を話す人がその写真を見て**最初に口にする名前**を出す。
  ${profile.capture.namingExamples}
- **確からしい順に並べる。** 1つ目が「これは何か」への答え。
  自信の無いものを上に置かない。

**写っている物ごとに分ける（group）:**
- 写っている**別々の物**に 0 から順に group の番号を振る（確からしい物ほど小さい番号）。
- 同じ物に別の呼び方（正確な名前・固有名詞・**砕けた言い方（略語・口語）**など）があれば、
  **同じ group の番号で**続けて出す。register は ふだん=common / 砕けた=casual /
  くわしい・専門的=specific / 固有名詞=proper。
  別の呼び方が無い物は1つだけでよい。無理に作らない。
- 物は最大5つ、1つの物の呼び方は最大3つ。

**同じ物の呼び方が複数あるときの並び（ふだんの呼び方を上に）:**
- ネイティブが日常でいちばんよく口にする呼び方を上に置く。正確・専門的な名前や
  固有名詞は**下に置くが、消さない**（register で印を付ける）。
  例: ${profile.capture.commonFirstExamples}
- ただし**具体性は失わない**。「三杯雞」を「雞肉」に、「短袖」を「衣服」にしない —
  ふだん使う呼び方と、上位の分類語は別物。

**カテゴリ分類ルール（厳守）:**
- 手・足・顔・目・耳・鼻・口・髪・指・肩・膝など人体部位 → "body"
- マウス・キーボード・PC・スマホ・タブレット・ヘッドホンなど電子機器 → "tech"
- 家具（椅子/机/ソファ） → "furniture"、家電（冷蔵庫/TV） → "appliance"
- 服 → "clothes"、靴 → "shoes"、鞄 → "bag"
- 果物 → "fruit"、野菜 → "vegetable"、飲み物 → "drink"、食べ物 → "food"、お菓子 → "dessert"
- 動物（子どもの動物も: 子豚・ひよこ） → "animal"、花 → "flower"、植物・キノコ → "plant"
- 車・バイク・電車・バスなど → "transport"
- 看板・標識 → "sign"、お店 → "shop"、建物 → "building"
- 文房具 → "stationery"、本 → "book"、お金 → "money"、薬 → "medicine"

**"other" は本当にどのカテゴリにも当てはまらないときの最終手段。手やマウスを "other" にするのは間違い。**

${distinctionRule(profile.promptName, profile.capture.distinctionExamples)}
- **distinction は15文字以内**。meaning_ja も**短く**（言い換え1つ。説明文にしない）。
  候補の画面は横に動かないので、長い文は読まれない（オーナー指示 2026-09-28
  「単語の説明が長すぎて、横にスクロールしないと見れないことがある。長すぎる文はなしで」）。`;

    const instruction = `${prompt}\n\n必ずJSONだけを返してください。**${profile.promptName}の語を出す。他の言語の語を混ぜない。**\n形式: {"suggestions":[{"headword":"${profile.capture.jsonHeadwordHint}",${profile.capture.jsonReadingHint},"meaning_ja":"意味(上で指定した解説の言語で)","distinction":"使い分けの一言","category_key":"${CATEGORY_KEYS.join("|")} のどれか","register":"common|casual|specific|proper のどれか","group":0}]}。**確からしい順に並べ**、物は3〜5つ返してください(無理に5つに埋めない — 写っていない物を足すぐらいなら少なくてよい)。同じ物の別の呼び方は同じ group で。`;
    const correctTaiwanReading = await loadReadingCheck();
    /**
     * **1番手が遅い時は2番手を並べて追いかける**（`ai-attempts.ts`、チュートリアルと同じ）。
     * 前は1回の呼び出しに締め切りが無く、AI SDK が黙って2回まで再送していた（詰まった
     * 相手を画面の 20 秒まで待ち続け、画面は「通信に時間がかかっています」）。いまは
     * 1番手 18 秒・2番手 13 秒の締め切りで、1番手が 6 秒（`AI_HEDGE_AFTER_MS`）答えなければ
     * 2番手を並べる。最悪 6 + 13 = 19 秒で、画面の 20 秒より先に理由つきで終わる。
     * 枠の確保は上の1回だけ。形の崩れた返事は「使えない返事」として、もう片方を待つ。
     */
    let outcome: Awaited<ReturnType<typeof runAiAttempts<z.infer<typeof SuggestionSchema>>>>;
    try {
      outcome = await runAiAttempts(
        chain.map((target, i) => ({
          label: target.label,
          timeoutMs: SUGGEST_ATTEMPT_TIMEOUTS[Math.min(i, SUGGEST_ATTEMPT_TIMEOUTS.length - 1)],
          run: async (signal: AbortSignal) => {
            const result = await generateText({
              model: target.model,
              abortSignal: signal,
              maxRetries: 0,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: instruction },
                    { type: "image", image: data.imageBase64 },
                  ],
                },
              ],
            });
            if (!result.text) throw new Error("SUGGEST_EMPTY");
            try {
              return SuggestionSchema.parse(parseJsonFromAiText(result.text));
            } catch (e) {
              // **理由を飲まない**(カード生成で踏んだのと同じ)。
              console.warn("suggestWords: 候補の形が合わない", {
                via: target.label,
                why: e instanceof Error ? e.message.slice(0, 300) : String(e),
                head: result.text.slice(0, 300),
              });
              throw new Error("SUGGEST_FORMAT");
            }
          },
        })),
        {
          hedgeAfterMs: hedgeAfterFromEnv(process.env.AI_HEDGE_AFTER_MS, SUGGEST_HEDGE_AFTER_MS),
          isUnusableReply: (e) =>
            e instanceof Error && (e.message === "SUGGEST_FORMAT" || e.message === "SUGGEST_EMPTY"),
          onAttemptFailed: (record, next) =>
            console.warn(
              `suggestWords: attempt failed: ${record.label} ${record.outcome} ${record.code ?? ""} after ${record.ms}ms` +
                (next ? ` — trying ${next}` : ""),
            ),
        },
      );
    } catch (e) {
      const failed = e instanceof AiAttemptsFailed ? e : null;
      recordSuggestRun(context, {
        ok: false,
        ms: Date.now() - startedAt,
        aiMs: failed?.ms ?? null,
        attempts: failed?.attempts ?? [],
      });
      if (failed?.attempts.some((a) => a.outcome === "unusable"))
        throw new Error("候補の形が整いませんでした。もう一度お試しください。");
      throw new Error("画像のAI読み込みに失敗しました");
    }
    recordSuggestRun(context, {
      ok: true,
      ms: Date.now() - startedAt,
      aiMs: outcome.ms,
      via: outcome.via,
      hedged: outcome.hedged,
      attempts: outcome.attempts,
    });
    const parsed = outcome.value;
    /**
     * **学習言語の語だけを返す**（オーナー報告 2026-10-02「英語の図鑑に
     * ノートが入っている」）。指示文に「他の言語の語を混ぜない」と書いても、
     * 返ってくる物は別。ここは打った語の候補（`suggestWordCandidates`）と
     * 違って**関所が無く**、英語を学ぶ人の候補に「ノート」がそのまま出て、
     * 選ぶと `en` の語として保存されていた。直せる物は直し（注釈を落とす）、
     * 直せない物は捨てる（`keepTargetHeadwords`）。
     */
    const usable = keepTargetHeadwords(parsed.suggestions, data.targetLanguage);
    if (usable.length === 0 && parsed.suggestions.length > 0) {
      // 全部が別の言語だった回。**黙って0件にしない** — 画面は「候補が無い」としか言えない。
      console.warn("suggestWords: 学習言語の候補が1つも無い", {
        target: data.targetLanguage,
        heads: parsed.suggestions.map((x) => x.headword).slice(0, 6),
      });
    }
    // 意味と使い分けの一言は**表示言語で**（チュートリアルと同じ関門、`first-catch-meaning.ts`）。
    // 別の言語で返った意味は空にする — 控え（共有の語の中身）にも残さない。
    const suggestions = fitSuggestionsToReader(
      orderByRegister(usable),
      reader,
      data.targetLanguage,
    ).map((s) => ({
      // 候補の読みも検める（`tw-reading.server.ts`）。
      ...correctTaiwanReading(data.targetLanguage, s.headword, s),
      // 候補の意味も語の長さに（R17「湯咖哩の英語の単語の候補…が長すぎる」）。
      meaning_ja: shortMeaning(s.meaning_ja),
      category_key: normalizeCategory(s.headword, s.category_key),
    }));
    await recordCandidateReceipts(profile.code, suggestions);
    return { suggestions };
  });

const CardInput = z.object({
  headword: z.string().min(1),
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
  hintCategory: z.string().optional(),
  /**
   * 画面でいま見えている節（`lib/card-prefs.ts`）。見えない節の欄は
   * 書かせない — 返事が短くなり、詳細が早くそろう（`lib/card-request.ts`）。
   * 渡さない呼び出しは、これまでどおり全部を書かせる。
   */
  sections: z.array(z.string().max(40)).max(40).optional(),
});

// extras の形は src/lib/extras.ts が唯一の定義(共有)。

// カードの形は `lib/card-schema.ts` が唯一の定義(試験もそこに在る)。

/**
 * 母語で書いた「もの + その場の様子」から、**台湾華語の名詞の候補**を出す。
 *
 * ## なぜ1語に決め打ちしないか
 * これまで日本語の入力は `generateCard` に直で渡り、**1語に決め打ち**して
 * いた。「ティッシュ」と書くと1つだけ返ってくるが、台湾では
 * 「衛生紙(トイレの)」と「面紙(ポケットの)」が別物で、どちらが欲しいかは
 * **その場の様子を聞かないと決まらない**(オーナー指摘)。
 * 決め打ちの代わりに、区別のついた候補を並べて選ばせる。
 *
 * ## 名詞だけ
 * ここは「撮ったものの名前が分からない」ときの入口。動詞や形容詞を混ぜると
 * 選ぶ手間が増えるだけで、欲しいものは出てこない。
 */
const WordCandidatesInput = z.object({
  /** 母語で書いた物の名前(例: ティッシュ)。 */
  query: z.string().min(1).max(60),
  /** どこで・どんな様子だったか(任意)。候補を絞る手がかり。 */
  scene: z.string().max(200).optional(),
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
  /**
   * 画面が手元で見分けた「打った語は何語か」（`lib/text-query-lang.ts`）。
   * 省いた呼び出し（古い iOS）は今までどおり母語として引く。
   */
  queryLang: z.enum(["target", "native", "ambiguous"]).optional(),
});

// 候補の形は `lib/text-search-flow.ts`（画面の決め事と試験が同じ物を読む）。
const CandidateSchema = WordCandidatesSchema;

/**
 * 候補の文体・場面と、古い iOS が読む印（`usage`）。印は文体から作る — 古い画面にも
 * 同じ物差しの札が出る（土地の印 `local` はもう作らない）。
 */
function registerFields(c: {
  register?: string | null;
  scene?: string | null;
  usage?: string | null;
}) {
  const register = normalizeRegister(c.register, c.usage);
  return {
    register,
    scene: (c.scene ?? "").trim().slice(0, 60),
    usage: legacyUsageOf(register),
  };
}

export const suggestWordCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WordCandidatesInput.parse(input))
  .handler(async ({ data, context }) => {
    // 外部の AI へ送る前の同意（`ai-consent.ts`）。無ければ何も送らずに断る。
    await (await import("./ai-consent.server")).assertAiConsent(context.userId);
    const ai = await getAiFor("scan");
    await assertWithinDailyCap(context.userId, "suggest");
    const levelRule = await levelInstruction(context.userId);
    const langRule = await explanationLanguageRule(context.userId, data.targetLanguage);

    const sceneLine = data.scene?.trim()
      ? `その場の様子: 「${data.scene.trim()}」。**この様子に合うものを優先**する。`
      : "その場の様子は聞けていない。よくある使い分けを並べる。";

    // 学習言語の名前も分け方の例も、言語の表から取る(決め打たない)。
    const candProfile = targetProfile(data.targetLanguage);
    const queryLine =
      data.queryLang === "target"
        ? `「${data.query}」はすでに${candProfile.promptName}の語として打たれている。query_is_target は true。candidates にはその語1つだけ（読み・意味）を返す。`
        : data.queryLang === "native"
          ? `「${data.query}」は学習者の母語（または別の言語）で打たれている。query_is_target は false。`
          : `「${data.query}」が**${candProfile.promptName}としてそのまま通じる語か**を先に判断し、query_is_target に true / false で書く（漢字だけの語は日本語とも${candProfile.promptName}とも読めるので、${candProfile.promptName}で実際にその意味でふつうに使う語なら true。日本語の字形・日本語にしか無い言い方なら false）。true なら candidates にはその語1つだけを返す。`;
    const prompt = `学習者が「${data.query}」と書いた。これが指す${candProfile.promptName}の語を挙げてください。

${queryLine}
${sceneLine}
${levelRule}
${langRule}

守ること:
- **品詞を選ばない。** 書かれた物が動詞なら動詞、形容詞なら形容詞で答える
  (「走る」→ 跑步 / 跑、「速い」→ 快)。
  ここは**写真に写った物の候補ではなく、人が打ち込んだ言葉**なので、
  名詞に絞ると動詞や形容詞を打った人に候補が1つも返らない。
  返らないと母語のまま次へ渡り、最後に「学んでいる言語の単語ではありません」
  とだけ出る — 打った人には**機能が壊れているようにしか見えない**
  (オーナー指摘 2026-08-20「単語の文字入力がエラーが出て、機能してない」)。
- **一対一なら1つだけ。** 母語の語と${candProfile.promptName}の語がほぼ一対一に対応するなら、
  候補は1つだけ返す。**候補を水増ししない**（同じ物の言い換え・ほとんど使わない語・作った語を足さない）。
- **本当に割れる時だけ複数。** 母語の1語が${candProfile.promptName}では別々の語に分かれる時
  （指す物が違う・会話の言い方と書き言葉/専門用語/表示の言い方）だけ、
  2〜5個を**よく使う順**に並べる。
  例: ${candProfile.capture.distinctionExamples}
- **どの候補も同じ物差しで説明する**（学習者が並べて比べられるように）。それぞれに次の3つを書く:
  1. register — 文体を次のどれか**1つだけ**:
     spoken（話し言葉: ふだんの会話で口にする）/ written（書き言葉: 文章・ニュース・公文書）/
     both（会話でも文章でも同じように使う）/ technical（専門用語・学術: 料理人・医療・研究などの言葉）/
     signage（表示・メニューの言葉: 店の札・品書き・包装・案内板で目にする）。
     「一般的」「台湾でよく使う」のような、文体ではない印は使わない。
  2. scene — **使う場面**を具体的に1つ（20文字程度。どこで聞く・見るか）。
     例: 「屋台・黑白切の店で注文するとき」「精肉店の表示・料理本」「駅の放送・時刻表」。
  3. distinction — **他の候補と比べた違い**（25文字程度）。その語だけの定義を書かない。
     必ず他の候補の語を挙げて比べる。例: 「豬頰肉より口語的。店で頼むならこちら」
     「嘴邊肉より改まった言い方。表示や料理本向き」。
     候補はどれも学習者が学ぶ土地で使う語なので、土地の話は**本当に違いがそこにある時だけ**ここに書く
     （例: 「台湾特有の言い方。〇〇は中国語圏で共通」）。候補が1つだけなら distinction は空でよい。
  違いが書けない候補は挙げない — 同じ物の言い換えを並べても選べない。
- それぞれの image_query に、その物を写真で探すための**短い英語**（2〜4語。例: "lotus root"）を書く。
  物の形が無い語（動詞・形容詞・抽象語）でも、その意味が伝わる場面を短く。
- meaning_ja は一行の短い訳だけ（その語の意味が分かる程度。使い方・場面・違いはここに書かない）。
- 実際に${candProfile.promptName}で使われている語だけ。${candProfile.capture.scriptRule}。
  中国大陸でしか使わない言い方は出さない。
- **確かなものだけ**。

出力の形: {"query_is_target":true/false,"candidates":[{"headword":"…","reading_zhuyin":"…","pinyin":"…","meaning_ja":"…","register":"spoken","scene":"…","distinction":"…","image_query":"…"}]}`;

    const ask = (extra = "") =>
      generateStructured({
        model: ai.gateway(ai.modelFast),
        schema: CandidateSchema,
        prompt: prompt + extra,
      });

    let raw = await ask();
    /**
     * **0件は「そんな語は無い」ではないことが多い。**
     * `CandidateSchema` は `.default([])` を持つので、生成の形が読めなかった
     * ときも**静かに0件**になる（鍵が違う・前後に説明が付く・配列だけ返す）。
     * 画面はそれを「単語が見つかりませんでした」と言うので、打った人からは
     * 機能そのものが壊れているように見える
     * （オーナー報告 2026-09-22「カメラの検索で日本語での検索ができない」）。
     *
     * 0件のときだけ、**形をはっきり言い直して一度だけ引き直す。**
     * 上限の数え方は変えない（`assertWithinDailyCap` は1回ぶんのまま）—
     * 失敗した回を二重に数えると、直そうとして上限を削ることになる。
     */
    if (raw.candidates.length === 0) {
      raw = await ask(
        `\n\n出力の形: {"query_is_target":true/false,"candidates":[{"headword":"…","reading_zhuyin":"…","pinyin":"…","meaning_ja":"…","register":"spoken","scene":"…","distinction":"…","image_query":"…"}]} のJSONだけを返す。前後に説明を書かない。headword は${candProfile.promptName}の語だけにし、括弧やローマ字の注釈を付けない。`,
      );
    }

    // 生成物は必ず想定外を出す。**学んでいる言語でないものは落とす** —
    // ここを通すと、母語がそのまま見出しになる元の不具合に戻る。
    // ただし**捨てる前に一度だけ直す**（`coerceTargetHeadword`）: 頼んで
    // いない注釈（「烤肉 (BBQ)」）が付いただけで、中身は正しいことがある。
    const correctTaiwanReading = await loadReadingCheck();
    const seen = new Set<string>();
    const candidates = raw.candidates
      .map((c) => ({
        ...c,
        headword: coerceTargetHeadword(c.headword, data.targetLanguage) ?? "",
        meaning_ja: shortMeaning(c.meaning_ja),
      }))
      .filter((c) => c.headword && isTargetHeadword(c.headword, data.targetLanguage))
      .filter((c) => {
        if (seen.has(c.headword)) return false;
        seen.add(c.headword);
        return true;
      })
      .slice(0, 5)
      // 候補の読みも検める（`tw-reading.server.ts`）。
      .map((c) => correctTaiwanReading(data.targetLanguage, c.headword, c))
      .map((c) => ({
        headword: c.headword,
        reading_zhuyin: c.reading_zhuyin,
        pinyin: c.pinyin,
        meaning_ja: c.meaning_ja,
        distinction: c.distinction.trim().slice(0, 80),
        // 文体の札と使う場面（2026-10-09。古い画面は読まない — 足しただけ）。
        ...registerFields(c),
        image_query: (c.image_query ?? "").trim().slice(0, 80),
      }));
    await recordCandidateReceipts(candProfile.code, candidates);
    // 手元で分かった時はそれを返す（AI の判定より確か）。
    const query_is_target =
      data.queryLang === "target"
        ? true
        : data.queryLang === "native"
          ? false
          : typeof raw.query_is_target === "boolean"
            ? raw.query_is_target
            : null;
    return { candidates, query_is_target };
  });

/**
 * 解説の言語と学ぶ言語が同じか（台湾華語で読む人が台湾華語を学ぶ等）。
 * 同じなら「学ぶ言語で書かない」と指示すると矛盾する。
 */
function sameLanguage(explainLang: string, targetCode: string): boolean {
  const base = (x: string) => (x ?? "").toLowerCase().split("-")[0];
  return base(explainLang) === base(targetCode);
}

export const generateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CardInput.parse(input))
  .handler(async ({ data, context }) => {
    // 外部の AI へ送る前の同意（`ai-consent.ts`）。無ければ何も送らずに断る。
    await (await import("./ai-consent.server")).assertAiConsent(context.userId);
    const ai = await getAiFor("card");
    await assertWithinDailyCap(context.userId, "card");
    const levelGoal = await getUserLevelGoal(context.userId);
    const levelRule = await levelInstruction(context.userId);
    const langRule = await explanationLanguageRule(context.userId, data.targetLanguage);
    // 解説をどの言語で書くか。プロンプト本文に散らばる「日本語で」という
    // 指示が langRule と矛盾し、英語設定でも日本語の解説が返っていた。
    // 説明文の言語名をここで差し替えて矛盾を無くす。
    const explainLang = await getExplanationLanguage(context.userId);
    // **3つある表示言語を2つに潰さない。** ここは
    // `explainLang === "en" ? "英語" : "日本語"` だった — 繁體中文を
    // 選んだ人が「日本語」に落ち、AI が日本語で解説を書いていた
    // (オーナー報告「項目に日本語が混ざる」)。正は
    // `explanationLanguageName()` 1つ。
    const NL = explanationLanguageName(explainLang);
    // 発音のコツは**母語ごとに全く変わる**(有気音が無い/そり舌が無い等)。
    // 設定の母語から具体的な干渉項目を流し込む。
    const l1 = await l1Rule(context.userId, "pronunciation");
    // 語順・量詞・「的」の位置などは母語で崩れ方が違う。例文とチャンクを
    // 「その母語話者が実際に間違える所」に寄せるため、文法側も渡す。
    const l1Gram = await l1Rule(context.userId, "wordorder");
    const l1Info = await getLearnerL1(context.userId);
    const learnerL1 = l1Info.speakerJa;

    // **ここも分岐しない**(上の候補と同じ理由)。前は台湾華語以外が
    // 「発音、意味、品詞、レベル、カテゴリ、例文とその訳を生成してください」
    // の1行に落ちていて、カテゴリの規則も棚の提案も届かなかった。
    const cardProfile = targetProfile(data.targetLanguage);
    // **辞書を引く言語と、級の目盛りを同じ値から出す。** 別々に書くと、
    // 英語のカードを台湾華語の辞書で引く回ができる。
    const cardLanguage = cardProfile.code;
    // 読みの呼び名は言語ごと(注音/拼音 と IPA 米/英)。`readings` から引く。
    const cardReadingNames = readingPromptNames(cardProfile);
    // **保存する形をそのまま並べる**(`TOCFL-1` / `A1`)。名前(`1` / `A1`)を
    // 並べると、AI が `1` と答えて `parseLevelStep` の外に落ちる。
    const levelNames = LEVEL_INDEXES.map((n) => cardProfile.levels.toStored(n)).join(" / ");
    // 見えない節の欄は頼まない（`lib/card-request.ts`）。
    const want = (id: SectionId) => wantsSection(data.sections, id);
    // **その言語のカードに在る節だけ**を頼む欄(日本語の節)。`want` だけで見ると、
    // 節の一覧を渡さない呼び出しで台湾華語・英語のカードにも漢字の内訳を頼むことになる。
    const wantOwn = (id: SectionId) => profileHasSection(cardProfile, id) && want(id);
    // 助数詞の節を持つ言語(日本語)には、台湾華語の量詞(繁体字・注音)を頼まない。
    // 台湾華語・英語の頼み方はそのまま(節の一覧が無い呼び出しでは前から頼んでいる)。
    const wantMeasure = want("measure_words") && !profileHasSection(cardProfile, "counters");
    const noteSection: SectionId = cardProfile.capture.noteField;
    // 日本語の節の行。日本語以外のカードでは空 — **空なら行ごと足さない**
    // (台湾華語・英語の指示文を1文字も変えないため)。
    const jaLines = japaneseSectionLines(wantOwn, NL);
    const prompt = `「${data.headword}」について、${cardProfile.promptName}の語彙カードを生成してください。

${langRule}
${levelRule}

入力語の扱い:
- 入力が${cardProfile.promptName}なら headword_zh にそのまま入れる。
- 入力が母語(日本語・繁體中文など)なら、**最も日常的に使われる${cardProfile.promptName}の対応語**に変換し headword_zh に入れる(例:「マンゴー」→「芒果」/「傘」→「umbrella」)。

必須項目:
- headword_zh: 上記ルールで決めた${cardProfile.promptName}の見出し語
${cardProfile.capture.readingRule}
- meaning_ja: ${meaningRule(cardProfile.promptName, NL)}
- part_of_speech: ${cardProfile.capture.posRule}
- level: ${cardProfile.levels.id} のレベル（${levelNames} のいずれか）。
  **公式の語彙表に載っていると確信できないときは "${cardProfile.levels.outStored}"（級外）と答える。**
  検定の語彙表に無い語に級を付けると、公式の級と見分けが付かなくなる
  （オーナー指摘 2026-08-27 ⑭）。当てずっぽうで級を付けるより、級外のほうが正しい。
- category_key: ${CATEGORY_KEYS.join("/")} のどれか。
  ${CATEGORY_CHOICE_RULES_JA.replace(/\n/g, "\n  ")}
- new_shelf: **上の一覧のどれを選んでも「その語らしくない」ときだけ**、新しい棚を提案する。
  当てはまる棚が在るなら **null**(無理に作らない — 似た棚が乱立すると図鑑が壊れる)。
  形式: {key: 英小文字とアンダースコアのみ(例 "night_market_snack"), label: 棚の名前(${NL}・24字まで),
  emoji: 絵文字1つ, room_key: ${ROOM_KEYS.join("/")} のどれか、または新しい部屋の英小文字の鍵,
  room_label: 部屋の名前(${NL}・24字まで)}。
  棚は「街で見かけて集めたくなるまとまり」の粒度で。1語専用の棚は作らない。
- example_sentence: ネイティブが「${data.headword}」を使う**いちばん自然で、いちばんよく出会う場面を1つだけ**選び、その場面でそのまま言う一文（${cardProfile.promptName}）。辞書的な作文・説明文にしない。学習者の目標レベルは ${levelGoal} — 語彙・文型はこのレベル以下に抑える（上のレベルほど、その場面らしい言い回しを使ってよい）
  ${worldExampleRule(NL, cardProfile.code)}
- example_translation: 例文の訳(${NL})

extras 項目（**すべて具体的な内容で必ず埋めること**。空文字・空配列で返さない）:

チャンク分解の共通ルール: parts/chunks は {text: ${cardProfile.promptName}のパーツ, pos: 役割} の配列。
pos は ${cardProfile.chunkRoles.join(" / ")} を使う。
「${data.headword}」自体は必ずどれかのパーツとして含める。${NO_PLUS_PART_RULE}

${
  want("usage_chunks")
    ? `- usage_chunks: ネイティブが「${data.headword}」を**実際にいちばん高い頻度で**組み合わせて使う型を3〜5個。各 {parts:[{text,pos,slot,ja,alts}], ja:その型の自然な訳だけ(${NL}。説明・注釈・括弧書きは書かない)}。
  ${formulaChunkRule(cardProfile.code)}
  **厳選する。思いつく組み合わせを並べない。** その語で口を開いたときに最初に出る形だけを、頻度の高い順に。
  ${specificChunkRule(data.headword, levelGoal)}
  **短くする**: ${cardProfile.chunkPrompt.lengthRule} それを超えるものは型ではなく例文なので、例文の欄に任せる。
  そのまま声に出せる形にする。「${data.headword}」自体を必ずどれかのパーツに含める。
  ${cardProfile.chunkPrompt.styleRule}
  **${learnerL1}が崩しやすい型を優先する**。該当する型があれば ja に「母語だとこう言いたくなるが${cardProfile.promptName}ではこの形」と一言添える。
${l1Gram}`
    : ""
}
- example_chunks: example_sentence をパーツ分解した [{text,pos}]
${
  want("examples_extra")
    ? `- examples_extra: 追加例文2つ {zh, ja, scene:いつ・どんな気持ちで言うか(短く、${NL}で), chunks:[{text,pos}]}（語彙は ${levelGoal} 以下）
  ${worldExampleRule(NL, cardProfile.code)}`
    : ""
}
- usage_context: ネイティブがこの語をどこで見て・使うか（スーパー/夜市/レストラン/ニュース/SNS/新聞など具体的な場所・メディア）と頻度感を1〜2文(${NL})で
- frequency_level: 使用頻度 1〜5 の整数（5=毎日レベル、1=まれ）
- image_query: ${IMAGE_QUERY_RULE}
- image_avoid: ${IMAGE_AVOID_RULE}
- encounter_labels: **この語に出会いやすい所を、短い札で3〜7個**。
  各 {kind, label}。kind は place(場所) / situation(状況) / emotion(気持ち) /
  time(時刻・時期) / media(媒体) / season(季節) / trait(その物じたいの性質) のどれか。
  label は**2〜5文字の具体名**(${NL})。例:
  place「スーパー」「夜市」「駅」/ media「メニュー」「看板」「ニュース」/
  time「朝」「夜」/ season「春」/ situation「注文するとき」/
  emotion「うれしい時」/ trait「熱い」「持ち歩ける」「使い捨て」。
  trait は**その物の手ざわり・大きさ・熱さ・扱い方**など、出会う場所では
  なく物そのものの性質。物でない語(動詞・形容詞)には付けない。
  **抽象語を書かない** —「日常」「いろいろ」「一般的」は札にならない。
  その語に**特に**出会いやすい所だけを挙げる。どこでも出会う語なら
  無理に埋めず少なく返す。
- register_tag: "口語" / "書面" / "口語・書面" のどれか
- register_scale: 話し言葉⇄書き言葉の度合いを **-2〜+2 の整数**で。-2=完全に口語(友達との会話・SNSだけ)/ -1=やや口語 / 0=中立(どちらでも普通に使う)/ +1=やや書面 / +2=完全に書面(新聞・論文・公文書だけ)。**判断できない語でも必ず出す** — 中立なら 0
- scene_weights: **その語にどこで出会うか**の分布。鍵は次の8つだけで、他を作らない: eat(食べ物・飲み物)/ town(街・店・看板・乗り物)/ house(家の中・家具・道具)/ wear(服・持ち物)/ play(遊び・趣味・道具)/ nature(自然・天気・動植物)/ people(人・体・仕事)/ marks(文字・記号・色・形・お金・書類)。合計が1になる小数で、当てはまらない部屋は入れない。例: 芒果 → {"eat":0.7,"town":0.2,"nature":0.1}
- season_months: 旬の月を1〜12の整数の配列で(例: 芒果なら [5,6,7,8])。**通年なら空配列**
- region_scope / region_scope_kind: **「そこにしか無い」と言い切れる時だけ**。
  region_scope に地名(例:「台南」「台湾」)、region_scope_kind に理由を
  specialty(その土地の産物・名物) / institution(その土地にしか無い仕組み・店・制度) /
  regional_word(語そのものがその土地でしか使われない言い方) のどれかで返す。
  **どれとも言えないなら region_scope は空文字、region_scope_kind は null。**
  訊いているのは「この語をどこで見かけたか」ではなく「**そこ以外には無いか**」。
  ✗ 立扇(扇風機)・冷氣(エアコン)・泡芙(シュークリーム)・葡式蛋塔(エッグタルト)・
    棒(すごい) … どれも台湾で見かけるが、台湾にしか無い物ではない → 空文字
  ○ 文旦・肉燥麵(台湾の名物 → specialty) / 悠遊卡(台湾だけの仕組み → institution) /
    その土地だけの言い方(→ regional_word)
  **迷ったら空文字にする。** 誤って限定と書くほうが、書かないより害が大きい
${want("related_words") ? `- related_words: 類義語(kind:"syn")2〜3・反義語(kind:"ant")0〜2・関連語(kind:"rel")2〜5 の配列。**反義語が無い語(物の名前など)は無理に作らず、その語を使うときに一緒によく使う語を関連語で出す**（例: ${cardProfile.capture.relatedExample}）。各 {word:${cardProfile.promptName}の語, kind, note:使い分け・関係の短い説明(${NL}), reading:その語の${cardReadingNames.primary}${cardReadingNames.alt ? `, reading_alt:その語の${cardReadingNames.alt}` : ""}}。類義語の note には「${data.headword}」とのニュアンスの違いを必ず書く。**note は全部の語に必ず${NL}で書く**${sameLanguage(explainLang, cardProfile.code) ? "" : `。**${cardProfile.promptName}で書かない**(${cardProfile.promptName}なのは word/reading だけ。${cardProfile.promptName}の note は読めないので捨てられ、解説の無い語だけが残る)`}。**reading を空にしない** — 読めない語を並べても覚えられない` : ""}
${wantMeasure ? `- measure_words: **名詞の場合のみ**、その名詞に使う量詞を1〜3個 {word:"一張"のように数字1つき繁体字, zhuyin:注音, pinyin:拼音, note:いつその量詞を使うか(複数ある場合は使い分けを短く、${NL}で)}。名詞でなければ空配列。**note を中国語で書かない** — 中国語なのは word/zhuyin/pinyin だけ` : ""}
${want("pronunciation_tips") ? `- pronunciation_tips: **${learnerL1}が${cardProfile.promptName}でつまずくポイントに絞った発音アドバイス**（2〜3文、${NL}）。\n${l1}\n  ${cardProfile.capture.pronunciationFocus}と、上の干渉項目のうち**この語に実際に当てはまるものだけ**を具体的に書く` : ""}
${want(noteSection) ? `- ${cardProfile.capture.noteField}: ${cardProfile.capture.noteRule}（${NL}）` : ""}${jaLines ? `\n${jaLines}` : ""}
${
  want("etymology")
    ? `- etymology: ${cardProfile.capture.etymologyRule}（${NL}）
${cardProfile.capture.relativesRule ? `- etymology_relatives: ${cardProfile.capture.relativesRule}（note は${NL}）` : "- etymology_relatives: **空配列**"}
- radicals: ${cardProfile.capture.radicalsRule}`
    : ""
}
${want("mnemonic") ? `- mnemonic: ${mnemonicRule(data.targetLanguage, l1Info.code, NL)}` : ""}

${data.hintCategory ? `カテゴリのヒント: ${data.hintCategory}` : ""}`;

    const pro = await isProUser(context.userId);
    const preferredModel = pro ? ai.modelRichPremium : ai.modelRich;
    // Plain text + robust JSON parse (like suggestWords). We deliberately do NOT
    // use experimental_output / response_format=json_schema here: Gemini's
    // OpenAI-compatible endpoint rejects many json_schema shapes with a 400,
    // which threw the whole call and left every caught word with empty extras.
    //
    // 重要(2026-07-16の不具合修正): 以前はここで「全項目が空のJSONテンプレート」を
    // 例として渡していたため、gemini-3-flash がその空テンプレートをそのまま返し、
    // 27/29語の extras が空(意味しか出ない)になっていた。空の例は絶対に見せず、
    // 「各キーを内容で埋めた1つのJSONだけ返す」と指示する。念のため、返ってきた
    // extras がほぼ空なら1回だけ強めに再生成する。
    const jsonTail =
      `\n\n**出力は上記をすべて内容で埋めた JSON オブジェクト1つだけ**` +
      `（前置き・説明・コードフェンス不要）。含めるキー: ` +
      `headword_zh / reading_zhuyin / pinyin / meaning_ja / part_of_speech / level / ` +
      `category_key / new_shelf / example_sentence / example_translation / ` +
      `extras{ ` +
      [
        want("usage_chunks") && "usage_chunks[{parts:[{text,pos,slot,ja?,alts?:[{text,ja}]}],ja}]",
        "example_chunks[{text,pos}]",
        want("examples_extra") && "examples_extra[{zh,ja,scene,chunks:[{text,pos}]}]",
        "usage_context, frequency_level, register_tag, register_scale, encounter_labels[{kind,label}]",
        "scene_weights, season_months, region_scope, region_scope_kind, image_query, image_avoid[]",
        want("related_words") && "related_words[{word,kind,note}]",
        wantMeasure && "measure_words[{word,zhuyin,pinyin,note}]",
        wantOwn("kanji_breakdown") && "kanji_breakdown[{kanji,meaning,on,kun}]",
        wantOwn("conjugation") && "conjugation[{form,text}]",
        wantOwn("politeness") && "politeness",
        wantOwn("counters") && "counters[{word,reading,note}]",
        wantOwn("pitch_accent") && "pitch_accent",
        wantOwn("word_origin") && "word_origin",
        want("pronunciation_tips") && "pronunciation_tips",
        want(noteSection) && cardProfile.capture.noteField,
        want("etymology") && "etymology, radicals",
        want("mnemonic") && "mnemonic",
      ]
        .filter(Boolean)
        .join(", ") +
      ` }。` +
      // 頼んでいない欄は**キーごと書かない**（空で上書きしないため）。
      (data.sections ? `上に挙げていない extras のキーは出力しない。` : "") +
      `extras の各項目は空文字・空配列にせず、必ず具体的な内容を入れる。` +
      // **「必ず埋めろ」が限定の誤りを作っていた**(オーナー指摘 2026-08-28 ②
      // 「立扇という単語の時に台湾限定と出た」)。本番で `region_scope` の
      // 入った9語のうち6語が誤りだったのは、当てはまらない語でも埋めろと
      // 迫っていたから。**空が正しい欄**をここで名指しで外す。
      `\n\nただし次の欄は**当てはまらなければ空にする**（無理に埋めない）: ` +
      `region_scope（そこにしか無い物でなければ空文字）/ ` +
      `region_scope_kind（同上、null）/ ` +
      `season_months（通年なら空配列）/ ` +
      `measure_words（名詞でなければ空配列）/ ` +
      `image_query（写真で表せない語なら空文字）/ ` +
      `image_avoid（取り違える写真が無ければ空配列）` +
      // 日本語の節にも「当てはまらなければ空」が在る(かなだけの語の漢字、名詞の活用)。
      (wantOwn("kanji_breakdown") ? ` / kanji_breakdown（かなだけの語なら空配列）` : "") +
      (wantOwn("conjugation") ? ` / conjugation（活用しない語なら空配列）` : "") +
      (wantOwn("counters") ? ` / counters（名詞でなければ空配列）` : "") +
      `。`;

    const genOnce = async (extraPush = ""): Promise<GeneratedCard> => {
      // モデルIDが無効なら安全なモデルへ自動フォールバック(404で機能を殺さない)
      const result = await withModelFallback(ai, preferredModel, (m) =>
        generateText({ model: ai.gateway(m), prompt: `${prompt}${jsonTail}${extraPush}` }),
      );
      // **失敗の理由を飲まない。**
      //
      // ここは `catch {}` で全部を握り潰し、"AI did not return a structured
      // card" という英語の1行だけを残していた。JSONが壊れていたのか、
      // どの項目が形に合わなかったのか、そもそも空だったのかが
      // **誰にも分からない**ので、2か月直せなかった
      // (`learnLexiconEntries` の `catch {}` で辞書の蓄積が死んでいたのと
      //  同じ形)。何が落ちたかは必ず記録に残す。
      let raw: unknown;
      try {
        raw = parseJsonFromAiText(result.text);
      } catch {
        console.warn("generateCard: JSONとして読めない", {
          headword: data.headword,
          head: result.text.slice(0, 300),
        });
        throw new CardShapeError("JSONとして読めない返答");
      }
      const checked = CardSchema.safeParse(raw);
      if (checked.success) return checked.data;
      const why = checked.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`)
        .join(" / ");
      console.warn("generateCard: カードの形が合わない", {
        headword: data.headword,
        why,
        head: result.text.slice(0, 300),
      });
      throw new CardShapeError(why);
    };
    const extrasLookEmpty = (c: GeneratedCard): boolean => {
      const e = c.extras;
      if (!e) return true;
      const filled =
        [
          e.usage_context,
          e.pronunciation_tips,
          // **その言語の一言メモを見る。** `taiwan_note` に決め打つと、
          // 英語のカードは `culture_note` が埋まっていても「空」と判定され、
          // 作り直しが毎回走る(費用も待ち時間も倍になる)。
          e.taiwan_note,
          e.culture_note,
          e.japan_note,
          e.etymology,
          e.mnemonic,
        ].some((v) => !!v && v.trim().length > 0) ||
        (e.usage_chunks?.length ?? 0) > 0 ||
        (e.related_words?.length ?? 0) > 0 ||
        (e.examples_extra?.length ?? 0) > 0;
      return !filled;
    };
    // 形が合わなかったときも**1度だけ**やり直す。以前は一発勝負で、
    // モデルが1項目外しただけでその語が永久にカードにならなかった。
    let card: GeneratedCard;
    try {
      card = await genOnce();
    } catch (e) {
      if (!(e instanceof CardShapeError)) throw e;
      card = await genOnce(
        `\n\n前回の返答は形が合いませんでした(${e.message})。` +
          `**JSONオブジェクト1つだけ**を、上に挙げたキーで返してください。` +
          `category_key は指定した一覧の中から必ず1つ選ぶこと。`,
      ).catch((again: unknown) => {
        // 2回とも駄目なら、**その人に読める言葉で**伝える。
        // 英語の1行を日本語の画面に出したまま2か月放置していた。
        throw new Error(
          `カードの形が整いませんでした。もう一度お試しください。` +
            `(${again instanceof Error ? again.message : String(again)})`,
        );
      });
    }
    // 意味は語の長さに（R17。説明文で返った回を保存前に縮める）。
    // 削れた説明は空の「使う場面」へ移す（捨てない、`withShortMeaning`）。
    card = withShortMeaning(card);
    if (extrasLookEmpty(card)) {
      // 1回だけ、空を明確に禁止して作り直す。
      try {
        const retry = await genOnce(
          `\n\n前回 extras が空で不十分でした。今回は ` +
            [
              want("usage_chunks") && "usage_chunks",
              "usage_context",
              want("related_words") && "related_words",
              want("pronunciation_tips") && "pronunciation_tips",
              want(noteSection) && cardProfile.capture.noteField,
              want("examples_extra") && "examples_extra",
            ]
              .filter(Boolean)
              .join(" / ") +
            ` を含め、` +
            `**すべてのextras項目に具体的な内容を必ず入れて**やり直してください。`,
        );
        if (!extrasLookEmpty(retry)) card = retry;
      } catch {
        /* keep the first result */
      }
    }
    const resolvedHead = card.headword_zh?.trim() || data.headword;
    // **読みは AI のまま通さない**（2026-10-03「拿鐵」が nálǎtiě と出た件）。
    // 字の数と音節の数・字ごとの読み・台湾の読みを検め、外れていれば辞書の読みに直す。
    // 共有辞書（下の learnLexiconEntries）にも直した読みが入る。
    card = (await loadReadingCheck())(cardLanguage, resolvedHead, card);

    /**
     * **級は辞書が正**（オーナー指摘 2026-08-27 ⑭）。
     *
     * ここは辞書を一度も見ずに AI の答えをそのまま採っていた。本番の
     * 辞書には級の分かっている語が英語 7,009 / 台湾華語 4,496 も入って
     * いるので、**答えが手元にあるのに当て推量を買っていた**ことになる。
     * 決め方は `level-source.ts` に1つだけ置いてある。
     *
     * 引けなかったとき（列が無い環境・通信の失敗）は `undefined` のまま
     * 通す — 「辞書に無い語」として AI の答えを読む道に落ちる。
     * ここで `null` にすると、**全部の語が級外**になる。
     */
    let dictStep: number | null | undefined;
    let examTags: string[] = [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: entry, error: dictErr } = await supabaseAdmin
        .from("dictionary_entries")
        .select("level_step, exam_tags")
        .eq("language", cardLanguage)
        .eq("headword", resolvedHead)
        .maybeSingle();
      if (!dictErr && entry) {
        dictStep = entry.level_step ?? null;
        // その語が出る検定の印(辞書の行に入っている事実。`extras.ts` の注)。
        examTags = (entry.exam_tags as string[] | null) ?? [];
      }
    } catch (e) {
      console.warn("generateCard: 辞書の級を引けなかった", e);
    }
    const level = resolveLevel({ scale: cardProfile.levels, dictStep, aiLevel: card.level });
    // 入力キャッチ・派生キャッチで生まれた語も共有辞書に蓄積(SNS/日常語彙)。
    void import("./lexicon.server").then(({ learnLexiconEntries }) =>
      learnLexiconEntries([
        {
          headword: resolvedHead,
          zhuyin: card.reading_zhuyin,
          pinyin: card.pinyin,
          meaning_ja: card.meaning_ja,
          pos: card.part_of_speech,
          // **地の文を入れない。** ここは制約付きの列で、
          // `usage_context`(「スーパーや夜市でよく見かける」)を直に入れていた。
          // 一括 upsert なので、その1行のせいで**その回の語が1つも入らない**。
          taiwan_usage: taiwanUsageFrom({
            registerTag: card.extras?.register_tag,
            frequencyLevel: card.extras?.frequency_level,
            prose: card.extras?.usage_context || card.extras?.common_situation,
          }),
          notes: card.extras?.usage_context || card.extras?.common_situation || null,
        },
      ]),
    );
    /**
     * **「その他」に逃げたときだけ** Jev に棚を聞く（`jev-tasks.server.ts`）。
     * 語は共有なので、分類できている語は触らない。鍵が無い・自信が低いときは
     * 「その他」のまま。
     */
    // 例文の自然さを **Jev で影に記録**（待たない・画面は変えない）。
    if (card.example_sentence) {
      const sentence = card.example_sentence;
      void import("./jev-tasks.server").then(({ recordExampleShadow }) =>
        recordExampleShadow(context.supabase as never, {
          userId: context.userId,
          headword: resolvedHead,
          sentence,
        }),
      );
    }
    let categoryKey = normalizeCategory(resolvedHead, card.category_key);
    if (categoryKey === "other") {
      const { categoryFallback } = await import("./jev-tasks.server");
      const picked = await categoryFallback(
        { headword: resolvedHead, meaning: card.meaning_ja, pos: card.part_of_speech },
        CATEGORY_KEYS,
      ).catch(() => null);
      if (picked) categoryKey = normalizeCategory(resolvedHead, picked);
    }
    const out = {
      ...card,
      // **訳は読む人の言語で**（2026-09-29「例文の訳に中文が混ざってる」）。例文の写しや
      // 別の言語で返ってきた訳は落とす（空なら画面は訳を出さず、作り直しが埋める）。
      example_translation: readerText(card.example_translation, explainLang, card.example_sentence),
      headword_zh: resolvedHead,
      level: level.stored,
      category_key: categoryKey,
      // どの言語で書いた解説かを刻む。表示言語を切り替えたときに
      // 古い言語のカードだけを作り直せる(#65)。
      // あわせて**どの母語向けに書いたか**も刻む。発音のコツと語順の説明は
      // 母語ごとに中身が変わるので、母語を変えたら作り直す必要がある。
      // **学ぶ言語で返ってきた注記を落とす**(オーナー報告「量詞の説明が
      // 台湾華語になってる」)。プロンプトで言うだけでは 0 にならないので、
      // 返ってきた物のほうを見る(`src/lib/note-language.ts`)。
      extras: {
        // 頼まなかった節の欄は落とす（空の欄で共有の語を上書きしない）。
        ...stripUnrequested(
          scrubForReader(scrubForeignNotes(card.extras ?? {}, explainLang), explainLang),
          data.sections,
        ),
        // **辞書の事実で上書きする。** AI が書いた物より後に置く。
        exam_tags: examTags,
        explain_lang: explainLang,
        explain_l1: l1Info.code,
      },
    };
    /**
     * **作ったカードを控える**（監査 2026-10-03 H2 / M3、`generated-cards.ts`）。
     *
     * 保存の道（`saveSticker` → `upsertWord`・`updateWordExtras`）は、画面が送り返して
     * くる文ではなく、この控えを共有の行に書く。画面はこの返事のすぐ後に保存を呼ぶので、
     * 控えは**返す前に**残す（1回の書き込み）。
     *
     * 既に在る語の行（候補の意味だけで先に保存された語など）の空の所は、返事の後に
     * このカードで埋める（`fillSharedWordFromCard`、返事は待たせない）。
     */
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const key = explanationKey(explainLang, l1Info.code);
      const heads = [data.headword, resolvedHead];
      await recordGeneratedCards(
        supabaseAdmin,
        heads.map((headword) => ({
          language: cardLanguage,
          headword,
          explainLang: key.explainLang,
          l1: key.l1,
          kind: "card" as const,
          card: out,
        })),
      );
      const trusted = trustedCardFrom(out);
      await runAfterResponse("generateCard: fill shared word", () =>
        fillSharedWordFromCard(supabaseAdmin, {
          language: cardLanguage,
          headwords: heads,
          card: trusted,
        }),
      );
    }
    return out;
  });

// --- Phrase cards (§5.2): front = the scene, back = phrase + replies -------

const PhraseInput = z.object({
  phrase: z.string().min(1).max(80),
  scene: z.string().max(200).default(""),
  targetLanguage: z.string().default(DEFAULT_TARGET_LANGUAGE),
});

const PhraseCardSchema = z.object({
  reading_zhuyin: z.string().default(""),
  pinyin: z.string().default(""),
  meaning_ja: z.string(),
  usage_note: z.string().default(""),
  common_situation: z.string().default(""),
  replies: z
    .array(z.object({ zh: z.string(), ja: z.string() }))
    .min(1)
    .max(3),
});

export type GeneratedPhraseCard = z.infer<typeof PhraseCardSchema>;

export const generatePhraseCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PhraseInput.parse(input))
  .handler(async ({ data, context }): Promise<GeneratedPhraseCard> => {
    // 外部の AI へ送る前の同意（`ai-consent.ts`）。無ければ何も送らずに断る。
    await (await import("./ai-consent.server")).assertAiConsent(context.userId);
    const ai = await getAiFor("card");
    await assertWithinDailyCap(context.userId, "phrase_card");
    // Plain text + tolerant parse (see generateCard) — avoid json_schema output
    // that Gemini's OpenAI-compatible endpoint rejects.
    const levelGoal = await getUserLevelGoal(context.userId);
    const levelRule = await levelInstruction(context.userId);
    const langRule = await explanationLanguageRule(context.userId);
    // 説明文の言語名。以前ここが「日本語」固定で、英語設定と矛盾していた。
    const explainLang = await getExplanationLanguage(context.userId);
    // **3つある表示言語を2つに潰さない。** ここは
    // `explainLang === "en" ? "英語" : "日本語"` だった — 繁體中文を
    // 選んだ人が「日本語」に落ち、AI が日本語で解説を書いていた
    // (オーナー報告「項目に日本語が混ざる」)。正は
    // `explanationLanguageName()` 1つ。
    const NL = explanationLanguageName(explainLang);
    // フレーズの返し方も母語で崩れ方が違う(語順・助詞・丁寧さの出し方)。
    const l1Gram = await l1Rule(context.userId, "wordorder");
    /**
     * **学習言語を決め打たない。** ここは「台湾華語(繁體字)のフレーズカードを
     * 作ります」から始まり、読みも返し方も繁體字で固定されていた。
     * 英語を学ぶ人が一言をフレーズとして拾うと、**英語の画面に中文の
     * フレーズカード**が返ってくる（オーナー報告の症状と同じ形）。
     */
    const phraseProfile = targetProfile(await getUserTargetLanguage(context.userId));
    const result = await generateText({
      model: ai.gateway(ai.modelRich),
      prompt:
        `${phraseProfile.promptName}のフレーズカードを作ります。\n${langRule}\n${levelRule}\n${l1Gram}\n` +
        `フレーズ: 「${data.phrase}」\n` +
        (data.scene ? `聞いた/使いたいシーン: ${data.scene}\n` : "") +
        `学習者の目標レベル: ${levelGoal}(${phraseProfile.levels.id})。repliesの語彙はこのレベル以下に抑える。\n` +
        `\n次をJSONオブジェクトだけで出力(前置き・マークダウン不要):\n` +
        `${phraseProfile.capture.readingRule}\n` +
        `- meaning_ja: ${meaningRule(phraseProfile.promptName, NL)}\n` +
        `- usage_note: いつ・誰が・どんなトーンで使うか(1〜2文、${NL})\n` +
        `- common_situation: 最もよくある場面(1文、${NL})\n` +
        `- replies: このフレーズを言われた時の自然な返し方2〜3個 ` +
        `{zh: ${phraseProfile.capture.jsonHeadwordHint}, ja: ${NL}訳}。` +
        `**${phraseProfile.promptName}で書く。**\n` +
        `形式: {"reading_zhuyin":"","pinyin":"","meaning_ja":"","usage_note":"","common_situation":"","replies":[{"zh":"","ja":""}]}`,
    });
    const card = (() => {
      try {
        return PhraseCardSchema.parse(parseJsonFromAiText(result.text));
      } catch {
        throw new Error("AI did not return a structured phrase card");
      }
    })();
    // 意味と読みだけを候補として控える（保存の時に共有の行に入る。`generated-cards.ts`）。
    await recordCandidateReceipts(phraseProfile.code, [
      {
        headword: data.phrase,
        meaning_ja: shortMeaning(card.meaning_ja),
        reading_zhuyin: card.reading_zhuyin,
        pinyin: card.pinyin,
      },
    ]);
    return card;
  });

// --- Pro: 項目別ワンタッチ再生成 (2026-07-25) --------------------------------
// カード全体の作り直しではなく、気に入らない1項目だけをAIに作り直させる。
// words は共有テーブルなので updateWordExtras と同じ所有チェック
// (この語のステッカーを持つユーザーのみ)+Pro 限定+日次キャップ。

// 節の一覧は画面と**同じ出所**を見る。別々に持っていたので、
// 片方にだけ足すと「押せるのに弾かれる / 作れるのにボタンが出ない」が
// エラー無しで起きていた。
export type { RegenSection } from "./card-sections";

const RegenInput = z.object({
  word_id: z.string().uuid(),
  section: z.enum(REGEN_SECTIONS),
  /**
   * **まだ空のときだけ作る**(初回の作成)。裏で項目を上から順に埋めていく
   * 仕組みが使う。
   *
   * 「作り直し」(すでに在る解説を捨てて作り直す)は Pro のまま。
   * **カードを最初に完成させることまで有料にはしない** — 無料の人の
   * カードが意味だけで止まってしまう。
   */
  only_if_empty: z.boolean().optional().default(false),
});

/**
 * チャンクの記号。**役割(S/V/O)ではなく詞類表(NORI指定)。**
 *
 * 以前は S/V/O/M/C/Ptc という「文の役割」で出させていた。画面では動詞と
 * 目的語しか色が付かず、残りは全部同じ灰色になっていた — 名詞なのか
 * 副詞なのか介詞なのかが読み取れない。台湾華語では
 * 「この語は Vs(状態動詞)であって V ではない」ことが語順を決めるので、
 * 学習の中身そのものが落ちていた。
 *
 * 台湾の教材(國語教學中心系)の詞類表をそのまま使う。`POS_TABLE` と
 * 同じ記号なので、単語の品詞欄と帯の色が同じ体系で読める。
 */
/**
 * **言語ごとの詞類表を引く**（オーナー報告 2026-08-26、3度目
 * 「単語のチャンク型の項目が生成されてない」）。
 *
 * ここは台湾の詞類表を直に書いていたので、英語のカードにも
 * `V-sep`(離合詞)や `Ptc`(助詞)を選ばせていた。英語に無い記号を
 * 求められた生成は、当たり障りのない物を返すか、丸ごと外す。
 * 記号の一覧は `target-profile.ts` が言語ごとに持つ。
 */
function chunkRule(language: string | null | undefined): string {
  const p = targetProfile(language);
  return `チャンクは {text: ${p.promptName}のパーツ, pos: 品詞} の配列。${p.chunkPrompt.posRule}${NO_PLUS_PART_RULE}`;
}

/**
 * **画像検索用の短い英語**（`extras.image_query`。オーナー報告 2026-10-08「牛蒡を検索すると
 * 花の写真しか出ない」）。意味の欄（`ゴボウ`）で探すと植物のゴボウ（花）に当たる。
 * 学ぶ人がその語で指す**日常の物**を、写真の説明に書かれる英語で返させる。
 * カードを作る同じ呼び出しに1欄足すだけ（AI の呼び出しは増やさない）。
 */
const IMAGE_QUERY_RULE =
  `その語が指す物・様子の写真を探すための**英語の短い検索語（1〜3語）**。` +
  `学習者がその語でふだん指す**日常の物**にする（植物の名の語でも、ふつう食べる物なら食べる部分: ` +
  `牛蒡 → "burdock root"、蓮藕 → "lotus root"、竹筍 → "bamboo shoot"、花生 → "peanuts"、` +
  `芒果 → "mango fruit"、滑鼠 → "computer mouse"、跑步 → "running"、雨傘 → "umbrella"）。` +
  `**別の物と取り違えられる1語にしない**（✗ "lotus" は花に当たる → ○ "lotus root"）。` +
  `花・学名・辞書の言い換えにしない。写真で表せない語（抽象語・機能語）は空文字`;

/**
 * **写っていたら外れの英語**（`extras.image_avoid`。オーナー報告 2026-10-08 ②「レンコンを
 * 調べたのに蓮の花の画像しか出てこない」）。検索語だけでは、写真の出所が同じ名の別の物
 * （蓮の花・竹林・ネズミ）を返す。候補の説明にこの語が出てくる写真を捨てる
 * （`image-search-rank.ts`）。同じ呼び出しに1欄足すだけ（AI の呼び出しは増やさない）。
 */
const IMAGE_AVOID_RULE =
  `image_query で探すと混ざりやすい**別の物の写真**を表す英小文字の語を 0〜6 個の配列で` +
  `（蓮藕 → ["flower","blossom","pond","petal"]、竹筍 → ["forest","grove","panda"]、` +
  `滑鼠 → ["animal","rodent","pet"]、牛蒡 → ["flower","thistle"]）。取り違える物が無い語は空配列`;

/**
 * **「＋」をパーツにさせない**（オーナー報告 2026-10-08「牛蒡 [+] 炒 のように + が札で出る」）。
 * 型の例を「跟＋男朋友＋吵架」と ＋ で書いているので、AI がその ＋ をパーツとして返す回がある。
 * 返ってきた物は `chunk-grammar.ts` の `withoutSeparatorParts` でも正す（保存済みの語にも効く）。
 */
const NO_PLUS_PART_RULE =
  `\n**「＋」「+」は例の中で区切りを見せる記号で、パーツではない。**` +
  `「+」「＋」「・」「/」だけのパーツを作らない。text の中にも「+」「＋」を入れない` +
  `（✗ [{text:"牛蒡"},{text:"+"},{text:"炒"}] / ✗ {text:"牛蒡+炒"} → ○ [{text:"炒"},{text:"牛蒡"}]）。`;

/**
 * **どの語にも付く組み合わせを書かせない**(オーナー指示 2026-08-28 ③)。
 *
 * > 「「買う（買）」や好きのような、どの名詞にも使える汎用的な組み合わせでは、
 * >  実践的なスピーキング力は養えません。」
 *
 * ## ここに1つだけ置く理由
 * 型の指示文は**2箇所**にある（カードを作るときと、その節だけ作り直すとき）。
 * 片方だけ直すと、作り直したカードにだけ汎用の型が戻ってくる — 使う人には
 * 「たまに悪くなる」としか見えない。この app が何度も踏んだ形。
 *
 * 返ってきた物のほうも `lib/generic-chunks.ts` が落とす。指示文と門の
 * **両方**を置くのは、指示文が守られない回が実際に在るから。
 */
/**
 * **チャンクは公式・定理の形で**（オーナー指示 2026-09-25「チャンクは公式、
 * 定理のように、またネイティブが最も頻繁に使うカタチにして…跟＋人＋見面の
 * ようにする」）。
 *
 * 入れ替えて使う所には `slot: true` を付け、画面では点線の枠で描く。
 * 枠の中は「人」「someone」ではなく、**ネイティブがいちばんよく入れる具体語を
 * 1つ**（2026-09-27「人とかではなく、ネイティブが最も頻繁に使う具体的なものを
 * 1つ実際に挿入して」）。型ぜんぶを読み上げても自然な文になる（跟男朋友吵架）。
 */
function formulaChunkRule(code: string): string {
  // 例と文法の注意は言語の表から(前は `code.startsWith("zh")` の2分岐で、
  // 日本語のカードに英語の例が渡っていた)。文はいままでと同じ形に組む。
  const chunk = targetProfile(code).chunkPrompt;
  return (
    `**公式・定理のような型にする。** ネイティブがその語を使うとき、いちばん頻繁に口にする形を、` +
    `どの語と一緒に・どの語順で使うかが一目で分かる公式として書く` +
    `（例: ${chunk.formulaExample}）。` +
    `\n入れ替えて使う所は「人」「事」「someone」のような広い言い方にしない。` +
    `ネイティブがそこにいちばんよく入れる具体語を1つだけ入れて、そのパーツに slot: true を付ける。` +
    `決まった語のパーツは slot を付けない。` +
    // R17「加熱（動詞）が点線になってる。点線は…入れ替え可能な具体的なもの」。
    // 2026-10-01「とても甘いのか、少し甘いのかは置き換え可能だよね。程度も変更できるように」
    // （チャンクの表示ルール C5: 程度の語だけは副詞でも入れ替えられる）。
    `**slot を付けてよいのは ① 具体的な物・人・場所を表す名詞 ② 量詞 ③ 程度の語（很・超・非常・有點・蠻）だけ。` +
    `動詞・形容詞・程度以外の副詞・助詞には絶対に slot を付けない。**` +
    NO_PLUS_PART_RULE +
    // 2026-10-01「芒果冰のようにひとかたまりとして普段扱われるものはチャンクを分けなくていい」（C7）。
    `\n**ネイティブが1語として使う語は分けずに1つのパーツにする**（✗ 芒果＋冰 → ○ 芒果冰、✗ 手搖＋飲）。` +
    `その1語だけの型は作らない（それは語であって使い方ではない）。` +
    `\n**型ぜんぶは文法的に正しく、ネイティブが実際にそのまま言う形にする。**` +
    chunk.formulaGrammar +
    `\nslot: true のパーツには alts も付ける: ネイティブがそこに**実際によく入れるほかの具体語**を` +
    `頻度の高い順に4〜6個、[{text, ja: その語の意味（解説の言語で、短く）}]。` +
    `slot: true のパーツ自身にも ja（その語の意味。型の訳 ja の中で**その語に当たる部分と同じ書き方**）を付ける` +
    `（例: {text:"男朋友", ja:"彼氏"} と 型の訳「彼氏と喧嘩する」）。` +
    `どれを入れても型ぜんぶが自然に言える語だけ（例: 跟＋男朋友＋吵架 → 女朋友・朋友・同事・爸媽・室友、` +
    `芒果＋很＋甜 の 很 → 超・非常・有點・蠻）。` +
    `\n型ぜんぶを続けて読んでも、そのまま自然に言える形にする。＋ などの記号はパーツに入れない。` +
    CHUNK_INTEGRITY_RULE
  );
}

/**
 * **崩れた型と、訳になっていない訳を作らせない**（オーナー報告 2026-10-09「嘴邊肉＋切 /
 * 嘴邊肉をする」「なんで？これは文法的に正しい？」）。
 *
 * 屋台の頼み方「嘴邊肉切一盤」から、量詞を使わない決まり（量詞は別の欄）に合わせて
 * 「一盤」だけを抜いた形が返ってきた — 「嘴邊肉切」は中国語として成り立たない。訳も
 * 見出し語をそのまま写した「嘴邊肉をする」で、訳になっていなかった。
 * カードを作る時と節を作り直す時の両方が `formulaChunkRule` を通るので、ここに置く。
 * 保存済みの語は表示の側でも落とす（`extras.ts` の `isBrokenUsageChunk`）。
 */
const CHUNK_INTEGRITY_RULE =
  `\n**型はどれも、ネイティブがそのまま口にする文法的に正しい句にする。**` +
  `自然な形から必要な語を抜いて型を作らない — 自然な形に量詞などの使えない語が要るなら、` +
  `その語を削って短くするのではなく、**別の型を選ぶ**。` +
  `名詞の後ろに目的語を取る動詞を裸で置かない（動詞は目的語の前: ✗ 嘴邊肉＋切 → ○ 切＋嘴邊肉）。` +
  `\nja は**型ぜんぶの本当の訳**（解説の言語で、そのまま意味が通る言い方）。` +
  `学ぶ語をそのまま写して「〜をする」「〜する」を付けただけの訳にしない（✗ 嘴邊肉をする）。` +
  `解説の言語にその物を表す言葉があるなら、学ぶ語の字を写さずにその言葉で訳す（✗ 嘴邊肉を注文する → ○ 豚のほほ肉を注文する）。`;

/**
 * 日本語のカードだけの節の指示(2026-10-01)。
 *
 * **どの言語の節かは `wantOwn` が決める**(その言語の `sections` に在るか)。ここに
 * `if (lang === "ja")` を書かないのはそのため — 日本語以外のカードでは全部が空行になる。
 *
 * 1行ずつの中身は作り直し(`runSectionRegen`)の指示と同じ観点にしてある。片方だけ
 * 直すと、作り直したカードだけ別の観点になる(この app が何度も踏んだ兄弟の取りこぼし)。
 * 指示の本文は日本語だが、**解説・意味・注記は必ず読む人の言語(`nl`)で**書かせる —
 * 日本語を学ぶ人は英語か繁體中文で読む。
 */
function japaneseSectionLines(wantOwn: (id: SectionId) => boolean, nl: string): string {
  return [
    wantOwn("kanji_breakdown") && `- kanji_breakdown: ${JA_SECTION_RULES.kanji_breakdown(nl)}`,
    wantOwn("conjugation") && `- conjugation: ${JA_SECTION_RULES.conjugation(nl)}`,
    wantOwn("politeness") && `- politeness: ${JA_SECTION_RULES.politeness(nl)}`,
    wantOwn("counters") && `- counters: ${JA_SECTION_RULES.counters(nl)}`,
    wantOwn("pitch_accent") && `- pitch_accent: ${JA_SECTION_RULES.pitch_accent(nl)}`,
    wantOwn("word_origin") && `- word_origin: ${JA_SECTION_RULES.word_origin(nl)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 日本語の節ごとの書き方。**生成と作り直しの両方がここを読む。**
 * `nl` は解説の言語の呼び名(「英語」「繁體中文(台湾)」)。
 */
const JA_SECTION_RULES = {
  kanji_breakdown: (nl: string) =>
    `見出し語に含まれる**漢字1字ずつ**を語の中の順に [{kanji, meaning, on, kun}]。` +
    `meaning はその字の意味(${nl}で短く)、on は音読み(カタカナ。複数なら「・」区切り)、` +
    `kun は訓読み(ひらがな。送り仮名は「.」で区切る 例: た.べる)。` +
    `**この語で使っている読みを先頭に書く**。無い読みは空文字。同じ字が2回出ても1行にする。` +
    `かなだけの語(和語・外来語)は**空配列**`,
  conjugation: (nl: string) =>
    `動詞・い形容詞・な形容詞なら活用を [{form, text}] で。form は形の名前(${nl}で短く)、text はその形の日本語。` +
    `動詞は 辞書形 / ます形 / て形 / ない形 / た形 / 可能形 の順、` +
    `い形容詞・な形容詞は 現在(丁寧) / 否定 / 過去 / て形 の順。` +
    `**不規則な形(行く→行って、来る、する、いい→よかった)は必ず正しい形で。**` +
    `名詞・副詞など活用しない語は**空配列**`,
  politeness: (nl: string) =>
    `丁寧さ・敬語を1〜3文(${nl})。くだけた言い方 / 丁寧な言い方(です・ます)/ ` +
    `尊敬語・謙譲語の言い換え(例: 食べる → 召し上がる / いただく)があれば日本語の形を挙げ、` +
    `**誰に・どんな場面で使うか**を書く。言い換えの無い語は、その語そのものの硬さ` +
    `(くだけた・普通・改まった)と、目上の人に使ってよいかを1文で`,
  counters: (nl: string) =>
    `**名詞の場合のみ**、その名詞を数える助数詞を1〜3個 ` +
    `{word:「一本」のように数1つきの日本語, reading:ひらがなの読み, note:いつその助数詞を使うか}。` +
    `数で読みが変わる助数詞は note に代表的な形を添える(いっぽん・にほん・さんぼん)。` +
    `複数あるなら使い分けを note に。名詞でなければ空配列。**note は${nl}で書く**(日本語なのは word/reading だけ)`,
  pitch_accent: (nl: string) =>
    `東京式の高低アクセントを1〜2文(${nl})。型の名前(平板型・頭高型・中高型・尾高型)と、` +
    `かなで高さの並びを書く(例: は↘し=頭高型「箸」/ はし↗=尾高型「橋」/ はし=平板型「端」)。` +
    `同じ音で型の違う語があれば対比を1つ添える。**確信が無いときは型を断定せず、そう書く** — ` +
    `間違った型を覚えるほうが害が大きい`,
  word_origin: (nl: string) =>
    `語種(和語・漢語・外来語・混種語のどれか)と、それが硬さ・使う場面にどう効くかを1〜2文(${nl})。` +
    `同じ物を指す別の語種の語があれば対比を添える(例: 宿屋=和語・素朴 / 旅館=漢語・和風の宿 / ホテル=外来語・洋式)`,
} as const;

function specificChunkRule(headword: string, levelGoal: string): string {
  return (
    // オーナー報告 2026-10-01「チャンクに学ぶべき単語の芒果がない」— 「芒果」の型に「很+甜」だけが来た。
    `**どの型にも「${headword}」自身（日本語・英語は活用形でもよい）を必ず1つのパーツとして入れる。**` +
    `✗「很甜」（「${headword}」が無い — 周りの語だけでは、その語の使い方を教えていない）。\n` +
    `**どの語にも付く組み合わせを書かない。**\n` +
    `✗「買${headword}」「喜歡${headword}」「有${headword}」のように、買う・好き・持っている だけを` +
    `足した形 — 名詞さえあれば言えるので、その語について何も教えていない。\n` +
    `✗「這款${headword}」「這個${headword}」のように、この・その（指示語+量詞）だけを足した形も同じ。\n` +
    `○ **その語とだけ強く結び付いている**言い方（飲み物なら「半糖少冰」「加珍珠」、` +
    `動詞ならその動詞が取る決まった相手・補語、形容詞なら一緒に立つ名詞）。\n` +
    `基準は「**その語を別の語に入れ替えたら成り立たなくなるか**」。成り立つ形は書かない。\n` +
    `語彙のネットワーク（一緒に立つ語）と構文の型（公式）の2種類を混ぜて返す。\n` +
    `**学習者の目標レベル ${levelGoal} に合わせる** — このレベルで実際に口に出せる` +
    `語彙・文型に収める。難しい型を並べても言えるようにはならない。\n` +
    // R14「決して該当の単語はスクロールできるようにはしないで。この単語を学習したいから」。
    `**「${headword}」自身のパーツは必ず slot:false・alts なし**（学ぶ語は入れ替えない）。` +
    `入れ替えられるのは周りの語だけで、alts にはネイティブが実際によく入れる具体語を` +
    `頻度の高い順に3〜5個。`
  );
}

/**
 * 項目を1つ作る。**書くか、案だけ返すかを選べる。**
 *
 * - `"write"` … いままでの「作り直し」。作ってそのまま語に書く（Pro）。
 * - `"propose"` … 案だけ返して**書かない**。報告からの直し
 *   （`reportAndFixSection`）が使う。語は**全員で共有している**ので、
 *   1人の報告で書き換える前に別の目で確かめる（`QA.md`「User-reported
 *   canonical corrections require validation before global propagation」）。
 *
 * 作り方は1つにしておく — 2つの道で別々に書くと、片方だけ直って
 * もう片方から古い形が入り続ける。
 */
type SectionRegenData = z.infer<typeof RegenInput>;
type SectionProposal = {
  section: RegenSection;
  /** 語の列（意味・例文）への書き込み。確認済みの語では空。 */
  baseUpdate: Record<string, unknown>;
  /** extras へ混ぜた後の全体。 */
  merged: unknown;
  /** 比べるための、作り直す前と後（その項目の分だけ）。 */
  before: unknown;
  after: unknown;
  headword: string;
  language: string | null;
};

async function runSectionRegen(
  // 呼ぶ側の `requireSupabaseAuth` の文脈そのもの。型は生成物で長いので緩く受ける
  // （`upsertWord` と同じ扱い）。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { supabase: any; userId: string },
  data: SectionRegenData,
  mode: "write" | "propose",
): Promise<{ ok: true; section: RegenSection; filled: boolean; proposal?: SectionProposal }> {
  const { supabase, userId } = context;
  const {
    isProUser: proCheck,
    levelInstruction: lvl,
    explanationLanguageRule: langFn,
  } = await import("./ai-provider.server");
  // 作り直し（書く）は Pro。報告からの直し（案だけ）は誰でも — ただし
  // 書く前に別の目で確かめる（`reportAndFixSection`）。
  if (mode === "write" && !data.only_if_empty && !(await proCheck(userId))) {
    throw new Error("項目の再生成は Pro 限定です");
  }
  await assertWithinDailyCap(userId, "card");

  // 所有チェック: この語のステッカーを持つユーザーだけが編集できる。
  const { data: owned } = await supabase
    .from("stickers")
    .select("id")
    .eq("user_id", userId)
    .eq("word_id", data.word_id)
    .limit(1)
    .maybeSingle();
  if (!owned) throw new Error("この単語を編集する権限がありません");

  /**
   * **その人の記録（一言・撮った場所と日・日記）は、ここでは読まない**（監査 2026-10-03 H1）。
   *
   * 前は例文の項目を作り直すとき、その人の一言・場所・日時と最近の日記3本をプロンプトに
   * 入れ、「例文のうち1つはこの人の記録から作る」と頼んでいた。ところが作った例文の書き先は
   * **共有の行**（`words.example_sentence` / `extras.examples_extra` と、同じ言語で読む全員の
   * `word_explanations`。後者は anon にも読めた）なので、その人の日記や居場所が、同じ語を
   * 持つ他の人のカードに出ていた。
   *
   * 共有の行に書く生成には、個人の材料を一切渡さない（`sharedExampleSourceRule`）。
   * その人だけの例文が要るなら、書き先をその人の札にする（スピーキングの足場
   * `stickers.speaking_scaffold` と同じ形）— それまでは作らない。
   */

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: word, error } = await supabaseAdmin
    .from("words")
    .select(
      "id, headword, language, meaning_ja, part_of_speech, source, example_sentence, example_translation, extras",
    )
    .eq("id", data.word_id)
    .maybeSingle();
  if (error || !word) throw new Error("単語が見つかりません");

  // すでに埋まっている節を、裏の自動生成が上書きしない。
  // **判定は画面と同じ関数**(`card-sections.ts`)。ここに写しを置くと、
  // server が「空だ」と言い続けて作り直し、画面は「埋まっている」と
  // 言い続ける — 止まらない生成になる。
  // 語だけ在って解説（note）が空の関連語も「まだ無い」と数える（`sectionNeedsFill`）。
  const hasSection = (extras: unknown, meaning: string | null) =>
    !sectionNeedsFill(data.section, {
      headword: word.headword as string,
      // **学習言語を渡す。** 渡さないと英語のカードの例文を台湾華語の
      // 目盛りで数え、英語の型を1つ残らず「無い」と判ずる — つまり
      // 作っても作っても空のままになる(`card-sections.ts` の注)。
      language: word.language as string | null,
      meaning_ja: meaning,
      example_sentence: word.example_sentence as string | null,
      extras: normalizeExtras(extras),
    });
  const sharedHas = hasSection(word.extras, word.meaning_ja as string | null);
  /**
   * **画面が見ている行でも数える**（βテスト 2026-09-30「例文以下のチャンクなどが
   * 表示されない」）。画面はその人向けの解説の行（`word_explanations`）があれば
   * そちらを出す。ここが共有の `words.extras` だけを見ていると、共有側に
   * 在る項目は「もう在る」と答えて何も作らず、画面には永久に出なかった。
   * 行の鍵は `generateCard` が刻む物（表示言語 × `getLearnerL1`）と同じ。
   */
  const readerKey = explanationKey(
    await getExplanationLanguage(userId),
    (await getLearnerL1(userId)).code,
  );
  const readerRow =
    mode === "write" ? await readReaderExplanation(supabaseAdmin, data.word_id, readerKey) : null;
  const readerHas = readerRow
    ? hasSection(readerRow.extras, readerRow.meaning || (word.meaning_ja as string | null))
    : sharedHas;
  if (data.only_if_empty && readerHas) {
    return { ok: true, section: data.section, filled: false };
  }

  const levelRule = await lvl(userId);
  // 型はレベルで変える(オーナー指示 2026-08-28 ③「ユーザーの語学の
  // レベルによって表示するものを変えるのは守って」)。作り直すときも
  // 同じレベルに合わせないと、その節だけ別のレベルの型になる。
  const regenLevelGoal = await getUserLevelGoal(userId);
  const langRule = await langFn(userId);
  // 各項目の指示にある「日本語で」を表示言語に合わせて差し替える(#65)。
  const regenLang = await getExplanationLanguage(userId);
  // 表示言語は3つある(2026-08-25)。`=== "en" ? … : "日本語"` と書くと、
  // 台湾の人の解説だけが黙って日本語で作られる。呼び名の表は1つ。
  const NL = explanationLanguageName(regenLang);
  const l1Pron = await l1Rule(userId, "pronunciation");
  // 語順・コロケーション側にも母語を渡す。単体で作り直したときも
  // 一括生成(generateCard)と同じ観点になるようにする。
  const l1Gram = await l1Rule(userId, "wordorder");
  const regenL1 = await getLearnerL1(userId);
  const learnerL1 = regenL1.speakerJa;
  const head = word.headword as string;
  // **学習言語を決め打たない。** ここは「台湾華語(繁体字)の単語」と
  // 直に書いてあった。英語のカードをそのまま流すと、AI は英語の語を
  // 渡されながら「台湾華語の単語だ」と言われる。呼び名は言語の表が持つ。
  const regenProfile = targetProfile(word.language as string | null);
  const targetName = regenProfile.promptName;
  const regenReadingNames = readingPromptNames(regenProfile);
  const base = `${targetName}の単語「${head}」(意味: ${word.meaning_ja})について、カードの一項目だけを作り直します。${langRule} ${levelRule} 出力はJSONオブジェクト1つだけ(前置き不要)。`;

  // 各項目のプロンプトと出力形。extras へのマージで反映する。
  const spec: Record<RegenSection, { prompt: string; schema: z.ZodTypeAny }> = {
    meaning: {
      prompt: `${base}\n${meaningRule(regenProfile.promptName, NL)}\n{"meaning_ja": ""}`,
      schema: z.object({ meaning_ja: z.string().min(1) }),
    },
    measure_words: {
      prompt: `${base}\nこの名詞に使う量詞を1〜3個。複数ある場合は使い分けを note に書く。\n**note は必ず${NL}で書く。中国語で書かない**(word/zhuyin/pinyin だけが中国語)。\n{"measure_words":[{"word":"一張","zhuyin":"ㄧˋ ㄓㄤ","pinyin":"yí zhàng","note":"平らな物に"}]}`,
      schema: z.object({
        measure_words: z
          .array(
            z.object({
              word: z.string(),
              zhuyin: z.string().catch(""),
              pinyin: z.string().catch(""),
              note: z.string().catch(""),
            }),
          )
          .min(1),
      }),
    },
    example: {
      prompt: `${base}\nネイティブが「${head}」を使う**いちばん自然で、いちばんよく出会う場面を1つだけ**選び、その場面でそのまま言う例文を1つ。辞書的な作文・説明文にしない。目標レベルは ${regenLevelGoal} — 語彙・文型はこのレベル以下。\n${sharedExampleSourceRule(NL, regenProfile.code)}\n${chunkRule(word.language as string | null)}\n{"example_sentence":"${targetName}の例文","example_translation":"訳(${NL})","example_chunks":[{"text":"","pos":""}]}`,
      schema: z.object({
        example_sentence: z.string().min(1),
        example_translation: z.string().catch(""),
        example_chunks: z
          .array(z.object({ text: z.string(), pos: z.string().catch("") }))
          .catch([]),
      }),
    },
    examples_extra: {
      prompt: `${base}\n追加の例文2つ。それぞれ scene(いつ・どんな気持ちで言うか)と chunks を付ける。目標レベルは ${regenLevelGoal} — 語彙・文型はこのレベル以下。1つ目の例文と違う場面・気持ちにする。\n${sharedExampleSourceRule(NL, regenProfile.code)}\n${chunkRule(word.language as string | null)}\n{"examples_extra":[{"zh":"","ja":"","scene":"","chunks":[{"text":"","pos":""}]}]}`,
      schema: z.object({
        examples_extra: z
          .array(
            z.object({
              zh: z.string(),
              ja: z.string().catch(""),
              scene: z.string().catch(""),
              chunks: z.array(z.object({ text: z.string(), pos: z.string().catch("") })).catch([]),
            }),
          )
          .min(1),
      }),
    },
    usage_chunks: {
      prompt: `${base}\nネイティブが「${head}」を**実際にいちばん高い頻度で**組み合わせて使う型を4〜5個。**厳選する。思いつく組み合わせを並べない。**\n${formulaChunkRule(regenProfile.code)}\n${specificChunkRule(head, regenLevelGoal)}\n**短くする**: ${regenProfile.chunkPrompt.lengthRule}\nそのまま声に出せる形にする。${regenProfile.chunkPrompt.styleRule}\n${learnerL1}が崩しやすい型を優先する。\n${l1Gram}\n${chunkRule(word.language as string | null)}\nja はその型の自然な訳だけ（説明・注釈・括弧書きは書かない）。\n{"usage_chunks":[{"parts":[{"text":"","pos":"","slot":false,"ja":"","alts":[{"text":"","ja":""}]}],"ja":"訳"}]}`,
      // 部品の形は `extras.ts` の1つ（`ja`・`alts` を落とさない）。
      schema: RegenUsageChunksSchema,
    },
    related_words: {
      prompt: `${base}\n類義語(syn)2〜3・反義語(ant)0〜2・関連語(rel)2〜5。**反義語が無い語(物の名前など)は無理に作らず、その語を使うときに一緒によく使う語を関連語で出す**（例: ${regenProfile.capture.relatedExample}）。類義語の note には「${head}」との使い分けを必ず書く。\n**note は全部の語に必ず${NL}で書く**${sameLanguage(regenLang, regenProfile.code) ? "" : `。**${targetName}で書かない**(${targetName}なのは word/reading だけ。${targetName}の note は読めないので捨てられる — オーナー報告 2026-09-30「関連語の解説がなくなってる」)`}。\n**reading を空にしない** — 読めない語を並べても覚えられない(オーナー指示 2026-08-27 ⑧)。\n{"related_words":[{"word":"${targetName}の語","kind":"syn|ant|rel","note":"短い説明(${NL})","reading":"${regenReadingNames.primary}"${regenReadingNames.alt ? `,"reading_alt":"${regenReadingNames.alt}"` : ""}}]}`,
      schema: z.object({
        related_words: z
          .array(
            z.object({
              word: z.string(),
              kind: z.enum(["syn", "ant", "rel"]).catch("rel"),
              note: z.string().catch(""),
              reading: z.string().catch(""),
              reading_alt: z.string().catch(""),
            }),
          )
          .min(1),
      }),
    },
    pronunciation_tips: {
      prompt: `${base}\n${learnerL1}が「${head}」の発音でつまずくポイントに絞ったアドバイス2〜3文(${NL})。\n${l1Pron}\nこの語に実際に当てはまるものだけを具体的に。\n{"pronunciation_tips":""}`,
      schema: z.object({ pronunciation_tips: z.string().min(1) }),
    },
    etymology: {
      prompt: `${base}\n${regenProfile.capture.relativesRule ? `etymology_relatives: ${regenProfile.capture.relativesRule}\n` : ""}{"etymology":"${regenProfile.capture.etymologyRule}(${NL})","etymology_relatives":[{"word":"","note":""}],"radicals":"${regenProfile.capture.radicalsRule}"}`,
      schema: z.object({
        etymology: z.string().min(1),
        etymology_relatives: z
          .array(z.object({ word: z.string().catch(""), note: z.string().catch("") }))
          .catch([]),
        radicals: z.string().catch(""),
      }),
    },
    mnemonic: {
      prompt: `${base}\n${mnemonicRule(word.language as string | null, regenL1.code, NL)}\n{"mnemonic":""}`,
      schema: z.object({ mnemonic: z.string().min(1) }),
    },
    taiwan_note: {
      prompt: `${base}\n{"taiwan_note":"${regenProfile.capture.noteRule}"}`,
      schema: z.object({ taiwan_note: z.string().min(1) }),
    },
    // --- 英語のカードの節 ---------------------------------------------
    // **`forms`(活用)はここに無い。** 語形は ECDICT から来る辞書の事実で、
    // AI に作らせる物ではない(作らせると "child" の複数形が "childs" に
    // なり得る)。取り込みの時点で埋まっているので、作り直す口も要らない。
    countability: {
      prompt: `${base}\n「${head}」が可算名詞か不可算名詞かと、付く冠詞。\n**${learnerL1}にとってここが最大のつまずき**(母語に冠詞が無い/薄い)ので、note には「なぜ間違えやすいか」ではなく「**どう言えば正しいか**」を書く。\nkind は countable / uncountable / both のどれか。両方あるなら、どちらの意味でどちらになるかを note に書く。\narticle は実際に付く形("a" / "an" / "the" / 付かないなら "—")。\n**note は必ず${NL}で書く。**\n{"countability":{"kind":"uncountable","article":"—","note":"数えるときは a piece of ~ を使う"}}`,
      schema: z.object({
        countability: z.object({
          kind: z.enum(["countable", "uncountable", "both"]).catch("countable"),
          article: z.string().catch(""),
          note: z.string().catch(""),
        }),
      }),
    },
    stress: {
      prompt: `${base}\n「${head}」を音節に切って、どこを強く読むか。\nsyllables は綴りを音節ごとに切った配列(例: "photograph" → ["pho","to","graph"])。**綴りの文字を1つも足さない・落とさない** — つないだら元の語に戻ること。\nprimary は第一強勢の音節の添字(0始まり)、secondary は第二強勢があればその添字、無ければ null。\n**${learnerL1}は声調の言語なので強勢が意識に上りにくい。** note には、この語で特に気をつける点を1文だけ(${NL}で)。\n{"stress":{"syllables":["pho","to","graph"],"primary":0,"secondary":2,"note":"最初を強く、あとは軽く"}}`,
      schema: z.object({
        stress: z.object({
          syllables: z.array(z.string()).min(1),
          primary: z.number().int().min(0).nullable().catch(null),
          secondary: z.number().int().min(0).nullable().catch(null),
          note: z.string().catch(""),
        }),
      }),
    },
    phrasal_verbs: {
      prompt: `${base}\n「${head}」を使う句動詞を2〜4個。**語そのものからは意味が読めない物を優先する**(give up / give in のような物。give me は句動詞ではない)。\n「${head}」が句動詞を作らない語なら、その語を**含む**よく使う連語を挙げる。\nmeaning は${NL}で、example は英語の短い一文。\n{"phrasal_verbs":[{"phrase":"give up","meaning":"あきらめる","example":"Do not give up now."}]}`,
      schema: z.object({
        phrasal_verbs: z
          .array(
            z.object({
              phrase: z.string(),
              meaning: z.string().catch(""),
              example: z.string().catch(""),
            }),
          )
          .min(1),
      }),
    },
    /**
     * 英語の一言メモ。オーナー指示 2026-08-26:
     * > 「台湾人が学習言語英語で勉強する時、単語の項目の台湾ノートは
     * >  要らない。そのかわりひと言単語に関する雑学や知識やを
     * >  コメントをかいて」
     *
     * 前はここが「米/英の言い方の違い」だけだった。違いが無い語のほうが
     * 多いので、**大半の語でこの節が薄くなる**。何を書くかは
     * `target-profile.ts` の `noteRule` が唯一の正
     * (カード全体を作るときの指示と同じ文を使う)。
     */
    culture_note: {
      prompt: `${base}\n${regenProfile.capture.noteRule}(${NL}で)\n{"culture_note":""}`,
      schema: z.object({ culture_note: z.string().min(1) }),
    },
    // --- 日本語のカードの節(2026-10-01) -------------------------------
    // 書き方は生成と同じ表(`JA_SECTION_RULES`)。形は `extras.ts` の形を使う —
    // ここに別の形を書くと、作った物が保存で黙って落ちる。
    kanji_breakdown: {
      prompt: `${base}\n${JA_SECTION_RULES.kanji_breakdown(NL)}\n{"kanji_breakdown":[{"kanji":"","meaning":"","on":"","kun":""}]}`,
      // かなだけの語は空が正しい。`min(1)` にすると、作れない語で毎回失敗する。
      schema: z.object({ kanji_breakdown: z.array(KanjiBreakdownSchema) }),
    },
    pitch_accent: {
      prompt: `${base}\n${JA_SECTION_RULES.pitch_accent(NL)}\n{"pitch_accent":""}`,
      schema: z.object({ pitch_accent: z.string().min(1) }),
    },
    conjugation: {
      prompt: `${base}\n${JA_SECTION_RULES.conjugation(NL)}\n{"conjugation":[{"form":"","text":""}]}`,
      schema: z.object({ conjugation: z.array(ConjugationRowSchema) }),
    },
    politeness: {
      prompt: `${base}\n${JA_SECTION_RULES.politeness(NL)}\n{"politeness":""}`,
      schema: z.object({ politeness: z.string().min(1) }),
    },
    counters: {
      prompt: `${base}\n${JA_SECTION_RULES.counters(NL)}\n{"counters":[{"word":"一本","reading":"いっぽん","note":""}]}`,
      schema: z.object({ counters: z.array(CounterSchema) }),
    },
    word_origin: {
      prompt: `${base}\n${JA_SECTION_RULES.word_origin(NL)}\n{"word_origin":""}`,
      schema: z.object({ word_origin: z.string().min(1) }),
    },
    // 日本の一言メモ。何を書くかは `target-profile.ts` の `noteRule` が唯一の正。
    japan_note: {
      prompt: `${base}\n${regenProfile.capture.noteRule}(${NL}で)\n{"japan_note":""}`,
      schema: z.object({ japan_note: z.string().min(1) }),
    },
  };

  const { prompt, schema } = spec[data.section];
  const ai = await getAiFor("card");
  // **高性能なモデルは Pro の中身**(オーナーが挙げた有料機能の1つ)。
  // 無料の人にも項目は埋まる — 書き手が変わるだけ。
  const model = (await proCheck(userId)) ? ai.modelRichPremium : ai.modelRich;
  const result = await withModelFallback(ai, model, (m) =>
    generateText({ model: ai.gateway(m), prompt }),
  );
  let out: Record<string, unknown>;
  try {
    out = schema.parse(parseJsonFromAiText(result.text)) as Record<string, unknown>;
  } catch {
    throw new Error("AIが項目を生成できませんでした。もう一度お試しください");
  }

  // ベース列(meaning/example)は verified 語では守る(constitution §2-1)。
  const baseUpdate: Record<string, unknown> = {};
  // 作り直しの経路にも同じ掃除を通す。**片方だけ直すと、もう片方から
  // 中国語の注記が入り続ける**(この app が何度も踏んだ兄弟の取りこぼし)。
  const extrasPatch: Record<string, unknown> = {
    ...scrubForReader(
      scrubForeignNotes(out as Parameters<typeof scrubForeignNotes>[0], regenLang),
      regenLang,
    ),
  };
  if (data.section === "meaning") {
    delete extrasPatch.meaning_ja;
    if (word.source !== "verified")
      baseUpdate.meaning_ja = shortMeaning(String(out.meaning_ja ?? ""));
  }
  if (data.section === "example") {
    delete extrasPatch.example_sentence;
    delete extrasPatch.example_translation;
    if (word.source !== "verified") {
      baseUpdate.example_sentence = out.example_sentence;
      baseUpdate.example_translation = readerText(
        out.example_translation as string,
        regenLang,
        out.example_sentence as string,
      );
    }
  }

  const merged = mergeExtras(
    (word.extras ?? null) as Parameters<typeof mergeExtras>[0],
    extrasPatch as Parameters<typeof mergeExtras>[1],
  );
  if (mode === "propose") {
    return {
      ok: true,
      section: data.section,
      filled: false,
      proposal: {
        section: data.section,
        baseUpdate,
        merged,
        before: sectionSnapshot(Object.keys(out), word),
        after: out,
        headword: word.headword as string,
        language: (word.language as string | null) ?? null,
      },
    };
  }
  /**
   * **書く直前に extras を読み直してから重ねる**（2026-09-27）。
   *
   * 撮った後の項目は**並べて同時に**作るようにした（オーナー指示
   * 「6つ全てを一気にパッと表示」）。AI を待つ数秒のあいだに別の項目が
   * 書き込まれるので、最初に読んだ extras に重ねると**先に書かれた項目を
   * 消してしまう**。読み直せば、ぶつかる幅は AI の数秒から読み書きの
   * 一瞬に縮む。万一消えた項目は「まだ無い」に戻るだけで、次に開いたとき
   * 裏でもう一度作られる（壊れた中身は残らない）。
   */
  // その人向けの解説の行にも重ねる（画面はこちらを出す）。
  if (readerRow) {
    await mergeIntoReaderExplanation(supabaseAdmin, data.word_id, readerKey, {
      extras: extrasPatch,
      meaning: data.section === "meaning" ? shortMeaning(String(out.meaning_ja ?? "")) : null,
      example_translation:
        data.section === "example" ? ((out.example_translation as string | null) ?? null) : null,
    });
  }
  // 共有の行に既に在る項目は、裏の自動生成では書き換えない（他の人のカードも
  // 同じ行を見ている）。その人向けの行だけを埋めれば足りる。
  if (data.only_if_empty && sharedHas) {
    return { ok: true, section: data.section, filled: true };
  }
  const { data: fresh } = await supabaseAdmin
    .from("words")
    .select("extras")
    .eq("id", data.word_id)
    .maybeSingle();
  const latest = fresh
    ? mergeExtras(
        ((fresh as { extras?: unknown }).extras ?? null) as Parameters<typeof mergeExtras>[0],
        extrasPatch as Parameters<typeof mergeExtras>[1],
      )
    : merged;
  const { error: upErr } = await supabaseAdmin
    .from("words")
    .update({ ...baseUpdate, extras: latest as never } as never)
    .eq("id", data.word_id);
  if (upErr) throw new Error(upErr.message);

  return { ok: true, section: data.section, filled: true };
}

/**
 * 直す前のその項目だけを取り出す（比べるため）。語全体を渡すと、
 * 確認する側が関係のない所まで読んで判断がぶれる。
 */
function sectionSnapshot(keys: string[], word: Record<string, unknown>): Record<string, unknown> {
  // **作り直した案と同じ鍵だけ**を、語の列 → extras の順に探す。
  // 項目ごとの鍵の表を別に持つと、項目を足したときに表だけ古くなる。
  const ex = (word.extras ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, (k in word ? word[k] : ex[k]) ?? null]));
}

export const regenerateCardSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegenInput.parse(input))
  .handler(async ({ context, data }) => {
    // 外部の AI へ送る前の同意（`ai-consent.ts`）。無ければ何も送らずに断る。
    await (await import("./ai-consent.server")).assertAiConsent(context.userId);
    const r = await runSectionRegen(context, data, "write");
    // 作り直しの回数（開発者の利用者ごとの画面。新しく作った解説と分けて数える）。
    if (!data.only_if_empty) await logUsage(context.supabase, context.userId, "card_regen");
    return { ok: r.ok, section: r.section, filled: r.filled };
  });

/**
 * **報告された項目だけを直す。**（オーナー指示 2026-09-22）
 *
 * > 単語の詳細のエラーを具体的にどの項目か報告し、その該当箇所をAIが
 * > 自動修整する。だけにして。今このバナーを押すとAIがすべての解説を
 * > 再生成する。これは課金ユーザーだけにしたいから。
 *
 * ## 何をするか
 * 1. 報告を残す（`entry_reports`。管理画面の確認待ちに載る）
 * 2. **その項目だけ**を直す案を作る
 *    - 発音・品詞 … AIに作らせず**辞書と照らす**（事実なので）
 *    - それ以外 … AIがその項目だけ作り直す（`runSectionRegen` の案）
 * 3. 語は**全員で共有している**ので、**作った目とは別の目**で前と後を
 *    比べ、後の方が正しいと十分に言えたときだけ書く
 *    （`lib/correction-judge.ts`。`QA.md` の約束）
 *
 * ## 誰が使えるか
 * **全員**。直すのはその項目1つだけで、全部の作り直しは Pro のまま
 * （`regenerateCardSection`）。1日の上限は作り直しと同じ枠を使う。
 */
const ReportItemSchema = z.union([
  z.enum(REGEN_SECTIONS),
  z.literal("pronunciation"),
  z.literal("pos"),
]);
type ReportItemId = z.infer<typeof ReportItemSchema>;
const ReportFixInput = z.object({
  word_id: z.string().uuid(),
  /**
   * `auto` … 利用者は項目を選ばない。AI が語の中身と一言から間違っている
   * 項目を1つ見つける（オーナー指示 2026-09-27、`lib/report-locate.ts`）。
   */
  item: z.union([ReportItemSchema, z.literal("auto")]),
  /** `auto` のとき、見つける範囲（画面に出ている項目）。 */
  candidates: z.array(ReportItemSchema).max(24).optional(),
  note: z.string().max(500).optional().default(""),
});

export type ReportFixResult = {
  /** 直して語に書いたか。 */
  fixed: boolean;
  /** 直した（または見つけた）項目。`auto` で見つからなければ null。 */
  item?: ReportItemId | null;
  /** 誰が確かめたか（`dictionary` は辞書と照らした）。 */
  by: "dictionary" | "jev" | "llm" | "none";
};

export const reportAndFixSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportFixInput.parse(input))
  .handler(async ({ context, data }): Promise<ReportFixResult> => {
    // 外部の AI へ送る前の同意（`ai-consent.ts`）。無ければ何も送らずに断る。
    await (await import("./ai-consent.server")).assertAiConsent(context.userId);
    const { supabase, userId } = context;
    // 所有チェック: この語のステッカーを持つ人だけが直せる。
    const { data: owned } = await supabase
      .from("stickers")
      .select("id")
      .eq("user_id", userId)
      .eq("word_id", data.word_id)
      .limit(1)
      .maybeSingle();
    if (!owned) throw new Error("この単語を編集する権限がありません");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: word } = await supabaseAdmin
      .from("words")
      .select("id, headword, language, source, reading_zhuyin, pinyin, part_of_speech")
      .eq("id", data.word_id)
      .maybeSingle();
    if (!word) throw new Error("単語が見つかりません");
    const w = word as {
      headword: string;
      language: string | null;
      source: string | null;
      reading_zhuyin: string | null;
      pinyin: string | null;
      part_of_speech: string | null;
    };

    await logUsage(supabase, userId, "report_fix");
    /**
     * **無料の人の報告は記録するだけ**（オーナー決定 2026-09-28「解説の作り直しは
     * プロユーザーのみで、無料ユーザーはエラーの報告だけ。無料ユーザーがエラーの報告として
     * 解答を再生成する裏技を避けたい」、`plan-limits.ts` の `reportMayRegenerate`）。
     * AI に作らせる直しは Pro だけ。確かな辞書と照らすだけの直し（読み・品詞）は全員。
     * 記録した報告は開発者の確認待ちに残る。
     */
    const pro = await isProUser(userId);
    const recordOnly = async (it: ReportItemId | "auto") => {
      const kind = it === "pronunciation" || it === "pos" || it === "meaning" ? it : "other";
      await supabase
        .from("entry_reports")
        .insert({
          user_id: userId,
          headword: w.headword,
          kind,
          note: `[item:${it}] ${data.note}`.trim(),
        })
        .then(
          () => undefined,
          () => undefined,
        );
      return { fixed: false, by: "none" as const, item: it === "auto" ? null : it };
    };
    if (data.item === "auto" && !pro) return recordOnly("auto");
    if (
      data.item !== "auto" &&
      reportMayRegenerate({ isPro: pro, item: data.item }) === "record_only"
    )
      return recordOnly(data.item);
    // 0. 項目を選ばずに報告された（`auto`）なら、AI に間違っている項目を1つ探させる。
    let item: ReportItemId;
    if (data.item === "auto") {
      const candidates = (
        data.candidates?.length ? data.candidates : ["meaning"]
      ) as ReportItemId[];
      const found = await locateReportedItem(
        data.word_id,
        w.headword,
        w.language,
        data.note,
        candidates,
      );
      if (!found) {
        // 見つからなかった。報告だけ残し、人が後で確かめる。
        await supabase
          .from("entry_reports")
          .insert({
            user_id: userId,
            headword: w.headword,
            kind: "other",
            note: `[item:auto] ${data.note}`.trim(),
          })
          .then(
            () => undefined,
            () => undefined,
          );
        return { fixed: false, by: "none", item: null };
      }
      item = found;
    } else {
      item = data.item;
    }

    // 1. 報告を残す。**直せても直せなくても残す** — 人が後で確かめられる。
    //    種類の列は4つしか取れない（`entry_reports` の制約）ので、
    //    どの項目かは本文の頭に書く。
    const kind = item === "pronunciation" || item === "pos" || item === "meaning" ? item : "other";
    const { data: reportRow } = await supabase
      .from("entry_reports")
      .insert({
        user_id: userId,
        headword: w.headword,
        kind,
        note: `[item:${item}] ${data.note}`.trim(),
      })
      .select("id")
      .maybeSingle()
      .then(
        (r) => r,
        () => ({ data: null }),
      );
    /** 直せたら、報告を「対応済み」にする（管理画面の確認待ちに残さない）。 */
    const markResolved = async () => {
      const id = (reportRow as { id?: string } | null)?.id;
      if (!id) return;
      await supabaseAdmin
        .from("entry_reports")
        .update({ status: "resolved" })
        .eq("id", id)
        .then(
          () => undefined,
          () => undefined,
        );
    };

    // 2a. 発音・品詞 … 辞書と照らす。
    if (item === "pronunciation" || item === "pos") {
      const { data: rows } = await supabaseAdmin
        .from("dictionary_entries")
        .select(DICTIONARY_SELECT)
        .eq("language", w.language ?? DEFAULT_TARGET_LANGUAGE)
        .eq("headword", w.headword)
        .limit(1)
        .overrideTypes<Array<RawDictionaryRow & { pos: string | null; source: string | null }>>();
      const row = rows?.[0] ?? null;
      const f = row ? resolveDictionaryFields(row, "ja") : null;
      const patch = dictionaryFixPatch(
        item,
        w,
        row && f
          ? { source: row.source, reading: f.reading, readingAlt: f.readingAlt, pos: row.pos }
          : null,
      );
      if (patch) {
        const { error } = await supabaseAdmin
          .from("words")
          .update(patch as never)
          .eq("id", data.word_id);
        if (error) throw new Error(error.message);
        await markResolved();
        return { fixed: true, by: "dictionary", item };
      }
      // 確かな辞書の行があって今の値と同じなら、今の値が正しい（直さない）。
      const licensed = row && row.source && row.source !== "ai";
      if (licensed) return { fixed: false, by: "dictionary", item };
      // ここから先は AI に答えさせる直し — Pro だけ（無料の人の報告は確認待ちに残る）。
      if (!pro) return { fixed: false, by: "none", item };

      // **確かな辞書に無い語**: 2つの別の AI の答えが一致し、さらに Jev が
      // 「直した方が正しい」と言えたときだけ直す（`consensusFixPatch` の注）。
      const answers = await askReadingTwice(w.headword, w.language);
      const cPatch = consensusFixPatch(
        item,
        { ...w, source: (word as { source: string | null }).source },
        answers,
      );
      if (!cPatch) return { fixed: false, by: "none", item };
      const cVerdict = await judgeCorrection({
        headword: w.headword,
        language: w.language,
        item: item,
        before: Object.fromEntries(
          Object.keys(cPatch).map((k) => [k, (w as Record<string, unknown>)[k] ?? ""]),
        ),
        after: cPatch,
        note: data.note,
      });
      if (!shouldApplyCorrection(cVerdict)) return { fixed: false, by: cVerdict.by, item };
      const { error: cErr } = await supabaseAdmin
        .from("words")
        .update(cPatch as never)
        .eq("id", data.word_id);
      if (cErr) throw new Error(cErr.message);
      await markResolved();
      return { fixed: true, by: cVerdict.by, item };
    }

    // 2b. それ以外 … その項目だけの案を作る（まだ書かない）。
    const r = await runSectionRegen(
      context,
      { word_id: data.word_id, section: item, only_if_empty: false },
      "propose",
    );
    const proposal = r.proposal;
    if (!proposal) return { fixed: false, by: "none", item };

    // 3. 別の目で確かめる。
    const verdict = await judgeCorrection({
      headword: proposal.headword,
      language: proposal.language,
      item: item,
      before: proposal.before,
      after: proposal.after,
      note: data.note,
    });
    if (!shouldApplyCorrection(verdict)) return { fixed: false, by: verdict.by, item };

    const { error: upErr } = await supabaseAdmin
      .from("words")
      .update({ ...proposal.baseUpdate, extras: proposal.merged as never } as never)
      .eq("id", data.word_id);
    if (upErr) throw new Error(upErr.message);
    await markResolved();
    return { fixed: true, by: verdict.by, item };
  });

/**
 * **報告された語で、間違っている項目を1つ探す**（`auto`）。
 * 見せる範囲は画面に出ている項目だけ。答えは `pickReportedItem` を通し、
 * 範囲の外の名前や「なし」は null（直さない側）。
 */
async function locateReportedItem(
  wordId: string,
  headword: string,
  language: string | null,
  note: string,
  candidates: ReportItemId[],
): Promise<ReportItemId | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: full } = await supabaseAdmin
      .from("words")
      .select("*")
      .eq("id", wordId)
      .maybeSingle();
    if (!full) return null;
    const ai = await getAiFor("audit");
    const prompt =
      `語学カードについて、学習者から「どこかが間違っている」と報告がありました。\n` +
      `語: ${headword}（${language ?? ""}）\n報告の一言: ${note || "(なし)"}\n` +
      `カードの項目（[項目名] 内容）:\n${reportContext(candidates, full as Record<string, unknown>)}\n\n` +
      `報告の一言とカードの内容から、**間違っている可能性がいちばん高い項目を1つ**選んでください。` +
      `一言が無ければ、事実として誤っている・不自然な項目を探してください。どれも正しければ none。\n` +
      `出力はJSONだけ: {"item":"${candidates.join('"|"')}"|"none","reason":"短く"}`;
    const res = await withModelFallback(ai, ai.modelRich, (m) =>
      generateText({ model: ai.gateway(m), prompt }),
    );
    return pickReportedItem(parseJsonFromAiText(res.text), candidates);
  } catch {
    return null;
  }
}

/**
 * 読み・品詞を**2つの別の AI に独立に**聞く（`consensusFixPatch` が突き合わせる）。
 * 片方でも答えられなければ、答えは1つ以下になり、直さない側に倒れる。
 */
async function askReadingTwice(
  headword: string,
  language: string | null,
): Promise<ReadingAnswer[]> {
  // 読みの欄の指示は言語の表から(前は台湾華語か、それ以外は英語の IPA の2分岐で、
  // 日本語の語に IPA を聞くことになっていた)。
  const prompt =
    `語: ${headword}\n` +
    targetProfile(language).capture.readingLookupRule +
    ` pos はこの語のいちばん普通の品詞を日本語1語（名詞・動詞・形容詞・副詞など）。\n` +
    `出力はJSONだけ: {"reading":"","reading_alt":"","pos":""}`;
  // 1人目は点検の AI、2人目は「読みの突き合わせ」の AI（開発者の設定で別の会社にできる）。
  const a = await getAiFor("audit");
  const b = await getAiFor("reading_check");
  const models: Array<[AiConfig, string]> = [
    [a, a.modelRich],
    [b, b.modelFast === a.modelRich ? b.modelRich : b.modelFast],
  ];
  const out = await Promise.all(
    models.map(async ([cfg, model]) => {
      try {
        const r = await generateText({ model: cfg.gateway(model), prompt });
        const j = parseJsonFromAiText(r.text) as Partial<ReadingAnswer> | null;
        if (!j || typeof j !== "object") return null;
        return {
          reading: String(j.reading ?? ""),
          reading_alt: String(j.reading_alt ?? ""),
          pos: String(j.pos ?? ""),
        };
      } catch {
        return null;
      }
    }),
  );
  return out.filter((x): x is ReadingAnswer => x !== null);
}

/**
 * 前と後のどちらが正しいかを、**作った目とは別の目**に聞く。
 *
 * Jev を先に使う（判断だけをするモデルで、速く安い）。使えなければ
 * 別の呼び出しのAIに、決まった形（JSON）で答えさせる。どちらも駄目なら
 * 「確かめられなかった」（書かない）。
 */
async function judgeCorrection(p: {
  headword: string;
  language: string | null;
  item: string;
  before: unknown;
  after: unknown;
  note: string;
}): Promise<CorrectionVerdict> {
  const state = {
    word: p.headword,
    language: p.language,
    card_item: p.item,
    current: p.before as never,
    proposed: p.after as never,
    learner_report: p.note || null,
  };
  const { askJev } = await import("./jev.server");
  const jev = await askJev(state, {
    verdict: jevChoice(
      "A learner reported that one item of a vocabulary card is wrong. For this word and item, " +
        "compare `current` with `proposed`. Which one is more accurate, natural and useful " +
        "for a learner? Judge only this item.",
      {
        after: "proposed is clearly more accurate or natural than current",
        before: "current is already correct, or better than proposed",
        unsure: "cannot tell, or both are about the same",
      },
    ),
  });
  const pAfter = choiceProb(jev?.answers.verdict, "after");
  if (pAfter != null) return { by: "jev", pAfter };

  try {
    const ai = await getAiFor("audit");
    const prompt =
      `語学カードの1項目について、学習者から「間違っている」と報告がありました。\n` +
      `語: ${p.headword}（${p.language ?? ""}）\n項目: ${p.item}\n` +
      `報告: ${p.note || "(なし)"}\n` +
      `いまの内容: ${JSON.stringify(p.before)}\n` +
      `作り直した案: ${JSON.stringify(p.after)}\n` +
      `この項目だけを見て、どちらが正確で自然かを判定してください。迷ったら unsure。\n` +
      `出力はJSONだけ: {"verdict":"after"|"before"|"unsure","confidence":0〜1の数}`;
    const res = await withModelFallback(ai, ai.modelRich, (m) =>
      generateText({ model: ai.gateway(m), prompt }),
    );
    return verdictFromLlm(parseJsonFromAiText(res.text));
  } catch {
    return { by: "none", pAfter: null };
  }
}
