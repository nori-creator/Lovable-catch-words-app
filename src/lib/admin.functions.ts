import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DictionaryImportRow = {
  headword: string;
  zhuyin?: string | null;
  pinyin?: string | null;
  meaning_ja: string;
  pos?: string | null;
  tocfl_level?: number | null;
  taiwan_usage?: string | null;
  source?: string | null;
  entry_type?: string | null;
  scene_tags?: string[] | null;
  notes?: string | null;
};

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
  });

export const importDictionaryEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: DictionaryImportRow[] }) => {
    if (!input || !Array.isArray(input.rows)) throw new Error("rows must be an array");
    if (input.rows.length === 0) throw new Error("No rows provided");
    if (input.rows.length > 5000) throw new Error("Too many rows (max 5000 per import)");
    for (const r of input.rows) {
      if (!r.headword || !r.meaning_ja) {
        throw new Error("Each row requires headword and meaning_ja");
      }
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // Verify admin role
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload = data.rows.map((r) => ({
      headword: r.headword.trim(),
      zhuyin: r.zhuyin?.trim() || null,
      pinyin: r.pinyin?.trim() || null,
      meaning_ja: r.meaning_ja.trim(),
      pos: r.pos?.trim() || null,
      tocfl_level:
        r.tocfl_level === null || r.tocfl_level === undefined || Number.isNaN(r.tocfl_level)
          ? null
          : Number(r.tocfl_level),
      taiwan_usage: r.taiwan_usage?.trim() || null,
      source: r.source?.trim() || "verified",
      entry_type: r.entry_type?.trim() || "word",
      scene_tags: r.scene_tags && r.scene_tags.length > 0 ? r.scene_tags : null,
      notes: r.notes?.trim() || null,
      language: "zh-TW",
    }));

    // Chunked upsert on (language, headword, entry_type)
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin
        .from("dictionary_entries")
        .upsert(chunk, { onConflict: "language,headword,entry_type" });
      if (error) throw new Error(`Chunk ${i / chunkSize + 1} failed: ${error.message}`);
      inserted += chunk.length;
    }

    const { count } = await supabaseAdmin
      .from("dictionary_entries")
      .select("*", { count: "exact", head: true });

    return { inserted, totalRows: count ?? null };
  });

export const searchDictionaryEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => ({ q: String(input?.q ?? "").trim().slice(0, 100) }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("dictionary_entries")
      .select("id, headword, zhuyin, pinyin, meaning_ja, pos, tocfl_level, source, entry_type")
      .order("headword", { ascending: true })
      .limit(50);
    if (data.q) {
      query = query.or(
        `headword.ilike.%${data.q}%,pinyin.ilike.%${data.q}%,meaning_ja.ilike.%${data.q}%`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
