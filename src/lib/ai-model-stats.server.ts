/**
 * **AI の速さと正確さの表の読み出し**（数え方は `ai-model-stats.ts`、口は `admin-ai.functions.ts` の
 * `adminGetAiStats`）。管理者だけ。
 *
 * 読む物: `ai_runs` の決まった loop（`AI_STATS_LOOPS`）の持ち主・種類・時刻・`meta` だけ。
 * どの loop の `meta` にも語・写真・文は入っていない（`ai_call` は機能・用途・モデル・時間・量、
 * `candidate_pick` は順位と数、ほかは各回の結果）。返すのは数だけ — 誰の行かは返さない。
 * `ai_runs` は本人の行しか読めない（RLS）ので、管理者と確かめてからサーバの鍵で読む。
 */
import { readAllPages } from "./pagination";
import {
  AI_STATS_DAYS,
  AI_STATS_LOOPS,
  computeAiModelStats,
  type AiModelStatsReport,
  type AiStatsDays,
  type AiStatsRow,
} from "./ai-model-stats";

/** 読む行の上限（30 日・全員でも足りる量。超えたら `truncated`）。 */
const MAX_ROWS = 60_000;

export type AiStatsInput = { days: AiStatsDays; mine: boolean };

export function parseAiStatsInput(raw: unknown): AiStatsInput {
  const v = (raw ?? {}) as { days?: unknown; mine?: unknown };
  const days = (AI_STATS_DAYS as readonly number[]).includes(Number(v.days))
    ? (Number(v.days) as AiStatsDays)
    : 7;
  return { days, mine: v.mine === true };
}

type RoleClient = {
  rpc: (
    fn: "has_role",
    args: { _user_id: string; _role: "admin" },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function loadAiModelStats(
  context: { supabase: unknown; userId: string },
  input: AiStatsInput,
  now: Date = new Date(),
): Promise<{ isAdmin: false } | ({ isAdmin: true; truncated: boolean } & AiModelStatsReport)> {
  const { data: isAdmin, error } = await (context.supabase as RoleClient).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) return { isAdmin: false };

  const since = new Date(now.getTime() - input.days * 86_400_000).toISOString();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { rows, truncated } = await readAllPages<AiStatsRow>(
    (a, b) => {
      let q = supabaseAdmin
        .from("ai_runs")
        .select("user_id, loop, created_at, meta")
        .in("loop", [...AI_STATS_LOOPS])
        .gte("created_at", since);
      if (input.mine) q = q.eq("user_id", context.userId);
      return q.order("id").range(a, b);
    },
    { maxRows: MAX_ROWS },
  );
  if (truncated) console.warn(`[ai-stats] read capped at ${MAX_ROWS} rows (${input.days} days)`);
  return {
    isAdmin: true,
    truncated,
    ...computeAiModelStats(rows, { days: input.days, mine: input.mine, since }),
  };
}
