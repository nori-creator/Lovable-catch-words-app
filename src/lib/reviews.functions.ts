import { createServerFn } from "@tanstack/react-start";
import { matchesTargetLanguage, wordLanguageFilter } from "@/lib/language-filter";
import { targetProfile } from "@/lib/target-profile";
import { getUserTargetLanguage } from "@/lib/ai-provider.server";
import { batchEndKind } from "@/lib/review-batch";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
// 復習の間隔と忘却曲線は src/lib/srs.ts(外の世界に触れない純粋な計算)。
// このファイルは createServerFn と Supabase を読み込むので、ここに置くと
// 計算だけを取り出して試すことができない。
import { nextSrs, retentionNow, modeFor, stabilityOf, LAPSE_SCORE } from "@/lib/srs";
import {
  buildRetentionSeries,
  type RetentionCard,
  type RetentionEvent,
  type RetentionPoint,
} from "@/lib/retention-series";
export { nextSrs } from "@/lib/srs";
// 4択を組む所も同じ理由で外に出してある(「必ず4つ」を試せるように)。
import { FALLBACK_MEANINGS, buildChoices, shuffle } from "@/lib/quiz-choices";
import {
  assertWithinDailyCap,
  generateStructured,
  getAi,
  getAiFor,
  getUserLevelGoal,
  levelInstruction,
  explanationLanguageRule,
  getExplanationLanguage,
  l1Rule,
  getLearnerL1Code,
  isProUser,
  logUsage,
} from "./ai-provider.server";
import { ttsObjectPath, TTS_VOICE_DEFAULT } from "./tts-cache";
import { readScaffoldBox, scaffoldCacheKey } from "./scaffold-cache";
import { buildBranchPlan, parseBranchPlan, resolveBranches, type Branch } from "./wordtree";
import { normalizeExtras, refineUsageChunks, type ChunkPart } from "./extras";

/**
 * Review card modes escalate with SRS maturity (repetitions):
 * 0-1 recognition (see photo+word, pick meaning)
 * 2-3 listening   (audio only, pick meaning; photo/word revealed after answer)
 * 4-5 reverse     (see meaning+photo, pick the headword)
 * 6+  production  (see photo+meaning, say the word; client falls back to
 *                  reverse when speech recognition is unavailable)
 */
export type ReviewMode = "recognition" | "listening" | "reverse" | "production";

/** 答え合わせに出す解説(スピーキングで使える塊を優先して並べる)。 */
export type ReviewExplain = {
  /** ネイティブがよく使う型。parts は品詞つきなので色分けして見せる。 */
  chunks: Array<{ parts: ChunkPart[]; ja: string }>;
  /** 一緒に/近い意味で使う語。 */
  related: Array<{ word: string; kind: "syn" | "ant" | "rel"; note: string }>;
  /** 量詞(名詞のときだけ)。 */
  measures: Array<{ word: string; note: string }>;
  /** 知っておくと得な一言。 */
  note: string;
};

export type DueReviewCard = {
  review_id: string;
  sticker_id: string;
  word_id: string;
  headword: string;
  /**
   * その語を**何語として覚えているか**。
   * 読み上げの声・言語がこれで決まる。空なら既定の学習言語。
   */
  language: string | null;
  reading_zhuyin: string | null;
  pinyin: string | null;
  meaning_ja: string;
  example_sentence: string | null;
  example_translation: string | null;
  /**
   * 4択の答え合わせで見せる「ネイティブが最もよく一緒に使う形」。
   * 例文は長くて読み飛ばされるので、チャンク(型)1つに絞る。
   * zh = 繁体字の型、ja = 短い説明。無ければ null。
   */
  top_chunk: { zh: string; ja: string } | null;
  /** 答え合わせで見せる解説一式(スピーキングで使える塊優先)。 */
  explain: ReviewExplain | null;
  category_key: string | null;
  entry_type: string;
  cutout_url: string | null;
  /** 撮った元の写真。切り抜きが無い札はこれで出す。 */
  object_url: string | null;
  /** Ghost cards (§5.3): temporary stand-in image so review isn't a blank. */
  placeholder_url: string | null;
  audio_url: string | null; // cached TTS if it exists; client falls back to speechSynthesis
  caption: string | null;
  location_name: string | null;
  taken_at: string | null;
  review_count: number; // completed reviews so far (word-tree unlock count)
  /** 思い出せなかった回数(score < 3)。「もう一度撮ろう」の判定に使う。 */
  lapses: number;
  /** この語でこれまでに撮った写真の枚数(最初の1枚 + 再会)。 */
  photo_count: number;
  /**
   * §6/B7: the pattern (branch) THIS review teaches — shown as the task
   * ("この型を使って一文") instead of the harder free-form 例文作れ.
   * Same branch the feedback call will unlock, so task and feedback agree.
   */
  prompt_pattern: { type: string; zh: string; ja?: string } | null;
  blur_seen: boolean;
  ease: number;
  interval_days: number;
  repetitions: number;
  /** 現在の推定記憶率 0-100(記憶レベルバッジ用)。 */
  retention: number;
  mode: ReviewMode;
  choices: string[]; // 4 meaning_ja options (shuffled); correct = meaning_ja
  headword_choices: string[]; // 4 headword options for reverse mode
  /** 4択の各選択肢の読み(注音・拼音)。表示は端末の表記設定に従う。 */
  headword_choice_infos: Array<{ headword: string; zhuyin: string | null; pinyin: string | null }>;
};

/**
 * 単語の extras から「最もよく一緒に使う型」を1つ取り出す。
 * usage_chunks[0] は生成時に「よく使う動詞・量詞・定番チャンクを優先」して
 * 並べてあるので先頭が最頻。パーツを繋いで読める1行にする。
 * 旧データ(collocations だけ)にも耐えるようフォールバックを持つ。
 */
function topChunkOf(rawExtras: unknown, headword: string): { zh: string; ja: string } | null {
  const ex = normalizeExtras(rawExtras);
  if (!ex) return null;
  // 量詞は答え合わせの「量詞」の行で読む。先頭の型がその写しだと、
  // 同じ「一張」が2行続けて出る(オーナー指摘 2026-08-18)。
  const chunk = refineUsageChunks(ex.usage_chunks, ex.measure_words, headword)[0];
  const zh = chunk?.parts?.map((p) => p.text).join("") ?? "";
  if (zh.trim()) return { zh, ja: chunk?.ja ?? "" };
  const legacy = ex.collocations?.[0];
  if (legacy?.trim()) return { zh: legacy, ja: "" };
  return null;
}

/**
 * 答え合わせで見せる解説一式。
 *
 * 復習の目的は「その場で口から出せるようになる」ことなので、辞書的な説明では
 * なく**そのまま言える塊**を先に出す:
 *  - chunks   : ネイティブがよく使う型(品詞で色分けして見せる)
 *  - related  : 一緒に/近い意味で使う語
 *  - measures : 量詞(名詞のときだけ)
 *  - note     : 知っておくと得な一言
 * 量は絞る — 4択の答え合わせは一瞬で読めることが最優先。
 */
function explainOf(rawExtras: unknown, headword: string): ReviewExplain | null {
  const ex = normalizeExtras(rawExtras);
  if (!ex) return null;
  // 量詞は measures の行で読むので、そこと重なるだけの型は落とす。
  const chunks = refineUsageChunks(ex.usage_chunks, ex.measure_words, headword)
    .filter((c) => (c.parts?.length ?? 0) > 0)
    .slice(0, 3)
    .map((c) => ({ parts: c.parts, ja: c.ja ?? "" }));
  const related = (ex.related_words ?? [])
    .filter((r) => !!r.word?.trim())
    .slice(0, 4)
    .map((r) => ({ word: r.word, kind: r.kind, note: r.note ?? "" }));
  const measures = (ex.measure_words ?? [])
    .filter((m) => !!m.word?.trim())
    .slice(0, 2)
    .map((m) => ({ word: m.word, note: m.note ?? "" }));
  const note = (ex.taiwan_note || ex.usage_context || "").trim();
  if (!chunks.length && !related.length && !measures.length && !note) return null;
  return { chunks, related, measures, note };
}

