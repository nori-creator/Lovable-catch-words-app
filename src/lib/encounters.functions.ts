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
  /**
   * 思い出せたか。**再会そのものは当てものではない**ので、写真を撮っただけの
   * 再会では null が来る(記録は残すが、復習の間隔は動かさない)。
   */
  recalled: z.boolean().nullable(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  location_name: z.string().nullable().optional(),
  /** 今回撮った写真。ここに来るまで**捨てられていた**。 */
  image_path: z.string().nullable().optional(),
  cutout_path: z.string().nullable().optional(),
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
    // 写真の列がまだ無い環境でも記録は残す — 列名を落として入れ直す。
    // 型定義は生成物で、`image_path` / `cutout_path` はそれより新しい列。
    // `shelf_key` のときと同じで、緩いクライアントとして扱う。
    const row: Record<string, unknown> = {
      user_id: userId,
      sticker_id: data.sticker_id,
      recalled: data.recalled,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      location_name: data.location_name ?? null,
      image_path: data.image_path ?? null,
      cutout_path: data.cutout_path ?? null,
    };
    const ins = await supabase.from("encounters").insert(row as never);
    if (ins.error && /image_path|cutout_path/.test(ins.error.message)) {
      const { image_path: _i, cutout_path: _c, ...legacy } = row;
      await supabase.from("encounters").insert(legacy as never);
    }
    await supabase
      .from("stickers")
      .update({ encounter_count: newCount })
      .eq("id", data.sticker_id)
      .eq("user_id", userId);

    // 復習の間隔を動かすのは、**当てものに答えたときだけ**。
    //
    // 以前は再会そのものを「満点の復習」として数えていた。しかし再会は
    // 当てものではなく写真を撮る操作で、しかも**忘れたからもう一度撮る**
    // ことの方が多い(オーナー指摘)。それを満点として数えると間隔が伸び、
    // 一番出すべき語が出なくなる。答えが無い(null)なら記録だけ残す。
    if (data.recalled === null) {
      return { encounter_count: newCount, next_due_at: null, interval_days: null };
    }

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

/**
 * その単語をこれまでに撮った写真を、**古い順に**返す。
 *
 * 最初の1枚は `stickers` 側にあり、2枚目以降は再会1回につき1行
 * (`encounters`)。詳細の画面はこの2つを混ぜて時系列に並べる。
 * 署名付きURLは有効期限があるので、その場で作って返す。
 */
export const listStickerPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sticker_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: sticker } = await supabase
      .from("stickers")
      .select("id, object_image_url, cutout_image_url, taken_at, location_name")
      .eq("id", data.sticker_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!sticker) return { photos: [] as StickerPhoto[] };

    // 写真の列がまだ無い環境では、この読みが丸ごと落ちる。
    // **最初の1枚は必ず返す** — 再会の写真が読めないことと、
    // 詳細に写真が1枚も出ないことは、見え方の重さが違う。
    let encounters: Array<{
      image_path: string | null;
      cutout_path: string | null;
      created_at: string;
      location_name: string | null;
    }> = [];
    {
      const { data: rows, error } = await supabase
        .from("encounters")
        .select("image_path, cutout_path, created_at, location_name")
        .eq("sticker_id", data.sticker_id)
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (!error && rows) encounters = rows as unknown as typeof encounters;
    }

    const wanted: Array<{ path: string; taken_at: string; place: string | null; first: boolean }> =
      [];
    const firstPath = sticker.cutout_image_url || sticker.object_image_url;
    if (firstPath) {
      wanted.push({
        path: firstPath,
        taken_at: sticker.taken_at,
        place: sticker.location_name,
        first: true,
      });
    }
    for (const e of encounters) {
      const p = e.cutout_path || e.image_path;
      if (p) wanted.push({ path: p, taken_at: e.created_at, place: e.location_name, first: false });
    }
    if (wanted.length === 0) return { photos: [] as StickerPhoto[] };

    const { data: signed } = await supabase.storage.from("stickers").createSignedUrls(
      wanted.map((w) => w.path),
      60 * 60 * 6,
    );
    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
    }

    const photos: StickerPhoto[] = [];
    for (const w of wanted) {
      const url = urlByPath.get(w.path);
      if (url) photos.push({ url, taken_at: w.taken_at, place: w.place, first: w.first });
    }
    return { photos };
  });

export type StickerPhoto = {
  url: string;
  taken_at: string;
  place: string | null;
  /** 最初にこの単語を捕まえたときの1枚。 */
  first: boolean;
};
