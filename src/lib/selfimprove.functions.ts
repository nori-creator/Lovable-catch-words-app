import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 自己改善システムの管理面(admin専用)。実体は lexicon.server.ts:
 * 毎日1回、辞書のランダム監査+台湾ニュースのコーパス観察が自動で走る。
 * ここではその状態表示と手動実行を提供する。
 */

type AuditSuggestion = {
  zhuyin?: string;
  pinyin?: string;
  meaning_ja?: string;
  note?: string;
} | null;

type AuditRow = {
  headword: string;
  source: string;
  ok: boolean;
  confidence: number | null;
  suggestion: AuditSuggestion;
  applied: boolean;
  created_at: string;
};

async function assertAdmin(supabase: unknown, userId: string): Promise<void> {
  const { data: isAdmin, error } = await (
    supabase as {
      rpc: (fn: string, args: object) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    }
  ).rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden: admin role required");
}

export const getSelfImprovementStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
    const [auditsRes, lastRunRes, corpusRes, flaggedRes] = await Promise.all([
      supabaseAdmin
        .from("lexicon_audits")
        .select("headword, source, ok, confidence, suggestion, applied, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabaseAdmin
        .from("usage_events")
        .select("created_at")
        .eq("kind", "self_improve")
        .order("created_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("corpus_stats")
        .select("word, count")
        .gte("day", sevenDaysAgo)
        .order("count", { ascending: false })
        .limit(300),
      supabaseAdmin
        .from("lexicon_audits")
        .select("id", { count: "exact", head: true })
        .eq("ok", false)
        .eq("applied", false),
    ]);

    // 直近7日の頻度を語ごとに合算 → 上位15語
    const agg = new Map<string, number>();
    for (const r of corpusRes.data ?? []) {
      agg.set(r.word, (agg.get(r.word) ?? 0) + r.count);
    }
    const topWords = [...agg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    return {
      last_run_at: lastRunRes.data?.[0]?.created_at ?? null,
      audits: (auditsRes.data ?? []) as unknown as AuditRow[],
      needs_review: flaggedRes.count ?? 0,
      top_words: topWords,
    };
  });

export const runSelfImprovementNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [{ supabaseAdmin }, lex] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./lexicon.server"),
    ]);
    await supabaseAdmin
      .from("usage_events")
      .insert({ user_id: context.userId, kind: "self_improve" });
    const [audit, corpus] = await Promise.all([
      lex.runLexiconAudit(10),
      lex.ingestCorpusFromNews(),
    ]);
    return { audit, corpus };
  });
