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
    /** When viewing someone else's profile, links to the public post that shares
     *  this catch; null on your own profile (links to the dex card instead). */
    post_id: string | null;
    cutout_url: string | null;
    headword: string | null;
    emoji: string | null;
  }>;
};

type RecentRow = {
  id: string;
  cutout_image_url: string | null;
  words: { headword: string; silhouette_emoji: string | null } | null;
};

export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }): Promise<PublicProfile> => {
    const { supabase, userId } = context;
    const targetId = data.user_id;
    const isMe = targetId === userId;

    // Stats and other users' catches must be read with the service role: the
    // RLS-scoped client can only see the viewer's OWN stickers/follows
    // (stickers_select_own, "follows self read"), so every counter and recent
    // catch came back 0/empty on anyone else's profile. Counts are aggregate
    // vanity numbers already exposed via get_leaderboard, so this exposes
    // nothing new; recent catches for other users are limited to their PUBLIC
    // posts so private captures never leak.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profileRes, capturedRes, postsRes, followersRes, followingRes, isFollowingRes] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, display_name, avatar_url, created_at")
          .eq("id", targetId)
          .maybeSingle(),
        supabaseAdmin
          .from("stickers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetId),
        supabaseAdmin
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetId),
        supabaseAdmin
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("following_id", targetId),
        supabaseAdmin
          .from("follows")
          .select("following_id", { count: "exact", head: true })
          .eq("follower_id", targetId),
        isMe
          ? Promise.resolve({ data: null })
          : supabase
              .from("follows")
              .select("follower_id")
              .eq("follower_id", userId)
              .eq("following_id", targetId)
              .maybeSingle(),
      ]);

    if (profileRes.error || !profileRes.data) throw new Error("プロフィールが見つかりません");

    // Own profile: show your latest catches (all of them), linking to the dex
    // card. Someone else's: show only catches they've shared as public posts.
    let recents: Array<RecentRow & { post_id: string | null }>;
    if (isMe) {
      const { data: mine } = await supabaseAdmin
        .from("stickers")
        .select("id, cutout_image_url, words(headword, silhouette_emoji)")
        .eq("user_id", targetId)
        .order("created_at", { ascending: false })
        .limit(9);
      recents = ((mine ?? []) as RecentRow[]).map((r) => ({ ...r, post_id: null }));
    } else {
      const { data: shared } = await supabaseAdmin
        .from("posts")
        .select("id, stickers(id, cutout_image_url, words(headword, silhouette_emoji))")
        .eq("user_id", targetId)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(9);
      recents = ((shared ?? []) as Array<{ id: string; stickers: RecentRow | null }>)
        .filter((p) => p.stickers)
        .map((p) => ({ ...(p.stickers as RecentRow), post_id: p.id }));
    }

    const signed = await Promise.all(
      recents.map(async (r) => {
        if (!r.cutout_image_url) return null;
        const { data } = await supabaseAdmin.storage
          .from("stickers")
          .createSignedUrl(r.cutout_image_url, 60 * 60 * 6);
        return data?.signedUrl ?? null;
      }),
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
      is_me: isMe,
      recent_stickers: recents.map((r, i) => ({
        id: r.id,
        post_id: r.post_id,
        cutout_url: signed[i],
        headword: r.words?.headword ?? null,
        emoji: r.words?.silhouette_emoji ?? null,
      })),
    };
  });
