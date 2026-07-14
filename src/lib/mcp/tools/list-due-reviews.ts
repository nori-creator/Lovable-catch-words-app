import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, errorContent } from "../supabase";

export default defineTool({
  name: "list_due_reviews",
  title: "List due reviews",
  description:
    "List the caller's SRS reviews that are due now (due_at ≤ now). Each row includes the sticker id, the associated Mandarin word, reading, and Japanese meaning, and the current SRS interval and ease.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .describe("Maximum number of due reviews to return (1-100). Defaults to 25.")
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const userId = ctx.getUserId();
    if (!userId) return errorContent("No user id on token");
    const supabase = supabaseForCaller(ctx);

    const take = Math.max(1, Math.min(100, limit ?? 25));
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, sticker_id, due_at, interval_days, ease, reps, stickers!inner(user_id, words(headword, reading_zhuyin, pinyin, meaning_ja))",
      )
      .eq("stickers.user_id", userId)
      .lte("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(take);
    if (error) return errorContent(error.message);

    const rows = (data ?? []).map((r) => {
      const s = (r as unknown as { stickers: { words: Record<string, unknown> | null } | null }).stickers;
      const w = s?.words ?? {};
      return {
        review_id: r.id,
        sticker_id: r.sticker_id,
        headword: (w as { headword?: string }).headword ?? null,
        reading_zhuyin: (w as { reading_zhuyin?: string }).reading_zhuyin ?? null,
        pinyin: (w as { pinyin?: string }).pinyin ?? null,
        meaning_ja: (w as { meaning_ja?: string }).meaning_ja ?? null,
        due_at: r.due_at,
        interval_days: (r as { interval_days?: number }).interval_days ?? null,
        ease: (r as { ease?: number }).ease ?? null,
        reps: (r as { reps?: number }).reps ?? null,
      };
    });

    return {
      content: [
        { type: "text", text: `${rows.length} review(s) due as of ${nowIso}.` },
        { type: "text", text: JSON.stringify(rows, null, 2) },
      ],
      structuredContent: { due_at_or_before: nowIso, reviews: rows },
    };
  },
});
