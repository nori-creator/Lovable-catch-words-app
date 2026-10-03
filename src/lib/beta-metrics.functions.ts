import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays } from "./admin-user-stats";
import {
  BETA_DATA_DAYS,
  computeBetaMetrics,
  DEFAULT_UNIT_COST_USD,
  normalizeUnitCosts,
  unitCostOverrides,
  type BetaMetrics,
  type BetaRawData,
} from "./beta-metrics";
import { FUNNEL_LATENCY_LOOP, FUNNEL_ROOT } from "./funnel-events";
import { readAllPages } from "./pagination";
import { taipeiDay } from "./taipei-day";

/**
 * **ベータの指標（開発者だけ、`/admin/beta`）**（ロードマップ Phase 9.4 / 11、2026-10-03）。
 *
 * 読む物: 口座（匿名か・登録日だけ。メールは読まない）、管理者の役、利用の記録の種類と時刻、
 * 撮った札と復習の答えの時刻、`ai_runs` の loop と時刻（最初のキャッチと候補の待ち時間だけは
 * 成否と ms）、`app_config` の `funnel:` と `first-catch-run:` の鍵。
 * **読まない物**: 写真、語、答えの中身、メール、場所、IP。
 *
 * PostgREST は1回に1000行で切るので、全部 `readAllPages` で1000行ずつ読む。
 * 数え方は `beta-metrics.ts`（純粋な関数・試験あり）。
 */

