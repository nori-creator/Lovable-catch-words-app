import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, errorContent } from "../supabase";

export default defineTool({
  name: "get_sticker",
  title: "Get sticker details",
  description:
    "Return full details for one of the caller's stickers by id: word card (headword, reading, pinyin, meaning, example sentence, part of speech, level, category), caption, location, and capture metadata. Only works for stickers owned by the caller.",
  inputSchema: {
    sticker_id: z.string().uuid().describe("The sticker's UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sticker_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const userId = ctx.getUserId();
    if (!userId) return errorContent("No user id on token");
    const supabase = supabaseForCaller(ctx);

    const { data, error } = await supabase
      .from("stickers")
      .select(
        "id, caption, location_name, lat, lng, taken_at, created_at, capture_type, encounter_count, words(headword, reading_zhuyin, pinyin, meaning_ja, part_of_speech, example_sentence, example_translation, level, category_key)",
      )
      .eq("user_id", userId)
      .eq("id", sticker_id)
      .maybeSingle();
    if (error) return errorContent(error.message);
    if (!data) return errorContent("Sticker not found or not owned by caller");

    const w = (data as unknown as { words: Record<string, unknown> | null }).words ?? {};
    const out = {
      id: data.id,
      word: {
        headword: (w as { headword?: string }).headword ?? null,
        reading_zhuyin: (w as { reading_zhuyin?: string }).reading_zhuyin ?? null,
        pinyin: (w as { pinyin?: string }).pinyin ?? null,
        meaning_ja: (w as { meaning_ja?: string }).meaning_ja ?? null,
        part_of_speech: (w as { part_of_speech?: string }).part_of_speech ?? null,
        example_sentence: (w as { example_sentence?: string }).example_sentence ?? null,
        example_translation:
          (w as { example_translation?: string }).example_translation ?? null,
        level: (w as { level?: string }).level ?? null,
        category: (w as { category_key?: string }).category_key ?? null,
      },
      caption: data.caption ?? null,
      location_name: data.location_name ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      capture_type: (data as { capture_type?: string }).capture_type ?? "photo",
      encounter_count: (data as { encounter_count?: number }).encounter_count ?? 0,
      taken_at: data.taken_at,
      created_at: data.created_at,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  },
});
