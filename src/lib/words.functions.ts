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
