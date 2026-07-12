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
