import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SeedWord = {
  id: string;
  headword: string;
  reading_zhuyin: string | null;
  meaning_ja: string;
  level: string | null;
  category_key: string | null;
  silhouette_emoji: string | null;
};

export const listSeedWordsWithStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: words, error: wErr }, { data: stickers, error: sErr }, { data: cats, error: cErr }] =
      await Promise.all([
        supabase
          .from("words")
          .select("id, headword, reading_zhuyin, meaning_ja, level, category_key, silhouette_emoji")
          .eq("source", "seed")
          .order("category_key", { ascending: true }),
        supabase.from("stickers").select("word_id").eq("user_id", userId),
        supabase.from("categories").select("key, label_ja, icon_emoji, sort_order").order("sort_order"),
      ]);
    if (wErr) throw new Error(wErr.message);
    if (sErr) throw new Error(sErr.message);
    if (cErr) throw new Error(cErr.message);
    const captured = new Set((stickers ?? []).map((s) => s.word_id));
    return {
      words: (words ?? []).map((w) => ({ ...w, captured: captured.has(w.id) })) as Array<
        SeedWord & { captured: boolean }
      >,
      categories: cats ?? [],
    };
  });

function tsvEscape(v: string | null | undefined): string {
  return (v ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * Export the user's whole deck as tab-separated text. The column order is
 * Anki-import friendly (front = headword, back = meaning); it also opens in
 * any spreadsheet. Your memories are never locked in.
 */
export const exportMyDeck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tsv: string; count: number }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("stickers")
      .select(
        "caption, location_name, taken_at, words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, level, category_key, example_sentence, example_translation)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const header = [
      "headword", "zhuyin", "pinyin", "meaning", "part_of_speech", "level",
      "category", "example", "example_translation", "caption", "location", "taken_at",
    ].join("\t");
    type Row = {
      caption: string | null;
      location_name: string | null;
      taken_at: string;
      words: {
        headword: string;
        reading_zhuyin: string | null;
        pinyin: string | null;
        meaning_ja: string;
        part_of_speech: string | null;
        level: string | null;
        category_key: string | null;
        example_sentence: string | null;
        example_translation: string | null;
      } | null;
    };
    const rows = ((data ?? []) as unknown as Row[])
      .filter((r) => r.words)
      .map((r) =>
        [
          r.words!.headword,
          r.words!.reading_zhuyin,
          r.words!.pinyin,
          r.words!.meaning_ja,
          r.words!.part_of_speech,
          r.words!.level,
          r.words!.category_key,
          r.words!.example_sentence,
          r.words!.example_translation,
          r.caption,
          r.location_name,
          r.taken_at,
        ]
          .map(tsvEscape)
          .join("\t"),
      );
    return { tsv: [header, ...rows].join("\n"), count: rows.length };
  });
