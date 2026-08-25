import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_TARGET_LANGUAGE, normalizeTargetLanguage } from "./target-lang";
import { partitionByLanguage, type DictionaryImportRow as ImportRow } from "./dictionary-import";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// 行の形と「混ざらない」判定は `dictionary-import.ts` が持つ（試験付き）。
export type { DictionaryImportRow } from "./dictionary-import";

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
  .inputValidator((input: { rows: ImportRow[]; language?: string }) => {
    if (!input || !Array.isArray(input.rows)) throw new Error("rows must be an array");
    if (input.rows.length === 0) throw new Error("No rows provided");
    if (input.rows.length > 5000) throw new Error("Too many rows (max 5000 per import)");
    // **1行ごとの検査はここでしない。** 1行落ちただけで取り込み全体を
    // 投げると、25,000行を貼った人は「どこが悪いのか」を1件ずつ潰す
    // ことになる。合う行は入れて、落ちた行は数と実例で返す。
    return {
      rows: input.rows,
      // **言語は必ず受け取る。** 決め打つと、英語の CSV が台湾華語として
      // 入る（オーナー指示「決して英語と台湾華語混ざらないように」）。
      language: normalizeTargetLanguage(input.language),
    };
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

    // **ここが「混ざらない」の門。** 選んだ言語の見出し語でない行は
    // 通さない。繁体字は英語の取り込みを通れないし、英語の語は
    // 台湾華語の取り込みを通れない（`target-profile.ts` の `headwordOk`）。
    const { language, ok, rejected } = partitionByLanguage(data.rows, data.language);
    if (ok.length === 0) {
      throw new Error(
        `選んだ言語(${language})の見出し語が1行もありません。` +
          `言語の選択と、貼った中身が合っているか確かめてください。`,
      );
    }

    const num = (v: unknown): number | null =>
      v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);

    // **古い列は既定の言語のときだけ書く。**
    //
    // `zhuyin` `pinyin` `tocfl_level` は名前に言語が入っている列。
    // ここに英語の IPA や CEFR の段を入れると、**名前と中身が食い違う**:
    //
    //   zhuyin      に IPA が入る → `scan.functions.ts` がそれを注音として出す
    //   tocfl_level に CEFR が入る → 「TOCFL 3級」と読まれる
    //
    // `words.pinyin` に IPA を入れる逃げ道を断ったのと同じ話。
    // 新しい列(`reading_primary`/`reading_alt`/`level_step`)はどの言語でも
    // 正しいので、そちらは必ず書く。
    const isLegacyLanguage = language === DEFAULT_TARGET_LANGUAGE;
    const legacy = <T>(v: T): T | null => (isLegacyLanguage ? v : null);

    const payload = ok.map((r) => ({
      headword: r.headword,
      zhuyin: legacy(r.reading_primary?.trim() || null),
      pinyin: legacy(r.reading_alt?.trim() || null),
      reading_primary: r.reading_primary?.trim() || null,
      reading_alt: r.reading_alt?.trim() || null,
      meaning_ja: r.meaning_ja?.trim() || null,
      meanings: r.meanings && Object.keys(r.meanings).length > 0 ? r.meanings : {},
      pos: r.pos?.trim() || null,
      level_step: num(r.level_step ?? r.tocfl_level),
      tocfl_level: legacy(num(r.tocfl_level ?? r.level_step)),
      freq_rank: num(r.freq_rank),
      exam_tags: r.exam_tags && r.exam_tags.length > 0 ? r.exam_tags : null,
      forms: r.forms && Object.keys(r.forms).length > 0 ? r.forms : null,
      usage_register: r.usage_register?.trim() || null,
      // `taiwan_usage` も名前に言語が入っている。英語には書かない
      // （言語に依らない名前は `usage_register`）。
      taiwan_usage: legacy(r.taiwan_usage?.trim() || null),
      source: r.source?.trim() || "verified",
      entry_type: r.entry_type?.trim() || "word",
      scene_tags: r.scene_tags && r.scene_tags.length > 0 ? r.scene_tags : null,
      notes: r.notes?.trim() || null,
      language,
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

    // **落ちた行を必ず返す。** 数だけ返すと「12,000件入りました」で
    // 終わり、何が落ちたか分からないまま半分の辞書が残る。
    // 実例は先頭20件まで（25,000行の全部を返すと画面が固まる）。
    return {
      inserted,
      totalRows: count ?? null,
      language,
      rejectedCount: rejected.length,
      rejectedSample: rejected.slice(0, 20),
    };
  });

export const searchDictionaryEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => ({
    q: String(input?.q ?? "")
      .trim()
      .slice(0, 100),
  }))
  .handler(async ({ data, context }) => {
    // Admin-only, like every other fn on the dictionary admin page.
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("管理者のみ");
    let query = context.supabase
      .from("dictionary_entries")
      .select("id, headword, zhuyin, pinyin, meaning_ja, pos, tocfl_level, source, entry_type")
      .order("headword", { ascending: true })
      .limit(50);
    // Strip PostgREST `.or()` structural characters so the raw query can't inject filters.
    const q = data.q.replace(/[,()\\]/g, "").trim();
    if (q) {
      query = query.or(`headword.ilike.%${q}%,pinyin.ilike.%${q}%,meaning_ja.ilike.%${q}%`);
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
  /** 機能ごとの割り当て。値は "provider:model" またはモデル名だけ。 */
  features?: Record<string, string>;
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
    const { PROVIDER_PRESETS, AI_FEATURES, availableProviders, getAi } =
      await import("./ai-provider.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", "ai_models")
      .maybeSingle();
    const config = ((data as { value?: AiModelConfig } | null)?.value ?? {}) as AiModelConfig;
    // 実際にいま使われている値(env のフォールバックを含む)も見せる。
    let effective: { provider: string; fast: string; rich: string; rich_premium: string } | null =
      null;
    let keyError: string | null = null;
    try {
      const ai = getAi();
      effective = {
        provider: ai.provider,
        fast: ai.modelFast,
        rich: ai.modelRich,
        rich_premium: ai.modelRichPremium,
      };
    } catch (e) {
      // キー未設定でも画面は開ける。何が足りないかをそのまま見せる。
      keyError = e instanceof Error ? e.message : String(e);
    }
    // 診断: どのキーが実際に検出できているか(別名を含む)。値は絶対に返さない。
    const detected = availableProviders();
    const presets = Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({
      id,
      label: p.label,
      api_key_env: p.api_key_env,
      /** 見つかったキーの env 名(別名でも可)。null なら未設定。 */
      key_env_found: detected.find((d) => d.id === id)?.key_env ?? null,
      key_present: Boolean(detected.find((d) => d.id === id)?.key_env),
    }));
    return {
      config,
      effective,
      presets,
      keyError,
      ai_provider_env: process.env.AI_PROVIDER ?? null,
      features: AI_FEATURES,
    };
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
      if (k === "features") continue; // オブジェクトなので下で個別に扱う
      if (typeof v === "string" && v.trim()) {
        (clean as Record<string, string>)[k] = v.trim();
      }
    }
    // 機能ごとの割り当て。空文字は「既定に戻す」なので保存しない。
    const rawFeatures = data.config.features;
    if (rawFeatures && typeof rawFeatures === "object") {
      const features: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawFeatures)) {
        if (typeof v === "string" && v.trim()) features[k] = v.trim();
      }
      if (Object.keys(features).length > 0) clean.features = features;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        upsert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
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
