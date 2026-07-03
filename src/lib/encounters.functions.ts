import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { nextSrs } from "./reviews.functions";

/**
 * Re-encounter loop: catching a word you already own is not a duplicate —
 * it's the single best review moment there is (real-world recall with full
 * context). checkOwnedWord detects it, recordEncounter turns it into an SRS
 * result plus an encounter log.
 */

export type OwnedWord = {
  sticker_id: string;
  word_id: string;
  headword: string;
  meaning_ja: string;
  reading_zhuyin: string | null;
  pinyin: string | null;
  cutout_url: string | null;
  encounter_count: number;
  taken_at: string;
  location_name: string | null;
};

const CheckInput = z.object({
  headword: z.string().min(1),
  language: z.string().default("zh-TW"),
});

export const checkOwnedWord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckInput.parse(input))
  .handler(async ({ context, data }): Promise<{ owned: OwnedWord | null }> => {
    const { supabase, userId } = context;

    const { data: word } = await supabase
      .from("words")
      .select("id, headword, meaning_ja, reading_zhuyin, pinyin")
      .eq("language", data.language)
      .eq("headword", data.headword.trim())
      .maybeSingle();
    if (!word) return { owned: null };

    const { data: sticker } = await supabase
      .from("stickers")
      .select("id, cutout_image_url, taken_at, location_name")
      .eq("user_id", userId)
      .eq("word_id", word.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!sticker) return { owned: null };

    let cutout_url: string | null = null;
    if (sticker.cutout_image_url) {
      const { data: s } = await supabase.storage
        .from("stickers")
        .createSignedUrl(sticker.cutout_image_url, 60 * 60);
      cutout_url = s?.signedUrl ?? null;
    }

    // encounter_count may not exist before the migration runs.
    let encounterCount = 0;
    {
      const { data: c, error } = await supabase
        .from("stickers")
        .select("encounter_count")
        .eq("id", sticker.id)
        .maybeSingle();
      if (!error && c) encounterCount = c.encounter_count ?? 0;
    }

    return {
      owned: {
        sticker_id: sticker.id,
        word_id: word.id,
        headword: word.headword,
        meaning_ja: word.meaning_ja,
        reading_zhuyin: word.reading_zhuyin,
        pinyin: word.pinyin,
        cutout_url,
        encounter_count: encounterCount,
        taken_at: sticker.taken_at,
        location_name: sticker.location_name,
      },
    };
  });

const RecordInput = z.object({
  sticker_id: z.string().uuid(),
  recalled: z.boolean(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  location_name: z.string().nullable().optional(),
});

export const recordEncounter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: sticker, error: stErr } = await supabase
      .from("stickers")
      .select("id, encounter_count")
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (stErr || !sticker) throw new Error("ステッカーが見つかりません");

    // Encounter log + counter are best-effort: the tables/columns may not
    // exist until the migration is applied. The SRS update below still runs.
    const newCount = (sticker.encounter_count ?? 0) + 1;
    await supabase.from("encounters").insert({
      user_id: userId,
      sticker_id: data.sticker_id,
      recalled: data.recalled,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      location_name: data.location_name ?? null,
    });
    await supabase
      .from("stickers")
      .update({ encounter_count: newCount })
      .eq("id", data.sticker_id)
      .eq("user_id", userId);

    // A real-world encounter counts as a review: recalled = full marks, not
    // recalled = lapse. Same SM-2 update as gradeReview.
    const { data: review } = await supabase
      .from("reviews")
      .select("id, ease, interval_days, repetitions, blur_seen")
      .eq("user_id", userId)
      .eq("sticker_id", data.sticker_id)
      .maybeSingle();

    let nextDueAt: string | null = null;
    let intervalDays: number | null = null;
    if (review) {
      const score = data.recalled ? 5 : 1;
      const next = nextSrs(
        { ease: review.ease, interval_days: review.interval_days, repetitions: review.repetitions },
        score,
      );
      nextDueAt = new Date(Date.now() + next.interval_days * 86400 * 1000).toISOString();
      intervalDays = next.interval_days;
      await supabase
        .from("reviews")
        .update({
          ease: next.ease,
          interval_days: next.interval_days,
          repetitions: next.repetitions,
          last_score: score,
          last_reviewed_at: new Date().toISOString(),
          due_at: nextDueAt,
        })
        .eq("id", review.id)
        .eq("user_id", userId);
      await supabase.from("review_history").insert({
        user_id: userId,
        review_id: review.id,
        sticker_id: data.sticker_id,
        score,
        correct: data.recalled,
        blur_seen: false,
        response_ms: 0,
        interval_days_after: next.interval_days,
        ease_after: next.ease,
        repetitions_after: next.repetitions,
      });
    }

    return { encounter_count: newCount, next_due_at: nextDueAt, interval_days: intervalDays };
  });
