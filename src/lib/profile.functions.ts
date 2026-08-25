import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { L1_ORDER } from "@/lib/l1";
import type { Database } from "@/integrations/supabase/types";

type MyProfile = Database["public"]["Tables"]["profiles"]["Row"];

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyProfile | null> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_url, native_language, ui_language, target_language, level_goal, pronunciation_strictness, onboarded, created_at, updated_at, album_bg, plan, review_mode, current_level, review_daily_limit, review_stage_focus",
      )
      .eq("id", userId)
      .maybeSingle();

    if (!error) return data as MyProfile | null;
    if (!/permission denied|not allowed|does not have|column .* does not exist|schema cache/i.test(error.message)) {
      throw new Error(error.message);
    }

    // Some environments intentionally grant only public profile columns to the
    // browser-facing role. Do not fall back to the service-role key here: home,
    // onboarding, and settings must not white-screen if that secret is absent.
    const { data: publicData, error: publicError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, created_at, onboarded")
      .eq("id", userId)
      .maybeSingle();
    if (publicError) throw new Error(publicError.message);
    if (!publicData) return null;

    return {
      id: publicData.id,
      display_name: publicData.display_name,
      avatar_url: publicData.avatar_url,
      created_at: publicData.created_at,
      updated_at: publicData.created_at,
      native_language: "ja",
      ui_language: "ja",
      target_language: "zh-TW",
      level_goal: "TOCFL-2",
      pronunciation_strictness: "normal",
      onboarded: publicData.onboarded,
      album_bg: "paper",
      plan: "free",
      review_mode: "speaking",
      current_level: null,
      review_daily_limit: 20,
      review_stage_focus: "all",
    };
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
  /**
   * 復習の出題形式。`hybrid` は記憶の段階に合わせる(`lib/review-format.ts`)。
   * **DB の検査制約と同じ集合でなければならない** —
   * `20260820060000_review_mode_hybrid.sql` で 'hybrid' を足してある。
   * ここだけ広げると保存が毎回制約違反で落ちる。
   */
  review_mode: z.enum(["speaking", "choice", "hybrid"]).optional(),
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
    const loose = supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const save = (v: Record<string, unknown>) => loose.from("profiles").update(v).eq("id", userId);

    const payload = { ...(data as Record<string, unknown>) };
    let { error } = await save(payload);

    // 設定は1回のUPDATEでまとめて送る。そのため**まだ適用されていない
    // マイグレーションの列が1つ混ざっているだけで保存全体が失敗**し、
    // 「1日の復習枚数が変えられない」どころか言語もテーマも保存できなく
    // なっていた(2026-08-02の指摘)。未知の列はその名前だけ落として
    // 保存し直し、残りは必ず通す。
    for (let i = 0; i < 4 && error; i++) {
      const missing = /column "?([a-z_]+)"? .*(does not exist|schema cache)/i.exec(error.message);
      const key = missing?.[1] ?? unknownColumnFrom(error.message, Object.keys(payload));
      if (!key || !(key in payload)) break;
      delete payload[key];
      console.warn(`[profile] column "${key}" not in the database yet — saving without it`);
      if (Object.keys(payload).length === 0) return { ok: true, skipped: [key] };
      ({ error } = await save(payload));
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** PostgREST の文言ゆらぎ対策: 送ったキー名がメッセージに出ていれば拾う。 */
function unknownColumnFrom(message: string, keys: string[]): string | null {
  if (!/does not exist|schema cache|unknown column/i.test(message)) return null;
  return keys.find((k) => message.includes(k)) ?? null;
}

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
    const contentType = `image/${rawExt.toLowerCase()}`;
    let { error: upErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, bytes, { contentType, upsert: true });

    // バケットはマイグレーションで作るが、まだ適用されていない環境では
    // 「写真を変えられない」だけの状態になる。サービスロールなら自分で
    // 作れるので、その場で作ってやり直す(公開・画像のみ・5MBまで)。
    if (upErr && /not found|does not exist|bucket/i.test(upErr.message)) {
      await supabaseAdmin.storage
        .createBucket("avatars", {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        })
        .catch(() => {});
      ({ error: upErr } = await supabaseAdmin.storage
        .from("avatars")
        .upload(path, bytes, { contentType, upsert: true }));
    }
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
