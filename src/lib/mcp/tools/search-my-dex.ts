import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, errorContent } from "../supabase";

export default defineTool({
  name: "search_my_dex",
  title: "Search my dex",
  description:
    "Search the caller's caught words by Mandarin headword, pinyin, or Japanese meaning substring. Returns at most 30 matches, newest first, with the same shape as list_my_stickers.",
  inputSchema: {
    query: z
      .string()
      .trim()
      .describe(
        "Substring to match against headword (Mandarin), pinyin, or Japanese meaning. Case-insensitive.",
      ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const userId = ctx.getUserId();
    if (!userId) return errorContent("No user id on token");
    const q = query.trim();
    if (!q) return errorContent("query cannot be empty");
    const supabase = supabaseForCaller(ctx);

    // Escape %,_ so user text is treated literally in ilike.
    const esc = q.replace(/[%_\\]/g, (c) => `\\${c}`);
    const like = `%${esc}%`;

    // words is the shared dictionary; filter it by text, then join to the
    // caller's stickers via an inner-fk-join. We do the join server-side
    // through stickers so RLS scopes results to the caller.
    const { data, error } = await supabase
      .from("stickers")
      .select(
        "id, caption, taken_at, created_at, capture_type, words!inner(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, level, category_key)",
      )
      .eq("user_id", userId)
      .or(`headword.ilike.${like},pinyin.ilike.${like},meaning_ja.ilike.${like}`, {
        foreignTable: "words",
      })
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return errorContent(error.message);

    const rows = (data ?? []).map((r) => {
      const w = (r as unknown as { words: Record<string, unknown> }).words ?? {};
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
        capture_type: (r as { capture_type?: string }).capture_type ?? "photo",
        taken_at: r.taken_at,
        created_at: r.created_at,
      };
    });

    return {
      content: [
        { type: "text", text: `Found ${rows.length} matches for "${q}".` },
        { type: "text", text: JSON.stringify(rows, null, 2) },
      ],
      structuredContent: { query: q, matches: rows },
    };
  },
});
