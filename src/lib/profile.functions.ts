import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  native_language: z.string().optional(),
  ui_language: z.string().optional(),
  target_language: z.string().optional(),
  level_goal: z.string().optional(),
  pronunciation_strictness: z.enum(["easy", "normal", "strict"]).optional(),
  review_mode: z.enum(["speaking", "choice"]).optional(),
  onboarded: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("id", userId);
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
