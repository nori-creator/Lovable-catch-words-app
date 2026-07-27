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

// --- AIモデルの実行時切替 (2026-07-27) --------------------------------------
// app_config.key='ai_models' を読み書きする。鍵そのものはDBに置かず、
// 環境変数名(api_key_env)で参照する — 漏洩面を増やさないため。

export type AiModelConfig = {
  provider?: string;
  base_url?: string;
  api_key_env?: string;
  fast?: string;
  rich?: string;
  rich_premium?: string;
};

/** 現在のモデル設定+選べるプロバイダのプリセットを返す(admin限定)。 */
export const getAiModelConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("管理者のみ");
    const { PROVIDER_PRESETS, getAi } = await import("./ai-provider.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
    const { data } = await db.from("app_config").select("value").eq("key", "ai_models").maybeSingle();
    const config = ((data as { value?: AiModelConfig } | null)?.value ?? {}) as AiModelConfig;
    // 実際にいま使われている値(env のフォールバックを含む)も見せる。
    let effective: { provider: string; fast: string; rich: string; rich_premium: string } | null = null;
    try {
      const ai = getAi();
      effective = {
        provider: ai.provider,
        fast: ai.modelFast,
        rich: ai.modelRich,
        rich_premium: ai.modelRichPremium,
      };
    } catch { /* キー未設定でも画面は開けるようにする */ }
    const presets = Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({
      id,
      label: p.label,
      api_key_env: p.api_key_env,
      key_present: Boolean(process.env[p.api_key_env]),
    }));
    return { config, effective, presets };
  });

/** モデル設定を保存(admin限定)。空文字は未設定として消す。 */
export const setAiModelConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { config: AiModelConfig }) => {
    if (!input || typeof input.config !== "object") throw new Error("config required");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("管理者のみ");
    const clean: AiModelConfig = {};
    for (const [k, v] of Object.entries(data.config)) {
      if (typeof v === "string" && v.trim()) clean[k as keyof AiModelConfig] = v.trim();
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => { upsert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await db.from("app_config").upsert({
      key: "ai_models",
      value: clean,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, config: clean };
  });
