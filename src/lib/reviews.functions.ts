import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertWithinDailyCap, getAi, logUsage } from "./ai-provider.server";
import { ttsObjectPath, TTS_VOICE_DEFAULT } from "./tts-cache";
import { buildBranchPlan, parseBranchPlan, resolveBranches, type Branch } from "./wordtree";

/**
 * Review card modes escalate with SRS maturity (repetitions):
 * 0-1 recognition (see photo+word, pick meaning)
 * 2-3 listening   (audio only, pick meaning; photo/word revealed after answer)
 * 4-5 reverse     (see meaning+photo, pick the headword)
 * 6+  production  (see photo+meaning, say the word; client falls back to
 *                  reverse when speech recognition is unavailable)
 */
export type ReviewMode = "recognition" | "listening" | "reverse" | "production";

export type DueReviewCard = {
  review_id: string;
  sticker_id: string;
  word_id: string;
  headword: string;
  reading_zhuyin: string | null;
  pinyin: string | null;
  meaning_ja: string;
  example_sentence: string | null;
  example_translation: string | null;
  category_key: string | null;
  entry_type: string;
  cutout_url: string | null;
  /** Ghost cards (§5.3): temporary stand-in image so review isn't a blank. */
  placeholder_url: string | null;
  audio_url: string | null; // cached TTS if it exists; client falls back to speechSynthesis
  caption: string | null;
  location_name: string | null;
  taken_at: string | null;
  review_count: number; // completed reviews so far (word-tree unlock count)
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
  mode: ReviewMode;
  choices: string[]; // 4 meaning_ja options (shuffled); correct = meaning_ja
  headword_choices: string[]; // 4 headword options for reverse mode
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function modeFor(repetitions: number): ReviewMode {
  if (repetitions <= 1) return "recognition";
  if (repetitions <= 3) return "listening";
  if (repetitions <= 5) return "reverse";
  return "production";
}

const STATIC_MEANING_FALLBACK = ["別の物体", "場所の名前", "人物の役職"];
const STATIC_HEADWORD_FALLBACK = ["蘋果", "公車", "雨傘"];

/**
 * Pick 3 distractors without any AI call. Priority:
 * 1. meanings/headwords of the user's OWN words in the same category
 *    (the confusions that actually happen in this learner's head),
 * 2. pre-generated AI distractors cached in review_choices,
 * 3. the user's other words, 4. static fallback.
 */
function pickThree(correct: string, ...pools: string[][]): string[] {
  const out: string[] = [];
  for (const pool of pools) {
    for (const cand of pool) {
      if (!cand || cand === correct || out.includes(cand)) continue;
      out.push(cand);
      if (out.length >= 3) return out;
    }
  }
  return out;
}

export const getDueReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DueReviewCard[]> => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const dueSelect = (withGhost: boolean) =>
      `id, sticker_id, ease, interval_days, repetitions, blur_seen, stickers(cutout_image_url, caption, location_name, taken_at${withGhost ? ", placeholder_image_url, branch_plan" : ""}, words(id, headword, reading_zhuyin, pinyin, meaning_ja, example_sentence, example_translation, category_key, entry_type))`;
    let { data, error } = await supabase
      .from("reviews")
      .select(dueSelect(true))
      .eq("user_id", userId)
      .lte("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(10);
    if (error && /placeholder_image_url|entry_type|branch_plan/.test(error.message)) {
      ({ data, error } = (await supabase
        .from("reviews")
        .select(
          "id, sticker_id, ease, interval_days, repetitions, blur_seen, stickers(cutout_image_url, caption, location_name, taken_at, words(id, headword, reading_zhuyin, pinyin, meaning_ja, example_sentence, example_translation, category_key))",
        )
        .eq("user_id", userId)
        .lte("due_at", nowIso)
        .order("due_at", { ascending: true })
        .limit(10)) as unknown as { data: typeof data; error: typeof error });
    }
    if (error) throw new Error(error.message);

    type DueRow = {
      id: string;
      sticker_id: string;
      ease: number;
      interval_days: number;
      repetitions: number;
      blur_seen: boolean;
      stickers: {
        cutout_image_url: string | null;
        caption: string | null;
        location_name: string | null;
        taken_at: string | null;
        placeholder_image_url?: string | null;
        branch_plan?: unknown;
        words: {
          id: string;
          headword: string;
          reading_zhuyin: string | null;
          pinyin: string | null;
          meaning_ja: string;
          example_sentence: string | null;
          example_translation: string | null;
          category_key: string | null;
          entry_type: string | null;
        } | null;
      } | null;
    };
    const rows = ((data ?? []) as unknown as DueRow[]).filter((r) => r.stickers?.words);
    if (rows.length === 0) return [];

    // Word-tree unlock counts: one review_history row per completed review.
    const stickerIds = rows.map((r) => r.sticker_id);
    const reviewCounts = new Map<string, number>();
    {
      const { data: histRows } = await supabase
        .from("review_history")
        .select("sticker_id")
        .eq("user_id", userId)
        .in("sticker_id", stickerIds);
      for (const h of histRows ?? []) {
        reviewCounts.set(h.sticker_id, (reviewCounts.get(h.sticker_id) ?? 0) + 1);
      }
    }

    // The user's own deck is the distractor pool — zero AI calls at review time.
    const { data: deckRows } = await supabase
      .from("stickers")
      .select("words(id, headword, meaning_ja, category_key)")
      .eq("user_id", userId)
      .limit(500);
    type DeckWord = { id: string; headword: string; meaning_ja: string; category_key: string | null };
    const deck: DeckWord[] = [];
    const seen = new Set<string>();
    for (const r of (deckRows ?? []) as unknown as Array<{ words: DeckWord | null }>) {
      if (r.words && !seen.has(r.words.id)) {
        seen.add(r.words.id);
        deck.push(r.words);
      }
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
    const cutoutPaths = rows
      .flatMap((r) => [r.stickers!.cutout_image_url, r.stickers!.placeholder_image_url ?? null])
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
      rows.map((r) => ttsObjectPath("zh-TW", TTS_VOICE_DEFAULT, r.stickers!.words!.headword)),
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
      const sameCat = shuffle(deck.filter((d) => d.id !== w.id && d.category_key === w.category_key));
      const otherCat = shuffle(deck.filter((d) => d.id !== w.id && d.category_key !== w.category_key));

      const meaningDistractors = pickThree(
        w.meaning_ja,
        sameCat.map((d) => d.meaning_ja),
        cached.get(w.id) ?? [],
        otherCat.map((d) => d.meaning_ja),
        STATIC_MEANING_FALLBACK,
      );
      const headwordDistractors = pickThree(
        w.headword,
        sameCat.map((d) => d.headword),
        otherCat.map((d) => d.headword),
        STATIC_HEADWORD_FALLBACK,
      );

      const cutoutPath = row.stickers!.cutout_image_url;
      // The branch this review will unlock = today's designated pattern.
      // Mirrors getSpeakingFeedback's selection so task and feedback agree.
      const reviewCount = reviewCounts.get(row.sticker_id) ?? 0;
      const plan = parseBranchPlan(row.stickers!.branch_plan) ?? [];
      const promptPattern: Branch | null =
        resolveBranches(plan, Math.max(1, reviewCount + 1)).justUnlocked;
      return {
        review_id: row.id,
        sticker_id: row.sticker_id,
        word_id: w.id,
        headword: w.headword,
        reading_zhuyin: w.reading_zhuyin,
        pinyin: w.pinyin,
        meaning_ja: w.meaning_ja,
        example_sentence: w.example_sentence,
        example_translation: w.example_translation,
        category_key: w.category_key,
        entry_type: w.entry_type ?? "word",
        cutout_url: cutoutPath ? (cutoutUrlByPath.get(cutoutPath) ?? null) : null,
        placeholder_url: row.stickers!.placeholder_image_url
          ? (cutoutUrlByPath.get(row.stickers!.placeholder_image_url) ?? null)
          : null,
        audio_url: audioUrlByPath.get(audioPaths[i]) ?? null,
        caption: row.stickers!.caption,
        location_name: row.stickers!.location_name,
        taken_at: row.stickers!.taken_at,
        review_count: reviewCount,
        prompt_pattern: promptPattern,
        blur_seen: row.blur_seen,
        ease: row.ease,
        interval_days: row.interval_days,
        repetitions: row.repetitions,
        mode: modeFor(row.repetitions),
        choices: shuffle([w.meaning_ja, ...meaningDistractors]),
        headword_choices: shuffle([w.headword, ...headwordDistractors]),
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
  const ai = getAi();
  const accepted: string[] = [];
  let iter = 0;
  const MAX = 2;

  while (accepted.length < 3 && iter < MAX) {
    iter++;
    const makerPrompt = `台湾華語の単語「${headword}」（意味: ${correctMeaning}${categoryKey ? `、カテゴリ: ${categoryKey}` : ""}）の4択クイズ用に、もっともらしいが間違っている日本語の意味を3つ作ってください。
- 正解「${correctMeaning}」と同義語/言い換えは禁止
- 文字数は正解と同程度
- 学習者が一瞬迷う難易度（同カテゴリの別物がベスト）
- すでに却下された候補: ${accepted.length ? accepted.join(", ") : "なし"}`;

    const maker = await generateText({
      model: ai.gateway(ai.modelFast),
      prompt: makerPrompt,
      experimental_output: Output.object({ schema: MakerSchema }) as never,
    });
    const makerOut = (maker as unknown as { experimental_output?: z.infer<typeof MakerSchema> }).experimental_output;
    const candidates = makerOut?.distractors ?? [];

    const checkerPrompt = `以下は単語「${headword}」（正解の意味: ${correctMeaning}）の4択クイズの不正解候補です。
各候補について、(a) 正解と意味が被っていない (b) 学習者を惑わすが正解とは明確に違う、を満たすかtrue/falseで判定してください。
候補:
${candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

    const checker = await generateText({
      model: ai.gateway(ai.modelFast),
      prompt: checkerPrompt,
      experimental_output: Output.object({ schema: CheckerSchema }) as never,
    });
    const checkOut = (checker as unknown as { experimental_output?: z.infer<typeof CheckerSchema> }).experimental_output;
    const verdicts = checkOut?.verdicts ?? [];

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
  await supabaseAdmin.from("review_choices").upsert({ word_id: wordId, distractors: accepted.slice(0, 3) });
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


// SM-2 simplified
export function nextSrs(prev: { ease: number; interval_days: number; repetitions: number }, score: number) {
  let { ease, interval_days, repetitions } = prev;
  if (score < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval_days = 1;
    else if (repetitions === 2) interval_days = 3;
    else interval_days = Math.round(interval_days * ease);
    ease = Math.max(1.3, ease + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)));
  }
  return { ease, interval_days, repetitions };
}

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
  current: { ease: number; interval_days: number; last_reviewed_at: string | null; due_at: string | null } | null;
};

export const getStickerMemoryHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sticker_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<StickerMemoryHistory> => {
    const { supabase, userId } = context;
    const [{ data: hist }, { data: rev }] = await Promise.all([
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
    };
  });

export type OverallMemoryStats = {
  avg_retention: number; // 0-100
  total_cards: number;
  due_now: number;
  series: Array<{ day_offset: number; avg_retention: number }>; // -14..+14
};

export const getOverallMemoryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OverallMemoryStats> => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("reviews")
      .select("ease, interval_days, last_reviewed_at, due_at")
      .eq("user_id", userId);
    const cards = rows ?? [];
    const now = Date.now();
    const dueNow = cards.filter((r) => r.due_at && new Date(r.due_at).getTime() <= now).length;

    function retentionAt(card: { ease: number; interval_days: number; last_reviewed_at: string | null }, atMs: number): number {
      if (!card.last_reviewed_at) return 100;
      const dt = (atMs - new Date(card.last_reviewed_at).getTime()) / 86400_000;
      if (dt <= 0) return 100;
      const stability = Math.max(0.5, card.interval_days * Math.max(1, card.ease));
      return Math.max(0, Math.min(100, 100 * Math.exp(-dt / stability)));
    }

    const series: Array<{ day_offset: number; avg_retention: number }> = [];
    for (let d = -14; d <= 14; d++) {
      const at = now + d * 86400_000;
      const vals = cards.map((c) => retentionAt(c, at));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      series.push({ day_offset: d, avg_retention: Math.round(avg) });
    }
    const avgRet = cards.length
      ? Math.round(cards.map((c) => retentionAt(c, now)).reduce((a, b) => a + b, 0) / cards.length)
      : 0;

    return { avg_retention: avgRet, total_cards: cards.length, due_now: dueNow, series };
  });

// --- Speaking-output review feedback (§6) -----------------------------------

const FeedbackInput = z.object({
  sticker_id: z.string().uuid(),
  transcript: z.string().min(1).max(500),
  hint_used: z.boolean().default(false),
});

const PosEnum = z.enum(["S", "V", "O", "M", "C"]);
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

    const ai = getAi();
    const prompt = `あなたは台湾華語(zh-TW)のネイティブ講師です。学習者が自分の写真を見て「${w.headword}(${w.meaning_ja})」を使って一文話しました。以下を厳密なJSONで返してください。

学習者の発話: 「${data.transcript}」
${data.hint_used ? "※学習者は単語を思い出せずヒントを見ました。\n" : ""}${row.caption ? `撮影時のメモ: 「${row.caption}」\n` : ""}${row.location_name ? `撮影場所: ${row.location_name}\n` : ""}${isPhrase ? "これはフレーズカードです。返答として自然か、トーンも見てください。\n" : ""}${branch ? `今回教える「型」: 「${branch.zh}」${branch.ja ? `(${branch.ja})` : ""} — chunk と chunk_note は必ずこの表現を使って組み立ててください。\n` : ""}
要件:
- corrected: 学習者の意図を尊重した自然な台湾華語の添削文(繁体字)。ほぼ正しければそのまま。
- natural_score: 1〜5。5=ネイティブそのまま、3=通じるが不自然、1=通じない/対象語を使っていない。
- used_target: 「${w.headword}」を(活用形含め)使っているか。
- correction_note: 何をどう直したか、なぜ不自然だったかを日本語で1〜2文。
- chunk: ${branch ? `「${branch.zh}」を含む自然な一文` : "corrected"}を語順パーツに分解。posはS(主語)/V(動詞)/O(目的語)/M(修飾)/C(接続・助詞)のいずれか。3〜8個程度。
- chunk_note: この型の使いどころを日本語で1文。
- native_note: この単語をネイティブが実際に使う時の気持ち・状況を日本語で1〜2文。
- model_answer: この写真の状況で「${w.headword}」を使ったお手本(自然な台湾華語1文、繁体字)。
- alt_answer: 別の言い方1つ(繁体字)。`;

    const { experimental_output } = await generateText({
      model: ai.gateway(ai.modelRich),
      prompt,
      experimental_output: Output.object({ schema: FeedbackSchema }) as never,
    }) as unknown as { experimental_output: z.infer<typeof FeedbackSchema> };

    // KPI (roadmap §3): speaking reviews feed the admin dashboard.
    await logUsage(supabase, userId, "speaking_feedback");
    await supabase.from("ai_runs").insert({
      user_id: userId,
      loop: "speaking_feedback",
      iterations: 1,
      accepted: 1,
      meta: { headword: w.headword, score: experimental_output.natural_score },
    });

    return {
      ...experimental_output,
      headword: w.headword,
      reading_zhuyin: w.reading_zhuyin,
      pinyin: w.pinyin,
      meaning_ja: w.meaning_ja,
      unlocked_branch: branch,
    };
  });
