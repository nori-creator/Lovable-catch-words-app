import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForCaller, errorContent } from "../supabase";

export default defineTool({
  name: "who_am_i",
  title: "Who am I",
  description:
    "Return the Catchwords profile of the currently connected user: display name, UI/target languages, level goal, and total sticker count.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const supabase = supabaseForCaller(ctx);
    const userId = ctx.getUserId();

    // Public profile columns are readable by RLS + column grants.
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, onboarded, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) return errorContent(pErr.message);

    const { count } = await supabase
      .from("stickers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const summary = {
      user_id: userId,
      email: ctx.getUserEmail() ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      onboarded: profile?.onboarded ?? false,
      joined_at: profile?.created_at ?? null,
      sticker_count: count ?? 0,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
