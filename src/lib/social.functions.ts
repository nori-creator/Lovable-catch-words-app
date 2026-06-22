import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type FeedPost = {
  id: string;
  user_id: string;
  caption: string | null;
  visibility: string;
  like_count: number;
  comment_count: number;
  created_at: string;
  liked_by_me: boolean;
  author: { display_name: string | null; avatar_url: string | null };
  sticker: {
    id: string;
    cutout_url: string | null;
    selfie_url: string | null;
    object_url: string | null;
    location_name: string | null;
    word: {
      headword: string;
      reading_zhuyin: string | null;
      pinyin: string | null;
      meaning_ja: string;
      level: string | null;
      category_key: string | null;
      silhouette_emoji: string | null;
    } | null;
  } | null;
};

async function signStickerUrls(
  paths: Array<string | null | undefined>
): Promise<Array<string | null>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: Array<string | null> = [];
  for (const p of paths) {
    if (!p) { out.push(null); continue; }
    const { data } = await supabaseAdmin.storage.from("stickers").createSignedUrl(p, 60 * 60 * 6);
    out.push(data?.signedUrl ?? null);
  }
  return out;
}

async function hydratePosts(
  rows: Array<{ id: string; user_id: string; sticker_id: string | null; caption: string | null; visibility: string; like_count: number; comment_count: number; created_at: string }>,
  viewerId: string
): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const stickerIds = Array.from(new Set(rows.map((r) => r.sticker_id).filter((x): x is string => !!x)));
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const postIds = rows.map((r) => r.id);

  const [stickersRes, profilesRes, likesRes] = await Promise.all([
    stickerIds.length
      ? supabaseAdmin
          .from("stickers")
          .select(
            "id, object_image_url, cutout_image_url, selfie_image_url, location_name, words(headword, reading_zhuyin, pinyin, meaning_ja, level, category_key, silhouette_emoji)"
          )
          .in("id", stickerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; object_image_url: string | null; cutout_image_url: string | null; selfie_image_url: string | null; location_name: string | null; words: FeedPost["sticker"] extends infer S ? S extends { word: infer W } ? W : never : never }> }),
    supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", userIds),
    supabaseAdmin.from("post_likes").select("post_id").in("post_id", postIds).eq("user_id", viewerId),
  ]);

  const stickers = (stickersRes.data ?? []) as Array<{
    id: string;
    object_image_url: string | null;
    cutout_image_url: string | null;
    selfie_image_url: string | null;
    location_name: string | null;
    words: FeedPost["sticker"] extends infer S ? S extends { word: infer W } ? W : never : never;
  }>;
  const profiles = (profilesRes.data ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>;
  const liked = new Set(((likesRes.data ?? []) as Array<{ post_id: string }>).map((l) => l.post_id));

  // sign all sticker paths in one batch
  const allPaths: Array<string | null> = [];
  for (const s of stickers) {
    allPaths.push(s.object_image_url, s.cutout_image_url, s.selfie_image_url);
  }
  const signed = await signStickerUrls(allPaths);
  const stickerMap = new Map<string, FeedPost["sticker"]>();
  stickers.forEach((s, i) => {
    const base = i * 3;
    stickerMap.set(s.id, {
      id: s.id,
      object_url: signed[base],
      cutout_url: signed[base + 1],
      selfie_url: signed[base + 2],
      location_name: s.location_name,
      word: s.words,
    });
  });

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    caption: r.caption,
    visibility: r.visibility,
    like_count: r.like_count,
    comment_count: r.comment_count,
    created_at: r.created_at,
    liked_by_me: liked.has(r.id),
    author: {
      display_name: profileMap.get(r.user_id)?.display_name ?? null,
      avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
    },
    sticker: r.sticker_id ? stickerMap.get(r.sticker_id) ?? null : null,
  }));
}

export const getFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tab: z.enum(["following", "popular"]).default("following"), limit: z.number().min(1).max(50).default(20) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("posts")
      .select("id, user_id, sticker_id, caption, visibility, like_count, comment_count, created_at")
      .limit(data.limit);

    if (data.tab === "following") {
      // RLS already filters; further constrain to followed users + self
      const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
      const ids = [userId, ...((f ?? []).map((r) => r.following_id))];
      query = query.in("user_id", ids).order("created_at", { ascending: false });
    } else {
      query = query.order("like_count", { ascending: false }).order("created_at", { ascending: false });
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return hydratePosts(rows ?? [], userId);
  });

export const getPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("posts")
      .select("id, user_id, sticker_id, caption, visibility, like_count, comment_count, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const [post] = await hydratePosts([row], userId);
    return post;
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      sticker_id: z.string().uuid(),
      caption: z.string().max(500).optional(),
      visibility: z.enum(["private", "friends", "public"]).default("public"),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // confirm ownership of sticker
    const { data: s } = await supabase.from("stickers").select("id").eq("id", data.sticker_id).eq("user_id", userId).maybeSingle();
    if (!s) throw new Error("Sticker not found");
    const { data: ins, error } = await supabase
      .from("posts")
      .insert({ user_id: userId, sticker_id: data.sticker_id, caption: data.caption ?? null, visibility: data.visibility })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ post_id: z.string().uuid(), like: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.like) {
      const { error } = await supabase.from("post_likes").insert({ post_id: data.post_id, user_id: userId });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("post_likes").delete().eq("post_id", data.post_id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ post_id: z.string().uuid(), body: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: ins, error } = await supabase
      .from("post_comments")
      .insert({ post_id: data.post_id, user_id: userId, body: data.body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const getComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ post_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("post_comments")
      .select("id, user_id, body, created_at")
      .eq("post_id", data.post_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", userIds);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      author: { display_name: map.get(r.user_id)?.display_name ?? null, avatar_url: map.get(r.user_id)?.avatar_url ?? null },
    }));
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ target_user_id: z.string().uuid(), follow: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.target_user_id === userId) throw new Error("Cannot follow yourself");
    if (data.follow) {
      const { error } = await supabase.from("follows").insert({ follower_id: userId, following_id: data.target_user_id });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("follows").delete().eq("follower_id", userId).eq("following_id", data.target_user_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("notifications")
      .select("id, actor_id, type, post_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
    const { data: profiles } = actorIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", actorIds)
      : { data: [] };
    const map = new Map(((profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>).map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      actor: r.actor_id ? { display_name: map.get(r.actor_id)?.display_name ?? null, avatar_url: map.get(r.actor_id)?.avatar_url ?? null } : null,
    }));
  });

export const markAllRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
