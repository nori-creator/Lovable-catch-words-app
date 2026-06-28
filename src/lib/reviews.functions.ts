import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL = "google/gemini-3-flash-preview";

export type DueReviewCard = {
  review_id: string;
  sticker_id: string;
  headword: string;
  reading_zhuyin: string | null;
  pinyin: string | null;
  meaning_ja: string;
  example_sentence: string | null;
  example_translation: string | null;
  category_key: string | null;
  cutout_url: string | null;
  blur_seen: boolean;
  ease: number;
  interval_days: number;
  repetitions: number;
  choices: string[]; // 4 meaning_ja options (shuffled); correct = meaning_ja
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Maker/Checker loop: produce 3 plausible-but-wrong meanings
async function generateDistractors(
  gateway: ReturnType<typeof import("./ai-gateway.server").createLovableAiGatewayProvider>,
  headword: string,
  correctMeaning: string,
  categoryKey: string | null,
): Promise<{ distractors: string[]; iterations: number; accepted: number }> {
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

  let accepted: string[] = [];
  let iter = 0;
  const MAX = 2;

  while (accepted.length < 3 && iter < MAX) {
    iter++;
    // Maker
    const makerPrompt = `台湾華語の単語「${headword}」（意味: ${correctMeaning}${categoryKey ? `、カテゴリ: ${categoryKey}` : ""}）の4択クイズ用に、もっともらしいが間違っている日本語の意味を3つ作ってください。
- 正解「${correctMeaning}」と同義語/言い換えは禁止
- 文字数は正解と同程度
- 学習者が一瞬迷う難易度（同カテゴリの別物がベスト）
- すでに却下された候補: ${accepted.length ? accepted.join(", ") : "なし"}`;

    const maker = await generateText({
      model: gateway(MODEL),
      prompt: makerPrompt,
      experimental_output: Output.object({ schema: MakerSchema }) as never,
    });
    const makerOut = (maker as unknown as { experimental_output?: z.infer<typeof MakerSchema> }).experimental_output;
    const candidates = makerOut?.distractors ?? [];

    // Checker
    const checkerPrompt = `以下は単語「${headword}」（正解の意味: ${correctMeaning}）の4択クイズの不正解候補です。
各候補について、(a) 正解と意味が被っていない (b) 学習者を惑わすが正解とは明確に違う、を満たすかtrue/falseで判定してください。
候補:
${candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

    const checker = await generateText({
      model: gateway(MODEL),
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

  // Fallback if AI loop failed
  while (accepted.length < 3) {
    accepted.push(["別の物体", "場所の名前", "人物の役職"][accepted.length] ?? "その他");
  }
  return { distractors: accepted.slice(0, 3), iterations: iter, accepted: accepted.length };
}

export const getDueReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, sticker_id, ease, interval_days, repetitions, blur_seen, stickers(cutout_image_url, words(headword, reading_zhuyin, pinyin, meaning_ja, example_sentence, example_translation, category_key))",
      )
      .eq("user_id", userId)
      .lte("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const cards: DueReviewCard[] = [];
    for (const row of data ?? []) {
      const sticker = (row as unknown as {
        stickers: {
          cutout_image_url: string | null;
          words: {
            headword: string;
            reading_zhuyin: string | null;
            pinyin: string | null;
            meaning_ja: string;
            example_sentence: string | null;
            example_translation: string | null;
            category_key: string | null;
          } | null;
        } | null;
      }).stickers;
      if (!sticker?.words) continue;
      const w = sticker.words;

      let cutout_url: string | null = null;
      if (sticker.cutout_image_url) {
        const { data: s } = await supabase.storage
          .from("stickers")
          .createSignedUrl(sticker.cutout_image_url, 60 * 60 * 6);
        cutout_url = s?.signedUrl ?? null;
      }

      const { distractors, iterations, accepted } = await generateDistractors(
        gateway,
        w.headword,
        w.meaning_ja,
        w.category_key,
      );

      // Log Maker/Checker loop run
      await supabase.from("ai_runs").insert({
        user_id: userId,
        loop: "review_distractor",
        iterations,
        accepted,
        meta: { headword: w.headword },
      });

      cards.push({
        review_id: row.id,
        sticker_id: row.sticker_id,
        headword: w.headword,
        reading_zhuyin: w.reading_zhuyin,
        pinyin: w.pinyin,
        meaning_ja: w.meaning_ja,
        example_sentence: w.example_sentence,
        example_translation: w.example_translation,
        category_key: w.category_key,
        cutout_url,
        blur_seen: row.blur_seen,
        ease: row.ease,
        interval_days: row.interval_days,
        repetitions: row.repetitions,
        choices: shuffle([w.meaning_ja, ...distractors]),
      });
    }
    return cards;
  });

const GradeInput = z.object({
  review_id: z.string().uuid(),
  correct: z.boolean(),
  blur_seen: z.boolean().default(false),
  response_ms: z.number().int().nonnegative().default(0),
});

// SM-2 simplified
function nextSrs(prev: { ease: number; interval_days: number; repetitions: number }, score: number) {
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

    // Score: correct=5 base; blur penalty -1; slow (>8s) -1; wrong=1
    let score = 1;
    if (data.correct) {
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

