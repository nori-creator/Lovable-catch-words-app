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

// 開発者の「AI の設定」（機能ごとの AI・画像・発音の声）の口は `admin-ai.functions.ts`
// （Web と iOS の両方から呼ぶ。約束は `docs/admin-ai-api.md`）。
