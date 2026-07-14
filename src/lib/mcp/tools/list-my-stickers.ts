import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, errorContent } from "../supabase";

export default defineTool({
  name: "list_my_stickers",
  title: "List my stickers",
  description:
    "List the caller's most recent Catchwords stickers (photo/text/voice catches) with the associated Mandarin word, reading, Japanese meaning, and capture time. Returns compact rows suitable for browsing the dex.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .describe("Maximum number of stickers to return (1-50). Defaults to 20.")
      .optional(),
    offset: z
      .number()
      .int()
      .describe("Number of stickers to skip for pagination. Defaults to 0.")
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, offset }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const userId = ctx.getUserId();
    if (!userId) return errorContent("No user id on token");
    const supabase = supabaseForCaller(ctx);

    const take = Math.max(1, Math.min(50, limit ?? 20));
    const skip = Math.max(0, offset ?? 0);

    const { data, error } = await supabase
      .from("stickers")
      .select(
        "id, caption, location_name, taken_at, created_at, capture_type, words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, level, category_key)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(skip, skip + take - 1);
    if (error) return errorContent(error.message);

    const rows = (data ?? []).map((r) => {
      const w = (r as unknown as { words: Record<string, unknown> | null }).words ?? {};
      return {
        id: r.id,
        headword: (w as { headword?: string }).headword ?? null,
        reading_zhuyin: (w as { reading_zhuyin?: string }).reading_zhuyin ?? null,
        pinyin: (w as { pinyin?: string }).pinyin ?? null,
        meaning_ja: (w as { meaning_ja?: string }).meaning_ja ?? null,
        part_of_speech: (w as { part_of_speech?: string }).part_of_speech ?? null,
        level: (w as { level?: string }).level ?? null,
        category: (w as { category_key?: string }).category_key ?? null,
        caption: r.caption ?? null,
        location: r.location_name ?? null,
        capture_type: (r as { capture_type?: string }).capture_type ?? "photo",
        taken_at: r.taken_at,
        created_at: r.created_at,
      };
    });

    return {
      content: [
        { type: "text", text: `Returned ${rows.length} stickers (offset ${skip}).` },
        { type: "text", text: JSON.stringify(rows, null, 2) },
      ],
      structuredContent: { stickers: rows, offset: skip, limit: take },
    };
  },
});
