import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type WordExtrasDTO = {
  collocations: string[];
  synonyms: string[];
  antonyms: string[];
  etymology: string;
  radicals: string;
  mnemonic: string;
  trivia: string;
  common_situation: string;
  usage_note: string;
  examples_extra: { zh: string; ja: string }[];
};

export type StickerWithWord = {
  id: string;
  word_id: string;
  caption: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  taken_at: string;
  created_at: string;
  object_url: string | null;
  cutout_url: string | null;
  selfie_url: string | null;
  word: {
    headword: string;
    reading_zhuyin: string | null;
    pinyin: string | null;
    meaning_ja: string;
    part_of_speech: string | null;
    example_sentence: string | null;
    example_translation: string | null;
    level: string | null;
    category_key: string | null;
    silhouette_emoji: string | null;
    extras: WordExtrasDTO | null;
  };
};

function normalizeExtras(raw: unknown): WordExtrasDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const arrStr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const str = (v: unknown): string => typeof v === "string" ? v : "";
  const exExtra = Array.isArray(r.examples_extra)
    ? r.examples_extra
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x) => ({ zh: str(x.zh), ja: str(x.ja) }))
        .filter((x) => x.zh || x.ja)
    : [];
  return {
    collocations: arrStr(r.collocations),
    synonyms: arrStr(r.synonyms),
    antonyms: arrStr(r.antonyms),
    etymology: str(r.etymology),
    radicals: str(r.radicals),
    mnemonic: str(r.mnemonic),
    trivia: str(r.trivia),
    common_situation: str(r.common_situation),
    usage_note: str(r.usage_note),
    examples_extra: exExtra,
  };
}

async function signUrls(
  supabase: { storage: { from: (b: string) => { createSignedUrl: (p: string, e: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  paths: (string | null | undefined)[]
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  for (const p of paths) {
    if (!p) {
      results.push(null);
      continue;
    }
    const { data } = await supabase.storage.from("stickers").createSignedUrl(p, 60 * 60 * 6);
    results.push(data?.signedUrl ?? null);
  }
  return results;
}

export const listMyStickers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("stickers")
      .select(
        "id, word_id, caption, location_name, lat, lng, taken_at, created_at, object_image_url, cutout_image_url, selfie_image_url, words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, example_sentence, example_translation, level, category_key, silhouette_emoji, extras)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const result: StickerWithWord[] = [];
    for (const row of data ?? []) {
      const [object_url, cutout_url, selfie_url] = await signUrls(supabase, [
        row.object_image_url,
        row.cutout_image_url,
        row.selfie_image_url,
      ]);
      const wRaw = (row as unknown as { words: (Omit<StickerWithWord["word"], "extras"> & { extras?: unknown }) | null }).words;
      if (!wRaw) continue;
      result.push({
        id: row.id,
        word_id: row.word_id,
        caption: row.caption,
        location_name: row.location_name,
        lat: row.lat,
        lng: row.lng,
        taken_at: row.taken_at,
        created_at: row.created_at,
        object_url,
        cutout_url,
        selfie_url,
        word: { ...wRaw, extras: normalizeExtras(wRaw.extras) },
      });
    }
    return result;
  });

export const getSticker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Try to read as owner first (RLS-scoped)
    let { data: row, error } = await supabase
      .from("stickers")
      .select(
        "id, user_id, word_id, caption, location_name, lat, lng, taken_at, created_at, object_image_url, cutout_image_url, selfie_image_url, words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, example_sentence, example_translation, level, category_key, silhouette_emoji, extras)"
      )
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // If not the owner, fall back to admin read so authenticated viewers can
    // see other users' sticker detail from the public profile grid. Selfie
    // remains private to the owner.
    let isOwner = !!row;
    if (!row) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await supabaseAdmin
        .from("stickers")
        .select(
          "id, user_id, word_id, caption, location_name, lat, lng, taken_at, created_at, object_image_url, cutout_image_url, selfie_image_url, words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, example_sentence, example_translation, level, category_key, silhouette_emoji, extras)"
        )
        .eq("id", data.id)
        .maybeSingle();
      if (res.error) throw new Error(res.error.message);
      row = res.data as typeof row;
    }
    if (!row) return null;

    const [object_url, cutout_url, selfie_url] = await signUrls(supabase, [
      row.object_image_url,
      row.cutout_image_url,
      isOwner ? row.selfie_image_url : null,
    ]);
    const wRaw = (row as unknown as { words: (Omit<StickerWithWord["word"], "extras"> & { extras?: unknown }) | null }).words;
    if (!wRaw) return null;
    const res: StickerWithWord = {
      id: row.id,
      word_id: row.word_id,
      caption: row.caption,
      location_name: row.location_name,
      lat: row.lat,
      lng: row.lng,
      taken_at: row.taken_at,
      created_at: row.created_at,
      object_url,
      cutout_url,
      selfie_url,
      word: { ...wRaw, extras: normalizeExtras(wRaw.extras) },
    };
    return res;
  });


