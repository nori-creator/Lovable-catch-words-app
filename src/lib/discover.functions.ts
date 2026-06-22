import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  sticker_count: number;
  post_count: number;
  xp: number;
  rank: number;
};

export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(20) }).parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<LeaderboardRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("get_leaderboard", { _limit: data.limit });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r, i) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      sticker_count: Number(r.sticker_count ?? 0),
      post_count: Number(r.post_count ?? 0),
      xp: Number(r.xp ?? 0),
      rank: i + 1,
    }));
  });

export const searchUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().min(1).max(40) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .ilike("display_name", `%${data.q}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const searchWords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().min(1).max(40) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const q = `%${data.q}%`;
    const { data: rows, error } = await supabase
      .from("words")
      .select("id, headword, reading_zhuyin, meaning_ja, category_key, silhouette_emoji")
      .or(`headword.ilike.${q},meaning_ja.ilike.${q},pinyin.ilike.${q}`)
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
