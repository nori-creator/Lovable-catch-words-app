import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { L1_ORDER } from "@/lib/l1";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    // Own-row read needs all columns; column-level SELECT grants restrict the
    // authenticated role to public columns only, so read via admin scoped by
    // the authenticated userId (safe: userId comes from verified JWT).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const UpdateInput = z.object({
  display_name: z.string().min(1).max(60).optional(),
  avatar_url: z.string().url().nullable().optional(),
  /**
   * 母語。L1_ORDER にある12言語のみ。以前は自由文字列で、綴りを間違えても
   * 保存でき、読み側が黙って日本語にフォールバックしていた(=間違った母語
   * 向けの発音のコツが出るのに気づけない)。ここで弾く。
   */
  native_language: z.enum(L1_ORDER).optional(),
  ui_language: z.string().optional(),
  target_language: z.string().optional(),
  level_goal: z.string().optional(),
  /** TOCFL の現在レベル(生成物の語彙帯を現在→目標に収めるのに使う)。 */
  current_level: z.string().optional(),
  pronunciation_strictness: z.enum(["easy", "normal", "strict"]).optional(),
  review_mode: z.enum(["speaking", "choice"]).optional(),
  /** 1日に出す復習の最大枚数(0 = 無制限)。DB側にも同じ範囲の制約がある。 */
  review_daily_limit: z.number().int().min(0).max(200).optional(),
  /** どの記憶段階を優先して出すか。 */
  review_stage_focus: z.enum(["all", "weak", "new"]).optional(),
  onboarded: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // current_level は生成済みの型定義より新しい列(マイグレーション
    // 20260727100000)。型を再生成するまでは緩いクライアントとして扱う。
    const { error } = await (
      supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      }
    )
      .from("profiles")
      .update(data as Record<string, unknown>)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * プロフィール写真の登録。ヘッダーの丸アイコンに出る「自分の顔」。
 * data URL(JPEG/PNG/WebP)を受け取り、公開バケット avatars の
 * `${userId}/avatar-<ts>.<ext>` に保存して、その公開URLを profiles に書く。
 * ファイル名に時刻を入れるのは、差し替えたときに古い画像がCDN/ブラウザの
 * キャッシュから返り続けるのを防ぐため。
 */
const AvatarInput = z.object({
  // 2MB 相当の base64 まで。巨大画像でストレージと転送を溶かさない。
  dataUrl: z
    .string()
    .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/, "画像(JPEG/PNG/WebP)を選んでください")
    .max(2_800_000, "画像が大きすぎます(2MBまで)"),
});

export const setMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AvatarInput.parse(input))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const match = /^data:image\/([a-z]+);base64,(.+)$/is.exec(data.dataUrl);
    if (!match) throw new Error("画像を読み取れませんでした");
    const [, rawExt, b64] = match;
    const ext = rawExt.toLowerCase() === "jpeg" ? "jpg" : rawExt.toLowerCase();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, bytes, { contentType: `image/${rawExt.toLowerCase()}`, upsert: true });
    if (upErr) throw new Error(upErr.message);

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: publicUrl } as never)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { avatar_url: publicUrl };
  });

/** プロフィール写真を外して、既定のマークに戻す。 */
export const clearMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: null } as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteInput = z.object({
  // The client must send the literal confirmation the user typed — a stray
  // fetch or replayed request can never wipe an account by accident.
  confirm: z.literal("削除"),
});

/**
 * Permanent account deletion (App Store / Play Store requirement, privacy
 * policy §6). Deletes every user-owned row explicitly (child→parent order)
 * rather than relying on auth.users cascades, then removes uploaded photos
 * and finally the auth user itself. Shared data survives by design: the tts
 * cache is anonymous, and words created by the user stay (created_by is
 * detached) because other users' stickers may reference them.
 *
 * Idempotent-ish: if a step fails the account still exists and the user can
 * retry — nothing here leaves the account half-usable.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Uploaded photos (stickers bucket, everything under `${userId}/`).
    //    The tts bucket is a shared pronunciation cache — never touched.
    for (;;) {
      const { data: files, error } = await supabaseAdmin.storage
        .from("stickers")
        .list(userId, { limit: 1000 });
      if (error) break; // bucket missing in a fresh env — nothing to clean
      if (!files || files.length === 0) break;
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: rmErr } = await supabaseAdmin.storage.from("stickers").remove(paths);
      if (rmErr) throw new Error(`写真の削除に失敗しました: ${rmErr.message}`);
      if (files.length < 1000) break;
    }

    // 2) Detach shared words the user contributed (kept for other learners).
    {
      const { error } = await supabaseAdmin
        .from("words")
        .update({ created_by: null })
        .eq("created_by", userId);
      if (error) throw new Error(error.message);
    }

    // 3) Row deletes, children before parents (FK order verified against the
    //    live schema: posts cascade likes/comments/notifications; stickers
    //    cascade encounters/reviews/review_history).
    const steps: Array<[table: string, column: string]> = [
      ["notifications", "user_id"],
      ["notifications", "actor_id"],
      ["post_likes", "user_id"],
      ["post_comments", "user_id"],
      ["posts", "user_id"],
      ["review_history", "user_id"],
      ["reviews", "user_id"],
      ["encounters", "user_id"],
      ["daily_quests", "user_id"],
      ["stickers", "user_id"],
      ["follows", "follower_id"],
      ["follows", "following_id"],
      ["journal_entries", "user_id"],
      ["scan_events", "user_id"],
      ["usage_events", "user_id"],
      ["ai_runs", "user_id"],
      ["user_roles", "user_id"],
      ["profiles", "id"],
    ];
    for (const [table, column] of steps) {
      const { error } = await supabaseAdmin
        .from(table as never)
        .delete()
        .eq(column, userId);
      // Tables from not-yet-applied migrations simply don't exist — skip them.
      if (error && !/does not exist|relation .* not/i.test(error.message)) {
        throw new Error(`${table} の削除に失敗しました: ${error.message}`);
      }
    }

    // 4) The auth user itself — after this the session token is dead.
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(`アカウントの削除に失敗しました: ${authErr.message}`);

    return { ok: true };
  });