/** ローカル日付の 0:00 を ISO で返す(「今日の復習枚数」の起点)。 */
function startOfLocalDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export type ReviewStageFocus = "all" | "weak" | "new";

/**
 * 復習の出題設定。列がまだ無い環境(マイグレーション未適用)でも
 * 既定値で動き続けるよう、読めなければ既定にフォールバックする。
 */
async function getReviewPrefs(
  supabase: { from: (t: string) => never } | unknown,
  userId: string,
): Promise<{ limit: number; focus: ReviewStageFocus }> {
  const fallback = { limit: 20, focus: "all" as ReviewStageFocus };
  try {
    const { data, error } = await (
      supabase as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              maybeSingle: () => Promise<{
                data: { review_daily_limit?: number; review_stage_focus?: string } | null;
                error: unknown;
              }>;
            };
          };
        };
      }
    )
      .from("profiles")
      .select("review_daily_limit, review_stage_focus")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return fallback;
    const limit = typeof data.review_daily_limit === "number" ? data.review_daily_limit : 20;
    const focus =
      data.review_stage_focus === "weak" || data.review_stage_focus === "new"
        ? (data.review_stage_focus as ReviewStageFocus)
        : "all";
    return { limit: Math.max(0, Math.min(200, limit)), focus };
  } catch {
    return fallback;
  }
}