async function requireAdmin(context: { supabase: unknown; userId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

/** 単価の上書きを置く `app_config` の鍵。 */
export const BETA_UNIT_COSTS_KEY = "beta_unit_costs";

export const getBetaMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BetaMetrics> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const today = taipeiDay();
    const fromDay = addDays(today, -(BETA_DATA_DAYS - 1));
    const since = new Date(`${fromDay}T00:00:00+08:00`).toISOString();
    const since30 = new Date(`${addDays(today, -29)}T00:00:00+08:00`).toISOString();

    // 口座: 匿名か・作った時刻だけ（1000人ずつ）。
    const accounts: Array<{ id: string; created_at: string; is_anonymous?: boolean }> = [];
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      for (const u of data.users)
        accounts.push({ id: u.id, created_at: u.created_at, is_anonymous: u.is_anonymous });
      if (data.users.length < 1000) break;
    }

    const [roles, usage, stickers, history, runsAll, runsMeta, funnel, guestRuns, costRow] =
      await Promise.all([
        db.from("user_roles").select("user_id").eq("role", "admin"),
        readAllPages<{ user_id: string; kind: string; created_at: string }>((a, b) =>
          db
            .from("usage_events")
            .select("user_id, kind, created_at")
            .gte("created_at", since)
            .order("id")
            .range(a, b),
        ),
        readAllPages<{ user_id: string; created_at: string }>((a, b) =>
          db
            .from("stickers")
            .select("user_id, created_at")
            .gte("created_at", since)
            .order("id")
            .range(a, b),
        ),
        readAllPages<{ user_id: string; reviewed_at: string }>((a, b) =>
          db
            .from("review_history")
            .select("user_id, reviewed_at")
            .gte("reviewed_at", since)
            .order("id")
            .range(a, b),
        ),
        readAllPages<{ user_id: string; loop: string; created_at: string }>((a, b) =>
          db
            .from("ai_runs")
            .select("user_id, loop, created_at")
            .gte("created_at", since30)
            .order("id")
            .range(a, b),
        ),
        // 成否と待ち時間（meta）は、最初のキャッチと候補の待ち時間の行だけ読む
        // （他の loop の meta には語が入る物がある）。
        readAllPages<{
          user_id: string;
          loop: string;
          created_at: string;
          accepted: number;
          meta: { ms?: unknown; action?: unknown; ok?: unknown } | null;
        }>((a, b) =>
          db
            .from("ai_runs")
            .select("user_id, loop, created_at, accepted, meta")
            .in("loop", ["first_catch_ai", FUNNEL_LATENCY_LOOP])
            .gte("created_at", since30)
            .order("id")
            .range(a, b),
        ),
        readAllPages<{ key: string }>((a, b) =>
          db
            .from("app_config")
            .select("key")
            .like("key", `${FUNNEL_ROOT}%`)
            .gte("key", `${FUNNEL_ROOT}${fromDay}`)
            .order("key")
            .range(a, b),
        ),
        readAllPages<{
          key: string;
          value: { ms?: unknown; action?: unknown; refunded?: unknown };
        }>((a, b) =>
          db
            .from("app_config")
            .select("key, value")
            .like("key", "first-catch-run:%")
            .order("key")
            .range(a, b),
        ),
        db.from("app_config").select("value").eq("key", BETA_UNIT_COSTS_KEY).maybeSingle(),
      ]);
    if (roles.error) throw new Error(roles.error.message);

    const admins = new Set<string>((roles.data ?? []).map((r: { user_id: string }) => r.user_id));
    const anonIds = accounts.filter((a) => a.is_anonymous).map((a) => a.id);
    const users = accounts
      .filter((a) => !a.is_anonymous && !admins.has(a.id))
      .map((a) => ({ id: a.id, signupDay: taipeiDay(a.created_at) }));
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

    const raw: BetaRawData = {
      today,
      users,
      anonIds,
      usage: usage.rows.map((e) => ({
        user_id: e.user_id,
        kind: e.kind,
        day: taipeiDay(e.created_at),
      })),
      catches: stickers.rows.map((s) => ({ user_id: s.user_id, day: taipeiDay(s.created_at) })),
      reviews: history.rows.map((r) => ({ user_id: r.user_id, at: r.reviewed_at })),
      funnelKeys: funnel.rows.map((r) => r.key),
      latencies: runsMeta.rows
        .filter((r) => r.loop === FUNNEL_LATENCY_LOOP && num(r.meta?.ms) != null)
        .map((r) => ({
          user_id: r.user_id,
          day: taipeiDay(r.created_at),
          ms: num(r.meta?.ms) as number,
        })),
      runs: [
        ...runsMeta.rows
          .filter((r) => r.loop === "first_catch_ai")
          .map((r) => ({
            source: "member" as const,
            user_id: r.user_id,
            day: taipeiDay(r.created_at),
            ok: r.accepted > 0,
            ms: num(r.meta?.ms),
            action: typeof r.meta?.action === "string" ? r.meta.action : "unknown",
          })),
        ...guestRuns.rows.flatMap((r) => {
          const m = /^first-catch-run:(\d{4}-\d{2}-\d{2}):(ok|fail):/.exec(r.key);
          if (!m) return [];
          return [
            {
              source: "guest" as const,
              day: m[1],
              ok: m[2] === "ok",
              ms: num(r.value?.ms),
              action: typeof r.value?.action === "string" ? r.value.action : "unknown",
              refunded: r.value?.refunded === true,
            },
          ];
        }),
      ],
      aiRuns: runsAll.rows.map((r) => ({
        user_id: r.user_id,
        loop: r.loop,
        day: taipeiDay(r.created_at),
      })),
      unitCosts: normalizeUnitCosts(costRow?.data?.value),
      truncated: [usage, stickers, history, runsAll, runsMeta, funnel, guestRuns].some(
        (r) => r.truncated,
      ),
    };
    return computeBetaMetrics(raw);
  });

/** 単価の上書きを保存する（管理者だけ。既定と同じ値は保存しない）。 */
export const setBetaUnitCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ costs: z.record(z.string(), z.number().min(0).max(10)) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const overrides = unitCostOverrides(
      Object.fromEntries(Object.entries(data.costs).filter(([k]) => k in DEFAULT_UNIT_COST_USD)),
    );
    const { error } = await context.supabase.from("app_config").upsert({
      key: BETA_UNIT_COSTS_KEY,
      value: overrides as never,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, unitCosts: normalizeUnitCosts(overrides) };
  });
