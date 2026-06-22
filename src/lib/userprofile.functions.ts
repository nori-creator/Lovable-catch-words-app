import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  stats: {
    captured: number;
    posts: number;
    followers: number;
    following: number;
  };
  is_following: boolean;
  is_me: boolean;
  recent_stickers: Array<{
    id: string;
    cutout_url: string | null;
    headword: string | null;
    emoji: string | null;
  }>;
};

export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }): Promise<PublicProfile> => {
    const { supabase, userId } = context;
    const targetId = data.user_id;

    const [profileRes, capturedRes, postsRes, followersRes, followingRes, isFollowingRes, recentRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url, created_at").eq("id", targetId).maybeSingle(),
      supabase.from("stickers").select("id", { count: "exact", head: true }).eq("user_id", targetId),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", targetId),
      supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", targetId),
      supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", targetId),
      targetId === userId
        ? Promise.resolve({ data: null })
        : supabase.from("follows").select("follower_id").eq("follower_id", userId).eq("following_id", targetId).maybeSingle(),
      supabase
        .from("stickers")
        .select("id, cutout_image_url, words(headword, silhouette_emoji)")
        .eq("user_id", targetId)
        .order("created_at", { ascending: false })
        .limit(9),
    ]);

    if (profileRes.error || !profileRes.data) throw new Error("プロフィールが見つかりません");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const recents = (recentRes.data ?? []) as Array<{
      id: string;
      cutout_image_url: string | null;
      words: { headword: string; silhouette_emoji: string | null } | null;
    }>;
    const signed = await Promise.all(
      recents.map(async (r) => {
        if (!r.cutout_image_url) return null;
        const { data } = await supabaseAdmin.storage.from("stickers").createSignedUrl(r.cutout_image_url, 60 * 60 * 6);
        return data?.signedUrl ?? null;
      })
    );

    return {
      id: profileRes.data.id,
      display_name: profileRes.data.display_name,
      avatar_url: profileRes.data.avatar_url,
      created_at: profileRes.data.created_at,
      stats: {
        captured: capturedRes.count ?? 0,
        posts: postsRes.count ?? 0,
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0,
      },
      is_following: !!isFollowingRes.data,
      is_me: targetId === userId,
      recent_stickers: recents.map((r, i) => ({
        id: r.id,
        cutout_url: signed[i],
        headword: r.words?.headword ?? null,
        emoji: r.words?.silhouette_emoji ?? null,
      })),
    };
  });