export const getDueReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        /**
         * 名指しで先に出したい1枚。場所の知らせを押して来たときに使う。
         * **期限も1日の上限も無視する** — 押した人はその言葉を思い出したくて
         * 押しているので、「今日の分は終わりです」と返すのは答えになっていない。
         */
        sticker_id: z.string().uuid().optional(),
      })
      .optional()
      .parse(input ?? undefined),
  )
  .handler(async ({ context, data: input }): Promise<DueReviewCard[]> => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const wantedSticker = input?.sticker_id ?? null;

    // 1日の上限(NORI指摘: 開くたびに新しい単語が無限に出て終われない)。
    // 「今日すでに何枚やったか」を review_history から数え、残り枚数だけ返す。
    // 端末をまたいでも一貫させたいのでサーバー側で数える。0 = 無制限。
    const { limit: dailyLimit, focus: stageFocus } = await getReviewPrefs(supabase, userId);
    let remaining = Number.POSITIVE_INFINITY;
    if (dailyLimit > 0) {
      const since = startOfLocalDayIso();
      const { count } = await supabase
        .from("review_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("reviewed_at", since);
      remaining = Math.max(0, dailyLimit - (count ?? 0));
      // 上限に当たったときも空配列を返す。**画面側は「今日の分は終わり」と
      // 「そもそも出る語が無い」を区別できないので**、下の
      // `getReviewCapState` で別途聞けるようにしてある(§8)。
      // 名指しで来た1枚だけは通す(下で改めて読む)。
      if (remaining === 0 && !wantedSticker) return [];
    }
    // 1回のフェッチは最大10枚のまま(体感の軽さ)。残り枚数がそれ未満なら絞る。
    const fetchLimit = Math.min(10, remaining);

    /**
     * **復習も学習言語で分ける。** 英語に切り替えた人に台湾華語の札が
     * 出るなら、アルバムと図鑑だけ分けても意味が無い
     * (オーナー指示「混ぜないで」)。
     *
     * 絞りは埋め込んだ2段先に掛ける — `reviews → stickers → words`。
     * PostgREST の形は `stickers.words.or=(…)` で、**通らない prefix は
     * 400 を返す**ので、下で拾って絞りを外す(空の復習を出さない)。
     */
    const targetLanguage = await getUserTargetLanguage(userId);
    const langFilter = wordLanguageFilter(targetLanguage);
    // 4択の受け皿は**その言語のもの**(`target-profile.ts` が持つ)。
    const quizFallback = {
      headwords: targetProfile(targetLanguage).capture.quizFallbackHeadwords,
      readings: targetProfile(targetLanguage).capture.quizFallbackReadings,
    };
    const dueSelect = (withGhost: boolean) =>
      `id, sticker_id, ease, interval_days, repetitions, blur_seen, last_reviewed_at, stickers!inner(cutout_image_url, object_image_url, caption, location_name, taken_at${withGhost ? ", placeholder_image_url, branch_plan" : ""}, words!inner(id, headword, language, reading_zhuyin, pinyin, meaning_ja, example_sentence, example_translation, category_key, entry_type, extras))`;
    // 記憶段階の優先度(設定):
    //   weak = 忘れかけ(ease が低い=何度も間違えた語)から先に
    //   new  = 覚えたて(復習回数が少ない語)から先に
    //   all  = 期限順(既定)
    const runDue = async (withLang: boolean) => {
      const base = supabase
        .from("reviews")
        .select(dueSelect(true))
        .eq("user_id", userId)
        .lte("due_at", nowIso);
      const scoped = withLang ? base.or(langFilter, { referencedTable: "stickers.words" }) : base;
      const focused =
        stageFocus === "weak"
          ? scoped.order("ease", { ascending: true })
          : stageFocus === "new"
            ? scoped.order("repetitions", { ascending: true })
            : scoped;
      return await focused.order("due_at", { ascending: true }).limit(fetchLimit);
    };
    let { data, error } = await runDue(true);
    // 絞りが通らない環境(列がまだ無い / 埋め込みの形が違う)では絞りを外す。
    // **復習が空になるより混ざるほうがまし。**
    if (error && /language|embedded resource/i.test(error.message)) {
      console.warn("[reviews] 学習言語で絞れないので絞りを外す:", error.message);
      ({ data, error } = await runDue(false));
    }
    if (error && /placeholder_image_url|entry_type|branch_plan/.test(error.message)) {
      ({ data, error } = (await supabase
        .from("reviews")
        .select(
          "id, sticker_id, ease, interval_days, repetitions, blur_seen, last_reviewed_at, stickers(cutout_image_url, object_image_url, caption, location_name, taken_at, words(id, headword, reading_zhuyin, pinyin, meaning_ja, example_sentence, example_translation, category_key))",
        )
        .eq("user_id", userId)
        .lte("due_at", nowIso)
        .order("due_at", { ascending: true })
        .limit(fetchLimit)) as unknown as { data: typeof data; error: typeof error });
    }
    if (error) throw new Error(error.message);

    type DueRow = {
      id: string;
      sticker_id: string;
      ease: number;
      interval_days: number;
      repetitions: number;
      blur_seen: boolean;
      last_reviewed_at: string | null;
      stickers: {
        cutout_image_url: string | null;
        object_image_url: string | null;
        caption: string | null;
        location_name: string | null;
        taken_at: string | null;
        placeholder_image_url?: string | null;
        branch_plan?: unknown;
        words: {
          id: string;
          headword: string;
          language: string | null;
          reading_zhuyin: string | null;
          pinyin: string | null;
          meaning_ja: string;
          example_sentence: string | null;
          example_translation: string | null;
          category_key: string | null;
          entry_type: string | null;
          extras?: unknown;
        } | null;
      } | null;
    };
    /**
     * **学習言語の語だけを残す**(オーナー報告 2026-08-26)。
     * > 「復習の記憶の状態が他の学習言語と混ざってるから、ほかの言語の
     * >  ものは表示しないで」
     *
     * 絞りは問い合わせの側でも掛けているが、列がまだ無い環境では
     * **絞りごと外して**投げ直している(上の `runDue(false)`)。
     * そこを通ると混ざったまま画面へ出ていた — 「空になるより混ざる
     * ほうがまし」と書いてあったが、オーナーが見たのは**まさにその混ざり**。
     *
     * 手元に来た行なら言語で選り分けられるので、ここで最後にもう一度通す。
     * 判定は `language-filter.ts` の1つだけを使う(問い合わせ側と同じ規則)。
     */
    const rows = ((data ?? []) as unknown as DueRow[])
      .filter((r) => r.stickers?.words)
      .filter((r) => matchesTargetLanguage(r.stickers?.words?.language, targetLanguage));

    // 名指しの1枚を先頭へ。
    // 既に今日の列に居るなら**動かすだけ**(二重に出さない)。
    // 居ないなら期限を無視して1枚だけ読む — 早めに復習しても SRS は壊れない
    // (間隔が伸びるだけ)。読めなくても列そのものは返す。
    if (wantedSticker) {
      const at = rows.findIndex((r) => r.sticker_id === wantedSticker);
      if (at > 0) {
        rows.unshift(...rows.splice(at, 1));
      } else if (at < 0) {
        const { data: one } = await supabase
          .from("reviews")
          .select(dueSelect(true))
          .eq("user_id", userId)
          .eq("sticker_id", wantedSticker)
          .maybeSingle();
        const row = one as unknown as DueRow | null;
        if (row?.stickers?.words) rows.unshift(row);
      }
    }

    if (rows.length === 0) return [];

    // Word-tree unlock counts: one review_history row per completed review.
    // **つまずいた回数もここで数える** — `repetitions` は連続正解の回数で、
    // つまずくたびに 0 に戻るので「何度もやったのに覚えられない」語ほど
    // 小さくなる。撮り直しの判定に使えるのは通算の回数のほう
    // (`src/lib/retake.ts`)。
    const stickerIds = rows.map((r) => r.sticker_id);
    const reviewCounts = new Map<string, number>();
    const lapseCounts = new Map<string, number>();
    {
      const { data: histRows } = await supabase
        .from("review_history")
        .select("sticker_id, score")
        .eq("user_id", userId)
        .in("sticker_id", stickerIds);
      for (const h of (histRows ?? []) as Array<{ sticker_id: string; score: number | null }>) {
        reviewCounts.set(h.sticker_id, (reviewCounts.get(h.sticker_id) ?? 0) + 1);
        if ((h.score ?? 5) < LAPSE_SCORE) {
          lapseCounts.set(h.sticker_id, (lapseCounts.get(h.sticker_id) ?? 0) + 1);
        }
      }
    }
    // 撮った枚数 = 最初の1枚 + 再会の回数。列がまだ無い環境でも
    // **落とさない** — 数えられなければ「1枚」として扱い、提案は出る。
    const encounterCounts = new Map<string, number>();
    {
      const { data: encRows } = await supabase
        .from("encounters")
        .select("sticker_id")
        .eq("user_id", userId)
        .in("sticker_id", stickerIds);
      for (const e of (encRows ?? []) as Array<{ sticker_id: string }>) {
        encounterCounts.set(e.sticker_id, (encounterCounts.get(e.sticker_id) ?? 0) + 1);
      }
    }

    // The user's own deck is the distractor pool — zero AI calls at review time.
    const { data: deckRows } = await supabase
      .from("stickers")
      .select("words(id, headword, meaning_ja, category_key, reading_zhuyin, pinyin)")
      .eq("user_id", userId)
      .limit(500);
    type DeckWord = {
      id: string;
      headword: string;
      meaning_ja: string;
      category_key: string | null;
      reading_zhuyin?: string | null;
      pinyin?: string | null;
    };
    const deck: DeckWord[] = [];
    const seen = new Set<string>();
    for (const r of (deckRows ?? []) as unknown as Array<{ words: DeckWord | null }>) {
      if (r.words && !seen.has(r.words.id)) {
        seen.add(r.words.id);
        deck.push(r.words);
      }
    }

    // A3 レベル連動: 目標レベル以下の辞書語をヘッドワード・ディストラクタの
    // 追加プールにする(デッキが小さいうちも4択が「全部知らない字」にならない)。
    let dictPool: string[] = [];
    // 4択の選択肢に読み(注音/拼音)を出すための逆引き表。
    const readingByHead = new Map<string, { zhuyin: string | null; pinyin: string | null }>();
    try {
      const levelGoal = await getUserLevelGoal(userId);
      const lvl = Number(levelGoal.match(/(\d)/)?.[1] ?? 2);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const pivot = crypto.randomUUID();
      /**
       * **誤答は学習言語の語から作る**(オーナー報告 2026-08-26)。
       * > 「4択の選択に英単語の4択なのに、学習言語、台湾華語のものが
       * >  混ざってる。学習言語の単語だけを表示して」
       *
       * ここは `DEFAULT_TARGET_LANGUAGE` と `tocfl_level` に決め打たれて
       * いた。英語を学んでいる人の4択に、**中国語の語が3つ並ぶ**。
       *
       * 級の列も言語で違う: `tocfl_level` は名前のとおり台湾華語の列で、
       * 英語の行には入らない(`admin.functions.ts` の注)。言語中立の
       * `level_step` を見て、**級が付いていない語(級外)も混ぜる** —
       * 英語の辞書は級外のほうが多いので、外すと誤答が作れない。
       */
      const readingCols =
        targetLanguage === DEFAULT_TARGET_LANGUAGE
          ? "headword, zhuyin, pinyin"
          : "headword, reading_primary, reading_alt";
      const pool = supabaseAdmin
        .from("dictionary_entries")
        .select(readingCols)
        .eq("language", targetLanguage)
        .gte("id", pivot)
        .limit(40);
      const { data: dictRows } =
        targetLanguage === DEFAULT_TARGET_LANGUAGE
          ? await pool.lte("tocfl_level", lvl)
          : await pool.or(`level_step.lte.${lvl},level_step.is.null`);
      const dicts = (dictRows ?? []) as unknown as Array<{
        headword: string;
        zhuyin?: string | null;
        pinyin?: string | null;
        reading_primary?: string | null;
        reading_alt?: string | null;
      }>;
      // 読みの列名も言語で違う。**新しい列を先に見る**(`dictionary-entry.ts`)。
      for (const d of dicts) {
        readingByHead.set(d.headword, {
          zhuyin: d.reading_primary ?? d.zhuyin ?? null,
          pinyin: d.reading_alt ?? d.pinyin ?? null,
        });
      }
      dictPool = shuffle(dicts.map((d) => d.headword));
    } catch {
      /* dictionary pool is optional */
    }

    // Pre-generated AI distractors (best-effort: table may not exist yet).
    const wordIds = rows.map((r) => r.stickers!.words!.id);
    const cached = new Map<string, string[]>();
    const { data: choiceRows } = await supabase
      .from("review_choices")
      .select("word_id, distractors")
      .in("word_id", wordIds);
    for (const c of choiceRows ?? []) cached.set(c.word_id, c.distractors ?? []);

    // Batch-sign all image and audio URLs in two calls instead of one per card.
    // **元写真も署名する。**
    //
    // ここは切り抜きとネット画像しか取っていなかった。つまり
    // **切り抜きの無い札は写真なしで復習に出ていた** — かざして撮った札は
    // 設計上いま切り抜きを作らないので、その一群がまるごと該当する。
    // 「写真を見て、その語を言う」が復習の中身なのに、写真が無い。
    // (7箇所の選び方を `sticker-photo.ts` に集めていて気づいた。)
    const cutoutPaths = rows
      .flatMap((r) => [
        r.stickers!.cutout_image_url,
        r.stickers!.object_image_url ?? null,
        r.stickers!.placeholder_image_url ?? null,
      ])
      .filter((p): p is string => !!p);
    const cutoutUrlByPath = new Map<string, string>();
    if (cutoutPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from("stickers")
        .createSignedUrls([...new Set(cutoutPaths)], 60 * 60 * 6);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl && !s.error) cutoutUrlByPath.set(s.path, s.signedUrl);
      }
    }
    const audioPaths = await Promise.all(
      rows.map((r) =>
        ttsObjectPath(DEFAULT_TARGET_LANGUAGE, TTS_VOICE_DEFAULT, r.stickers!.words!.headword),
      ),
    );
    const audioUrlByPath = new Map<string, string>();
    {
      const { data: signed } = await supabase.storage
        .from("tts")
        .createSignedUrls(audioPaths, 60 * 60 * 6);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl && !s.error) audioUrlByPath.set(s.path, s.signedUrl);
      }
    }

    return rows.map((row, i) => {
      const w = row.stickers!.words!;
      const sameCat = shuffle(
        deck.filter((d) => d.id !== w.id && d.category_key === w.category_key),
      );
      const otherCat = shuffle(
        deck.filter((d) => d.id !== w.id && d.category_key !== w.category_key),
      );

      // 池は「その学習者の頭の中で実際に混ざる誤答」から先に。
      // 最後は必ず受け皿 — 撮った語がまだ1つでも、選択肢は4つ出す。
      const meaningChoices = buildChoices(w.meaning_ja, [
        sameCat.map((d) => d.meaning_ja),
        cached.get(w.id) ?? [],
        otherCat.map((d) => d.meaning_ja),
        FALLBACK_MEANINGS,
      ]);
      const headwordChoices = buildChoices(w.headword, [
        sameCat.map((d) => d.headword),
        dictPool,
        otherCat.map((d) => d.headword),
        // **受け皿もその言語のもの**(オーナー報告 2026-08-26
        // 「4択が学習言語英語なのに台湾華語の単語が混ざってる」)。
        // 撮った語が少ない人ほどここまで落ちるので、ここが混ざると
        // 始めたばかりの人の4択が丸ごと別の言語になる。
        quizFallback.headwords,
      ]);

      // デッキ語の読みも逆引き表へ(4択の注音表示用)。
      for (const d of deck) {
        if (!readingByHead.has(d.headword)) {
          readingByHead.set(d.headword, {
            zhuyin: d.reading_zhuyin ?? null,
            pinyin: d.pinyin ?? null,
          });
        }
      }
      readingByHead.set(w.headword, { zhuyin: w.reading_zhuyin, pinyin: w.pinyin });
      for (const [h, r] of Object.entries<{ zhuyin: string; pinyin: string }>(
        quizFallback.readings,
      )) {
        if (!readingByHead.has(h)) readingByHead.set(h, r);
      }
      // 未復習カードは「出会った日(taken_at)」を記憶の起点にする。null のままだと
      // retentionNow が 100% を返し、同じ画面の記憶リスト(getMemoryOverview は
      // taken_at 起点)と矛盾する(カードは100%なのに一覧では「忘れかけ」)。
      const lastMs = row.last_reviewed_at
        ? new Date(row.last_reviewed_at).getTime()
        : row.stickers!.taken_at
          ? new Date(row.stickers!.taken_at).getTime()
          : null;

      const cutoutPath = row.stickers!.cutout_image_url;
      // The branch this review will unlock = today's designated pattern.
      // Mirrors getSpeakingFeedback's selection so task and feedback agree.
      const reviewCount = reviewCounts.get(row.sticker_id) ?? 0;
      const plan = parseBranchPlan(row.stickers!.branch_plan) ?? [];
      const promptPattern: Branch | null = resolveBranches(
        plan,
        Math.max(1, reviewCount + 1),
      ).justUnlocked;
      return {
        review_id: row.id,
        sticker_id: row.sticker_id,
        word_id: w.id,
        headword: w.headword,
        language: w.language ?? null,
        reading_zhuyin: w.reading_zhuyin,
        pinyin: w.pinyin,
        meaning_ja: w.meaning_ja,
        example_sentence: w.example_sentence,
        example_translation: w.example_translation,
        // 4択の答え合わせで見せるのは長い例文ではなく「一番よく一緒に使う形」。
        // extras.usage_chunks の先頭(=最頻の型)をその場で読める短い1行にする。
        top_chunk: topChunkOf(w.extras, w.headword),
        explain: explainOf(w.extras, w.headword),
        category_key: w.category_key,
        entry_type: w.entry_type ?? "word",
        cutout_url: cutoutPath ? (cutoutUrlByPath.get(cutoutPath) ?? null) : null,
        object_url: row.stickers!.object_image_url
          ? (cutoutUrlByPath.get(row.stickers!.object_image_url) ?? null)
          : null,
        placeholder_url: row.stickers!.placeholder_image_url
          ? (cutoutUrlByPath.get(row.stickers!.placeholder_image_url) ?? null)
          : null,
        audio_url: audioUrlByPath.get(audioPaths[i]) ?? null,
        caption: row.stickers!.caption,
        location_name: row.stickers!.location_name,
        taken_at: row.stickers!.taken_at,
        review_count: reviewCount,
        lapses: lapseCounts.get(row.sticker_id) ?? 0,
        photo_count: 1 + (encounterCounts.get(row.sticker_id) ?? 0),
        prompt_pattern: promptPattern,
        blur_seen: row.blur_seen,
        ease: row.ease,
        interval_days: row.interval_days,
        repetitions: row.repetitions,
        retention: Math.round(retentionNow(row.interval_days, row.ease, lastMs, Date.now())),
        mode: modeFor(row.repetitions),
        choices: meaningChoices,
        headword_choices: headwordChoices,
        headword_choice_infos: headwordChoices.map((h) => ({
          headword: h,
          zhuyin: readingByHead.get(h)?.zhuyin ?? null,
          pinyin: readingByHead.get(h)?.pinyin ?? null,
        })),
      };
    });
  });