const SaveStickerInput = z.object({
  word: z.object({
    headword: z.string().min(1),
    reading_zhuyin: z.string().optional().default(""),
    pinyin: z.string().optional().default(""),
    meaning_ja: z.string().min(1),
    part_of_speech: z.string().optional().default("名詞"),
    level: z.string().optional().default("TOCFL-2"),
    category_key: z.string().min(1),
    example_sentence: z.string().optional().default(""),
    example_translation: z.string().optional().default(""),
    extras: z.object({
      collocations: z.array(z.string()).default([]),
      synonyms: z.array(z.string()).default([]),
      antonyms: z.array(z.string()).default([]),
      etymology: z.string().default(""),
      radicals: z.string().default(""),
      mnemonic: z.string().default(""),
      trivia: z.string().default(""),
      common_situation: z.string().default(""),
      usage_note: z.string().default(""),
      examples_extra: z.array(z.object({ zh: z.string(), ja: z.string() })).default([]),
    }).optional(),
  }),
  language: z.string().default("zh-TW"),
  object_path: z.string().nullable().optional(),
  cutout_path: z.string().nullable().optional(),
  selfie_path: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  location_name: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export const saveSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveStickerInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // upsert word: find by (language, headword), else insert as 'ai'
    const { data: existing } = await supabase
      .from("words")
      .select("id")
      .eq("language", data.language)
      .eq("headword", data.word.headword)
      .maybeSingle();

    let wordId = existing?.id;
    if (!wordId) {
      // Normalize category_key: if the AI proposed one that doesn't exist in the
      // categories table, fall back to 'other' so the FK doesn't reject the insert.
      let categoryKey = data.word.category_key;
      const { data: catRow } = await supabase
        .from("categories")
        .select("key")
        .eq("key", categoryKey)
        .maybeSingle();
      if (!catRow) categoryKey = "other";

      const { data: ins, error: insErr } = await supabase
        .from("words")
        .insert({
          language: data.language,
          headword: data.word.headword,
          reading_zhuyin: data.word.reading_zhuyin || null,
          pinyin: data.word.pinyin || null,
          meaning_ja: data.word.meaning_ja,
          part_of_speech: data.word.part_of_speech,
          level: data.word.level,
          category_key: categoryKey,
          example_sentence: data.word.example_sentence || null,
          example_translation: data.word.example_translation || null,
          extras: (data.word.extras ?? {}) as never,
          source: "ai",
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      wordId = ins.id;
    } else if (data.word.extras) {
      // Update extras for existing word if AI generated new ones
      await supabase
        .from("words")
        .update({ extras: data.word.extras as never })
        .eq("id", wordId);
    }


    const { data: sticker, error: stErr } = await supabase
      .from("stickers")
      .insert({
        user_id: userId,
        word_id: wordId,
        language: data.language,
        object_image_url: data.object_path ?? null,
        cutout_image_url: data.cutout_path ?? null,
        selfie_image_url: data.selfie_path ?? null,
        caption: data.caption ?? null,
        location_name: data.location_name ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
      })
      .select("id")
      .single();
    if (stErr) throw new Error(stErr.message);
    return { id: sticker.id, word_id: wordId };
  });

const UpdateExtrasInput = z.object({
  word_id: z.string().uuid(),
  extras: z.object({
    collocations: z.array(z.string()).default([]),
    synonyms: z.array(z.string()).default([]),
    antonyms: z.array(z.string()).default([]),
    etymology: z.string().default(""),
    radicals: z.string().default(""),
    mnemonic: z.string().default(""),
    trivia: z.string().default(""),
    common_situation: z.string().default(""),
    usage_note: z.string().default(""),
    examples_extra: z.array(z.object({ zh: z.string(), ja: z.string() })).default([]),
  }),
  patch: z.object({
    reading_zhuyin: z.string().optional(),
    pinyin: z.string().optional(),
    part_of_speech: z.string().optional(),
    level: z.string().optional(),
    example_sentence: z.string().optional(),
    example_translation: z.string().optional(),
  }).optional(),
});

export const updateWordExtras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateExtrasInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const update: Record<string, unknown> = { extras: data.extras as never };
    if (data.patch) {
      for (const [k, v] of Object.entries(data.patch)) {
        if (v !== undefined && v !== "") update[k] = v;
      }
    }
    const { error } = await supabase.from("words").update(update as never).eq("id", data.word_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