// --- Distractor pre-generation (runs once at card save time, off the review path) ---

const MakerSchema = z.object({
  distractors: z.array(z.string().min(1)).length(3),
});
const CheckerSchema = z.object({
  verdicts: z.array(
    z.object({
      ok: z.boolean(),
      reason: z.string().optional().default(""),
    }),
  ),
});

/**
 * Maker/Checker loop producing 3 plausible-but-wrong meanings. Called from
 * saveSticker (fire-and-forget); results land in review_choices. Failure is
 * fine — reviews fall back to the user's own deck.
 */
export async function pregenerateDistractors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  wordId: string,
  headword: string,
  correctMeaning: string,
  categoryKey: string | null,
): Promise<void> {
  const ai = await getAiFor("review");
  const accepted: string[] = [];
  let iter = 0;
  const MAX = 2;

  while (accepted.length < 3 && iter < MAX) {
    iter++;
    const makerPrompt = `台湾華語の単語「${headword}」（意味: ${correctMeaning}${categoryKey ? `、カテゴリ: ${categoryKey}` : ""}）の4択クイズ用に、もっともらしいが間違っている意味を3つ作ってください。**正解「${correctMeaning}」と同じ言語で書く**(正解が英語なら英語、日本語なら日本語)。
- 正解「${correctMeaning}」と同義語/言い換えは禁止
- 文字数は正解と同程度
- 学習者が一瞬迷う難易度（同カテゴリの別物がベスト）
- すでに却下された候補: ${accepted.length ? accepted.join(", ") : "なし"}`;

    let candidates: string[] = [];
    try {
      const makerOut = await generateStructured({
        model: ai.gateway(ai.modelFast),
        prompt: makerPrompt,
        schema: MakerSchema,
      });
      candidates = makerOut.distractors;
    } catch {
      continue; // this iteration produced nothing; reviews fall back to the deck
    }

    const checkerPrompt = `以下は単語「${headword}」（正解の意味: ${correctMeaning}）の4択クイズの不正解候補です。
各候補について、(a) 正解と意味が被っていない (b) 学習者を惑わすが正解とは明確に違う、を満たすかtrue/falseで判定してください。
候補:
${candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

    let verdicts: z.infer<typeof CheckerSchema>["verdicts"] = [];
    try {
      const checkOut = await generateStructured({
        model: ai.gateway(ai.modelFast),
        prompt: checkerPrompt,
        schema: CheckerSchema,
      });
      verdicts = checkOut.verdicts;
    } catch {
      /* no checker verdicts — candidates pass unless they duplicate the answer */
    }

    for (let i = 0; i < candidates.length; i++) {
      const v = verdicts[i];
      const c = candidates[i];
      if (!c || c === correctMeaning || accepted.includes(c)) continue;
      if (v?.ok !== false) accepted.push(c);
      if (accepted.length >= 3) break;
    }
  }
  if (accepted.length === 0) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("review_choices")
    .upsert({ word_id: wordId, distractors: accepted.slice(0, 3) });
  await supabase.from("ai_runs").insert({
    user_id: userId,
    loop: "review_distractor_pregen",
    iterations: iter,
    accepted: accepted.length,
    meta: { headword },
  });
}

const GradeInput = z.object({
  review_id: z.string().uuid(),
  correct: z.boolean(),
  blur_seen: z.boolean().default(false),
  response_ms: z.number().int().nonnegative().default(0),
  /**
   * Speaking review result (§6): success = said it without help (5),
   * hint = needed the word revealed = lapse (2), skip = couldn't say it (1).
   * When omitted, the classic correct/blur scoring applies (choice mode).
   */
  result: z.enum(["success", "hint", "skip"]).optional(),
  /** Convenience flag: same as result="hint" (a lapse, score 2). */
  hint_used: z.boolean().default(false),
});

/**
 * 今日の復習が「上限で止まっている」のか「もう出る語が無い」のかを返す。
 *
 * ## なぜ要るか
 * `listDueReviews` はどちらの場合も空配列を返す。画面はそれを見て
 * 「今日復習する単語はありません」と出していた — 期限切れが180枚
 * 溜まっていても同じ文面で、**上限に当たったとは一言も書かれず、
 * 上限を上げる導線も無い**。
 *
 * 図鑑では「全N件のうち…まだ出せていません」と正直に書いているのに、
 * 復習だけが「無い」と言っていた。同じアプリの中で基準が食い違う。
 *
 * 一覧が空だったときにだけ聞けばいいので、別の関数にしてある。
 */
/**
 * いま出せる復習の枚数を数える。学習言語で絞った数。
 *
 * 絞りが通らない環境では**絞らずに数え直す** — 0 と答えると画面が
 * 「今日は終わり」と言い切ってしまい、元の不具合に戻る。
 */
async function countDue(
  supabase: { from: (t: string) => never } | ReturnType<typeof Object>,
  userId: string,
  langFilter: string,
): Promise<{ count: number | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const base = () =>
    db
      .from("reviews")
      .select("id, stickers!inner(words!inner(language))", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_at", new Date().toISOString());
  const res = await base().or(langFilter, { referencedTable: "stickers.words" });
  if (!res.error) return { count: res.count ?? 0 };
  const plain = await db
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString());
  return { count: plain.error ? null : (plain.count ?? 0) };
}

export const getReviewCapState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { limit: dailyLimit } = await getReviewPrefs(supabase, userId);
    const dueLangFilter = wordLanguageFilter(await getUserTargetLanguage(userId));
    // **上限が無制限でも数える。** 前はここで早く返していたが、
    // 「あと何枚出せるか」は上限とは別の話で、束(10枚)を終えた画面が
    // それを知らないと「今日の復習、終わりました」と言い切ってしまう
    // (`src/lib/review-batch.ts` の注釈)。
    const [doneRes, dueRes] = await Promise.all([
      supabase
        .from("review_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("reviewed_at", startOfLocalDayIso()),
      // 採点した札は `due_at` が先へ動くので、ここには残らない。
      // **絞りは `getDueReviews` と同じにする。** ここだけ絞らないと
      // 「あと190枚あります」と言ったのに「続ける」で1枚も出てこない。
      countDue(supabase, userId, dueLangFilter),
    ]);
    const doneToday = doneRes.count ?? 0;
    const dueRemaining = dueRes.count ?? 0;
    const limit = Math.max(0, dailyLimit);
    // 言い方の判断は**純粋な関数1つ**に寄せる。画面も同じものを読む。
    const kind = batchEndKind({ limit, doneToday, dueRemaining });
    return { capped: kind === "capped", limit, doneToday, dueRemaining };
  });

export const gradeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GradeInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("reviews")
      .select("id, sticker_id, ease, interval_days, repetitions, blur_seen")
      .eq("id", data.review_id)
      .eq("user_id", userId)
      .single();
    if (error) throw new Error(error.message);

    // Score: correct=5 base; blur penalty -1; slow (>8s) -1; wrong=1.
    // Speaking mode sends `result` (or hint_used): success=5 / hint=2 (lapse,
    // §6「ヒント使用=失念」 — resets SM-2 but is gentler on ease than a fail) / skip=1.
    let score = 1;
    const result = data.result ?? (data.hint_used ? "hint" : undefined);
    if (result) {
      score = result === "success" ? 5 : result === "hint" ? 2 : 1;
    } else if (data.correct) {
      score = 5;
      if (data.blur_seen) score -= 1;
      if (data.response_ms > 8000) score -= 1;
    } else {
      score = 1;
    }
    score = Math.max(0, Math.min(5, score));

    const next = nextSrs(
      { ease: row.ease, interval_days: row.interval_days, repetitions: row.repetitions },
      score,
    );
    const dueAt = new Date(Date.now() + next.interval_days * 86400 * 1000).toISOString();

    const { error: upErr } = await supabase
      .from("reviews")
      .update({
        ease: next.ease,
        interval_days: next.interval_days,
        repetitions: next.repetitions,
        last_score: score,
        last_reviewed_at: new Date().toISOString(),
        due_at: dueAt,
        blur_seen: row.blur_seen || data.blur_seen,
      })
      .eq("id", data.review_id)
      .eq("user_id", userId);
    if (upErr) throw new Error(upErr.message);

    // Append to review_history for the forgetting-curve visualization.
    await supabase.from("review_history").insert({
      user_id: userId,
      review_id: data.review_id,
      sticker_id: row.sticker_id,
      score,
      correct: data.correct,
      blur_seen: data.blur_seen,
      response_ms: data.response_ms,
      interval_days_after: next.interval_days,
      ease_after: next.ease,
      repetitions_after: next.repetitions,
    });

    return { score, next_due_at: dueAt, interval_days: next.interval_days };
  });

// --- Forgetting curve data ---------------------------------------------------

export type StickerMemoryHistory = {
  history: Array<{
    reviewed_at: string;
    score: number;
    interval_days_after: number;
    ease_after: number;
  }>;
  current: {
    ease: number;
    interval_days: number;
    last_reviewed_at: string | null;
    due_at: string | null;
  } | null;
  /** 未復習でも曲線を引くための起点(この単語をキャッチした日)。 */
  taken_at: string | null;
};

export const getStickerMemoryHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sticker_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<StickerMemoryHistory> => {
    const { supabase, userId } = context;
    const [{ data: hist }, { data: rev }, { data: st }] = await Promise.all([
      supabase
        .from("review_history")
        .select("reviewed_at, score, interval_days_after, ease_after")
        .eq("user_id", userId)
        .eq("sticker_id", data.sticker_id)
        .order("reviewed_at", { ascending: true }),
      supabase
        .from("reviews")
        .select("ease, interval_days, last_reviewed_at, due_at")
        .eq("user_id", userId)
        .eq("sticker_id", data.sticker_id)
        .maybeSingle(),
      supabase
        .from("stickers")
        .select("taken_at")
        .eq("user_id", userId)
        .eq("id", data.sticker_id)
        .maybeSingle(),
    ]);
    return {
      history: hist ?? [],
      current: rev
        ? {
            ease: rev.ease,
            interval_days: rev.interval_days,
            last_reviewed_at: rev.last_reviewed_at,
            due_at: rev.due_at,
          }
        : null,
      taken_at: (st as { taken_at?: string | null } | null)?.taken_at ?? null,
    };
  });

export type OverallMemoryStats = {
  /** いまの平均記憶率(0-100)。数えられる語が無ければ null。 */
  avg_retention: number | null;
  total_cards: number;
  due_now: number;
  /** -14..+14。過去は `review_history` から復元した**その日の状態**。 */
  series: RetentionPoint[];
};

export const getOverallMemoryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OverallMemoryStats> => {
    const { supabase, userId } = context;
    // 過去側は**記録**から作る。ここを現在の状態から作っていたせいで、
    // 復習した瞬間に過去14日が全部 100% に塗り替わっていた
    // (`src/lib/retention-series.ts` の冒頭に経緯)。
    const [{ data: rows }, { data: hist }] = await Promise.all([
      supabase
        .from("reviews")
        .select("sticker_id, ease, interval_days, last_reviewed_at, due_at, stickers(taken_at)")
        .eq("user_id", userId),
      supabase
        .from("review_history")
        .select("sticker_id, reviewed_at, interval_days_after, ease_after")
        .eq("user_id", userId)
        .order("reviewed_at", { ascending: true })
        .limit(5000),
    ]);
    type StatRow = {
      sticker_id: string;
      ease: number;
      interval_days: number;
      last_reviewed_at: string | null;
      due_at: string | null;
      stickers?: { taken_at?: string | null } | null;
    };
    const raw = (rows ?? []) as unknown as StatRow[];
    const cards: RetentionCard[] = raw.map((r) => ({
      sticker_id: r.sticker_id,
      taken_at: r.stickers?.taken_at ?? null,
      ease: r.ease,
      interval_days: r.interval_days,
      last_reviewed_at: r.last_reviewed_at,
    }));
    const events = (hist ?? []) as unknown as RetentionEvent[];
    const now = Date.now();
    const dueNow = raw.filter((r) => r.due_at && new Date(r.due_at).getTime() <= now).length;

    const { series, avg_retention } = buildRetentionSeries({ cards, events, nowMs: now });

    return { avg_retention, total_cards: cards.length, due_now: dueNow, series };
  });

// --- B5 記憶の状態ビジュアライズ ---------------------------------------------
export type MemoryWord = {
  sticker_id: string;
  headword: string;
  retention: number; // 0-100(現在の推定記憶率)
  interval_days: number;
  repetitions: number;
  due_at: string | null;
  days_until_forgot: number | null; // 記憶率が50%を切るまでの日数(既に下回れば0)
  fresh: boolean; // 覚えたて(repetitions<=2)
  long_term: boolean; // 長期定着(interval>=30日)
  /** 記憶の起点(最終復習 or 未復習ならキャッチ日)。曲線の描画に使う。 */
  anchor_at: string | null;
  /** 現在の安定度(日) — 記憶率が 1/e に落ちるまでの時間。 */
  stability_days: number;
  ease: number;
};
export type MemoryOverview = {
  danger: number; // retention < 50
  fuzzy: number; // 50-80
  solid: number; // > 80
  words: MemoryWord[];
};

const LN2 = Math.log(2);

export const getMemoryOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemoryOverview> => {
    const { supabase, userId } = context;
    /**
     * **記憶の状態も学習言語で分ける**(オーナー報告 2026-08-26、2度目)。
     * > 「復習の記憶の状態が学習言語を英語に切り替えたのに、台湾華語の
     * >  単語が表示されてる。学習言語によって区別して混ざらないように。」
     *
     * ここには絞りが**1つも無かった**。出す列の一覧を作るときに
     * `language` を持ってきていないので、絞りようも無かった。
     * 今日の列(`getDueReviews`)だけ直しても、この画面は混ざったまま。
     */
    const targetLanguage = await getUserTargetLanguage(userId);
    const { data: rows } = await supabase
      .from("reviews")
      .select(
        "sticker_id, ease, interval_days, repetitions, last_reviewed_at, due_at, stickers(taken_at, words(headword, language))",
      )
      .eq("user_id", userId);
    const now = Date.now();
    type Row = {
      sticker_id: string;
      ease: number;
      interval_days: number;
      repetitions: number;
      last_reviewed_at: string | null;
      due_at: string | null;
      stickers: {
        taken_at?: string | null;
        words: { headword: string; language?: string | null } | null;
      } | null;
    };
    const words: MemoryWord[] = ((rows ?? []) as unknown as Row[])
      .filter((r) => r.stickers?.words)
      // 判定は `language-filter.ts` の1つだけ(今日の列と同じ規則)。
      .filter((r) => matchesTargetLanguage(r.stickers?.words?.language, targetLanguage))
      .map((r) => {
        // 未復習(last_reviewed_at が null)でも曲線を描く: 記憶の起点は
        // 「その単語に出会った瞬間」= sticker.taken_at。学習直後の記憶は
        // 1日前後で急速に落ちるので、初期安定度は interval_days(=1)ベース。
        const anchorIso = r.last_reviewed_at ?? r.stickers?.taken_at ?? null;
        const anchorMs = anchorIso ? new Date(anchorIso).getTime() : null;
        const stability = stabilityOf(r.interval_days, r.ease);
        const retention = Math.round(retentionNow(r.interval_days, r.ease, anchorMs, now));
        // 50%到達日: 100*exp(-dt/stability)=50 → dt = stability*ln2
        let daysUntilForgot: number | null = null;
        if (anchorMs != null) {
          const dtNow = (now - anchorMs) / 86400_000;
          daysUntilForgot = Math.max(0, Math.round(stability * LN2 - dtNow));
        }
        return {
          sticker_id: r.sticker_id,
          headword: r.stickers!.words!.headword,
          retention,
          interval_days: r.interval_days,
          repetitions: r.repetitions,
          due_at: r.due_at,
          days_until_forgot: daysUntilForgot,
          fresh: r.repetitions <= 2,
          long_term: r.interval_days >= 30,
          anchor_at: anchorIso,
          stability_days: stability,
          ease: r.ease,
        };
      })
      .sort((a, b) => a.retention - b.retention); // 危険な語を上に

    return {
      danger: words.filter((w) => w.retention < 50).length,
      fuzzy: words.filter((w) => w.retention >= 50 && w.retention <= 80).length,
      solid: words.filter((w) => w.retention > 80).length,
      words,
    };
  });

// --- Speaking-output review feedback (§6) -----------------------------------

const FeedbackInput = z.object({
  sticker_id: z.string().uuid(),
  transcript: z.string().min(1).max(500),
  hint_used: z.boolean().default(false),
});

// 詳しい役割: 動詞・目的語は V1/V2, O1/O2 のように区別できる(連動文など)。
const PosEnum = z.enum(["S", "V", "V1", "V2", "O", "O1", "O2", "M", "Adv", "C", "Prep", "Ptc"]);
export type SpeakingPos = z.infer<typeof PosEnum>;

const FeedbackSchema = z.object({
  corrected: z.string(),
  natural_score: z.number().int().min(1).max(5),
  used_target: z.boolean(),
  correction_note: z.string(),
  chunk: z
    .array(z.object({ text: z.string(), pos: PosEnum }))
    .min(1)
    .max(12),
  chunk_note: z.string(),
  /** なぜこの語順になるのか — 台湾華語の語順ルールの短い解説(日本語)。 */
  word_order_rule: z.string(),
  native_note: z.string(),
  model_answer: z.string(),
  alt_answer: z.string(),
});
export type SpeakingFeedback = z.infer<typeof FeedbackSchema> & {
  headword: string;
  reading_zhuyin: string | null;
  pinyin: string | null;
  meaning_ja: string;
  /** §6 word tree: the branch this review presents/unlocks as「今日の型」. */
  unlocked_branch: Branch | null;
};

export const getSpeakingFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackInput.parse(input))
  .handler(async ({ context, data }): Promise<SpeakingFeedback> => {
    const { supabase, userId } = context;
    await assertWithinDailyCap(userId, "speaking_feedback");
    // branch_plan/entry_type/extras may predate the Phase A migration —
    // retry without them so feedback never breaks on a stale schema.
    let { data: st, error } = await supabase
      .from("stickers")
      .select(
        "id, caption, location_name, branch_plan, words(headword, reading_zhuyin, pinyin, meaning_ja, example_sentence, entry_type, extras)",
      )
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error && /branch_plan|entry_type/.test(error.message)) {
      ({ data: st, error } = (await supabase
        .from("stickers")
        .select(
          "id, caption, location_name, words(headword, reading_zhuyin, pinyin, meaning_ja, example_sentence, extras)",
        )
        .eq("id", data.sticker_id)
        .eq("user_id", userId)
        .maybeSingle()) as unknown as { data: typeof st; error: typeof error });
    }
    if (error || !st?.words) throw new Error("カードが見つかりません");
    const row = st as unknown as {
      id: string;
      caption: string | null;
      location_name: string | null;
      branch_plan?: unknown;
      words: {
        headword: string;
        reading_zhuyin: string | null;
        pinyin: string | null;
        meaning_ja: string;
        example_sentence: string | null;
        entry_type?: string | null;
        extras?: unknown;
      };
    };
    const w = row.words;
    const isPhrase = w.entry_type === "phrase";

    // §6 word tree: the pattern we teach IS the branch this review unlocks —
    // one branch per completed review, no extra AI call for the selection.
    const { count } = await supabase
      .from("review_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("sticker_id", data.sticker_id);
    const plan =
      parseBranchPlan(row.branch_plan) ??
      buildBranchPlan(w.extras as Parameters<typeof buildBranchPlan>[0]);
    const branch = resolveBranches(plan, Math.max(1, (count ?? 0) + 1)).justUnlocked;

    const ai = await getAiFor("review");
    const levelRule = await levelInstruction(userId);
    const langRule = await explanationLanguageRule(userId);
    // 本文の「日本語で」という指示が langRule と矛盾しないよう言語名を差し替える。
    const NL = (await getExplanationLanguage(userId)) === "en" ? "英語" : "日本語";
    // 母語ごとの干渉(語順・アスペクト・発音)を添削の観点に入れる。
    const l1 = await l1Rule(userId, "both");
    const levelGoal = await getUserLevelGoal(userId);
    const prompt = `あなたは台湾華語(zh-TW)のネイティブ講師です。${langRule}学習者が自分の写真を見て「${w.headword}(${w.meaning_ja})」を使って一文話しました。以下を厳密なJSONで返してください。

学習者の発話: 「${data.transcript}」
${levelRule}
${l1}
${data.hint_used ? "※学習者は単語を思い出せずヒントを見ました。\n" : ""}${row.caption ? `撮影時のメモ: 「${row.caption}」\n` : ""}${row.location_name ? `撮影場所: ${row.location_name}\n` : ""}${isPhrase ? "これはフレーズカードです。返答として自然か、トーンも見てください。\n" : ""}${branch ? `今回教える「型」: 「${branch.zh}」${branch.ja ? `(${branch.ja})` : ""} — chunk と chunk_note は必ずこの表現を使って組み立ててください。\n` : ""}
要件:
- corrected: 学習者の意図を尊重した自然な台湾華語の添削文(繁体字)。ほぼ正しければそのまま。
- natural_score: 1〜5。5=ネイティブそのまま、3=通じるが不自然、1=通じない/対象語を使っていない。
- used_target: 「${w.headword}」を(活用形含め)使っているか。
- correction_note: 何をどう直したか、なぜ不自然だったかを${NL}で1〜2文。
- chunk: ${branch ? `「${branch.zh}」を含む自然な一文` : "corrected"}を語順パーツに分解。posは S(主語)/V(動詞)/O(目的語)/M(修飾・量詞)/Adv(副詞)/C(接続)/Prep(介詞)/Ptc(助詞)。動詞や目的語が複数ある文(連動文・二重目的語)は V1,V2 / O1,O2 と番号で区別する。3〜8個程度。
- chunk_note: この構文の使いどころを${NL}で1文。
- word_order_rule: **なぜこの語順になるのか**、台湾華語の語順ルールを${NL}1〜2文で解説。**学習者の母語と違う点**があればそこを名指しで説明する(例:「中国語は S+時間+場所+V+O の順。学習者の母語と違い動詞が目的語の前に来る」「"用+道具+V" のように手段が動詞の前」など、この文に当てはまるルールを具体的に)。
- native_note: モノの一般的な説明(「リップクリームは乾燥した時に使う」等)は**禁止**。書くのは(a)ネイティブが「${w.headword}」を実際に口にする典型的なタイミング・状況・その時の気持ち、(b)一緒によく使う動詞や量詞、定番チャンク(例:「擦護唇膏」「一條護唇膏」のように繁体字で)。${NL}2〜3文。
- model_answer: この写真の状況で「${w.headword}」を使ったお手本(自然な台湾華語1文、繁体字、${levelGoal}以下の語彙)。
- alt_answer: 別の言い方1つ(繁体字)。`;

    const pro = await isProUser(userId);
    const feedback = await generateStructured({
      model: ai.gateway(pro ? ai.modelRichPremium : ai.modelRich),
      prompt,
      schema: FeedbackSchema,
      // Proモデルが使えない環境でも添削が止まらないように
      fallbackModel: ai.gateway(ai.modelFast),
    });

    // KPI (roadmap §3): speaking reviews feed the admin dashboard.
    await logUsage(supabase, userId, "speaking_feedback");
    await supabase.from("ai_runs").insert({
      user_id: userId,
      loop: "speaking_feedback",
      iterations: 1,
      accepted: 1,
      meta: { headword: w.headword, score: feedback.natural_score },
    });

    return {
      ...feedback,
      headword: w.headword,
      reading_zhuyin: w.reading_zhuyin,
      pinyin: w.pinyin,
      meaning_ja: w.meaning_ja,
      unlocked_branch: branch,
    };
  });

// --- B4 スピーキングの足場(MTC式) ------------------------------------------
// 「白紙で話して」は厳しい。MTCの授業と同じく「習った型を使わせる先生の質問」
// +「自分の言いたいことに対応する文のパーツ」を提示し、組み合わせて作文させる。
// 単語レベルの足場(質問+パーツ)は words.extras.speaking_scaffold にキャッシュ
// して2回目以降ゼロコスト。キャプション(その人の気持ち・思い出)はスティッカー
// 固有なので毎回そのまま「言いたいことの種」として添える。

/** ヒント1つの種類。表示の見出し(チャンク/フレーズ/文法)に使う。 */
export type SpeakingPartKind = "chunk" | "phrase" | "grammar";

export type SpeakingPart = {
  zh: string;
  /** 母語訳・説明。UI言語(日本語/英語)で書かれる。 */
  ja: string;
  kind: SpeakingPartKind;
  /** 品詞色分け用の分解(単語詳細のチャンクと同じ体系)。空なら zh をそのまま出す。 */
  chunks: { text: string; pos: string }[];
};
export type SpeakingScaffold = {
  question_zh: string;
  question_ja: string;
  parts: SpeakingPart[];
  caption_seed: string | null;
};

const ScaffoldSchema = z.object({
  question_zh: z.string(),
  question_ja: z.string(),
  parts: z
    .array(
      z.object({
        zh: z.string(),
        ja: z.string(),
        kind: z.enum(["chunk", "phrase", "grammar"]).catch("chunk"),
        chunks: z.array(z.object({ text: z.string(), pos: z.string().catch("") })).catch([]),
      }),
    )
    .min(2)
    .max(5),
});

/** 撮った日を「8月1日」の形に。読めなければ何も言わない。 */
function takenLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `撮った日: ${d.getMonth() + 1}月${d.getDate()}日`;
}

const ScaffoldInput = z.object({ sticker_id: z.string().uuid() });

export const getSpeakingScaffold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScaffoldInput.parse(input))
  .handler(async ({ context, data }): Promise<SpeakingScaffold> => {
    const { supabase, userId } = context;
    // `speaking_scaffold` は 2026-08-20 に足した列。**無い環境でも読める形**を
    // 残す(この app では新しい列を足すたびにこの形にしている)。
    const cols = (withScaffold: boolean) =>
      `id, caption, location_name, taken_at, created_at, object_image_url, cutout_image_url, branch_plan, word_id${
        withScaffold ? ", speaking_scaffold" : ""
      }, words(headword, meaning_ja, extras)`;
    let res = await supabase
      .from("stickers")
      .select(cols(true))
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    // **列が無いときは `data: null` ではなくエラーが返る。**
    // 「読めなかった」を「カードが無い」と取り違えると、
    // 列を足す前の環境で復習が丸ごと開かなくなる。
    let hasScaffoldColumn = true;
    if (res.error && /speaking_scaffold/.test(res.error.message)) {
      hasScaffoldColumn = false;
      res = (await supabase
        .from("stickers")
        .select(cols(false))
        .eq("id", data.sticker_id)
        .eq("user_id", userId)
        .maybeSingle()) as unknown as typeof res;
    }
    const st = res.data;
    const row = st as unknown as {
      caption: string | null;
      location_name: string | null;
      taken_at: string | null;
      created_at: string | null;
      object_image_url: string | null;
      cutout_image_url: string | null;
      branch_plan?: unknown;
      word_id: string;
      speaking_scaffold?: unknown;
      words: {
        headword: string;
        meaning_ja: string;
        extras?: Record<string, unknown> | null;
      } | null;
    } | null;
    if (!row?.words) throw new Error("カードが見つかりません");
    const w = row.words;
    const captionSeed = row.caption?.trim() || null;

    // ## 控えは**語ではなく、その1枚**に置く
    //
    // 前は `words.extras` に語単位で置いていた。`words` は利用者どうしで
    // 共有される表なので、そこへ「その人が撮ったときの一言」から作った質問を
    // 書き込むと、**同じ語を持つ別の利用者にその人の思い出が出る**。
    // 個人の記憶を混ぜてよい場所ではない(だから `stickers` に列を足した)。
    //
    // 鍵は 表示言語 × 母語 × **一言の指紋**。
    // 表示言語: 英語設定なら英語の足場を出す。
    // 母語: grammar のヒントが母語の弱点に合わせて変わる。
    // 一言: 書き直したら質問も作り直す — 古い一言から作った問いが残ると、
    //       本人にとって身に覚えのないことを聞かれる。
    const lang = await getExplanationLanguage(userId);
    const l1Code = await getLearnerL1Code(userId);
    const cacheKey = scaffoldCacheKey({ lang, l1: l1Code, caption: captionSeed });
    const cachedParsed = readScaffoldBox(row.speaking_scaffold, cacheKey, (v) =>
      ScaffoldSchema.parse(v),
    );
    if (cachedParsed) {
      return { ...cachedParsed, caption_seed: captionSeed };
    }

    const ai = await getAiFor("review");
    const levelRule = await levelInstruction(userId);
    const langRule = await explanationLanguageRule(userId);
    // 足場の "grammar" ヒントは、その母語話者が実際に崩す所を突くほど効く。
    // 英語話者には「時間・場所は動詞の前」、日本語話者には「了は過去形ではない」。
    const l1Order = await l1Rule(userId, "wordorder");
    const plan =
      parseBranchPlan(row.branch_plan) ??
      buildBranchPlan(w.extras as Parameters<typeof buildBranchPlan>[0]);
    const pattern = resolveBranches(plan, 1).justUnlocked;

    // ## その人の思い出をプロンプトに渡す
    //
    // ここが本題(要望 2026-08-18:「質問はユーザーの内面の気持ち、思い出、
    // 感情、個人的な情報を引き出すようにAIが考える。そのうえで自分の撮った
    // 時の感想、一言をもとに型やフレーズ、語法のヒントを表示」)。
    //
    // **前は一言も場所も日付も渡していなかった。** それでいて
    // 「写真の状況に沿った質問」と書いてあったので、ずっと空振りしていた。
    const memory = [
      captionSeed ? `撮ったときの一言:「${captionSeed}」` : null,
      row.location_name ? `撮った場所: ${row.location_name}` : null,
      takenLabel(row.taken_at ?? row.created_at),
      row.cutout_image_url || row.object_image_url ? "自分で撮った写真がある" : null,
    ]
      .filter(Boolean)
      .join(" / ");

    const scaffold = await generateStructured({
      model: ai.gateway(ai.modelFast),
      schema: ScaffoldSchema,
      prompt: `あなたは台湾華語(zh-TW)のMTC(國語教學中心)方式の先生です。${langRule}学習者に「${w.headword}(${w.meaning_ja})」を実際に使わせたい。${levelRule}
${pattern ? `今日の型:「${pattern.zh}」${pattern.ja ? `(${pattern.ja})` : ""}\n` : ""}
${memory ? `この学習者がこの言葉を拾ったときの記録 — ${memory}\n` : ""}
次を厳密なJSONで返してください:
- question_zh: 「${w.headword}」を使って答えたくなる自然な質問1つ(繁体字、レベル以下の語彙)。
${
  captionSeed
    ? `  **上の「一言」に書かれた気持ち・出来事を受けて聞く。** 学習者が自分で書いたことなので、
  そこから広げると答えが自分の中に既にある状態になる。
  例:「美味しかった」→ また食べたいか / 誰と行きたいか。「疲れた」→ どんなときにそう感じるか。
  一言をそのまま繰り返さない。**その先を聞く。**`
    : `  一言が書かれていないので、**その物を見たときの気持ち・思い出・したいこと**を
  引き出す質問にする(例: いつ使うか / 誰を思い出すか / 次はどうしたいか)。
  「これは何ですか」のような、見れば分かることは聞かない。`
}
  場所や日付が分かっているなら、それを手がかりにしてよい(「〜で見たとき」)。
- question_ja: その質問の訳(解説言語で)
- parts: 答えを組み立てる**ヒント**を2〜3個だけ。各パーツは {zh, ja, kind, chunks}。
  **重要: 答えの文をそのまま分解して渡してはいけない。** 並べるだけで答えが完成する組み合わせは禁止。
  完成文(「。」で終わる文)や、質問への答えそのものになるパーツは入れない — 学習者に考える余地を残す。
  - kind は次のどれか:
    "chunk" =「${w.headword}」とよく一緒に使う動詞・量詞のコロケーション(例「喝一杯◯◯」)
    "phrase" = スロット付きの型・言い回し(例「我要用◯◯…」)
    "grammar" = 文法・語法のポイント(例「用+道具+動詞」)。
      **この学習者の母語で実際に崩れる所**を優先して選ぶ:
${l1Order}
  - zh は繁体字。ja はその訳・使いどころを1行で(解説言語で)。
  - chunks は zh を意味のかたまりに分けた配列 [{text, pos}]。pos は台湾の詞類表の
    役割記号: S(主語) V(動詞) O(目的語) N(名詞) M(量詞・修飾) Adv(副詞)
    Conj/Prep(接続・介詞) Ptc(助詞) Det(限定詞)。◯や…のスロットは pos を "" にする。
    chunks の text を順に繋ぐと zh に一致すること。`,
    });

    // 控えは**その1枚**へ。列がまだ無い環境では保存を諦めるだけで、
    // 足場そのものは返す(毎回作り直しになるが、間違った物は出ない)。
    if (hasScaffoldColumn) {
      const { error } = await supabase
        .from("stickers")
        // 型定義は生成物で、`speaking_scaffold` はそれより新しい列。
        // `shelf_key` のときと同じで、緩いクライアントとして扱う。
        .update({ speaking_scaffold: { key: cacheKey, scaffold } } as never)
        .eq("id", data.sticker_id)
        .eq("user_id", userId);
      if (error) console.warn("scaffold cache write failed", error.message);
    }
    await logUsage(supabase, userId, "speaking_feedback");

    return { ...scaffold, caption_seed: captionSeed };
  });
