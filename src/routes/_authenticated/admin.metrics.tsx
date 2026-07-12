import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { checkIsAdmin } from "@/lib/admin.functions";
import { getAdminDashboard } from "@/lib/metrics.functions";
import { BarChart3, Users } from "lucide-react";

/** KPI dashboard (roadmap §3) — admin only, one screen, numbers over charts. */
export const Route = createFileRoute("/_authenticated/admin/metrics")({
  head: () => ({ meta: [{ title: "KPI — Catchwords 管理" }, { name: "robots", content: "noindex" }] }),
  component: AdminMetricsPage,
});

function AdminMetricsPage() {
  const adminFn = useServerFn(checkIsAdmin);
  const dashFn = useServerFn(getAdminDashboard);
  const { data: adm } = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn() });
  const { data: dash, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => dashFn(),
    enabled: adm?.isAdmin === true,
    staleTime: 60_000,
  });

  if (adm && !adm.isAdmin) {
    return (
      <AppShell title="KPI">
        <p className="text-sm text-muted-foreground">このページは管理者専用です。</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="KPI">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BarChart3 className="h-5 w-5 text-primary" /> KPIダッシュボード
        </h1>
        <Link to="/admin/dictionary" className="text-xs text-primary underline">
          辞書管理へ
        </Link>
      </div>

      {isLoading || !dash ? (
        <div className="h-48 animate-pulse rounded-2xl bg-secondary" />
      ) : (
        <>
          {/* Funnel */}
          <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" /> ファネル(累計)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["登録", dash.funnel.users_total],
                ["オンボ完了", dash.funnel.users_onboarded],
                ["初スキャン", dash.funnel.users_first_scan],
                ["初キャッチ", dash.funnel.users_first_catch],
                ["D1継続", dash.funnel.d1_retention_pct != null ? `${dash.funnel.d1_retention_pct}%` : "—"],
              ].map(([label, v]) => (
                <div key={String(label)} className="rounded-xl bg-secondary/60 p-3 text-center">
                  <div className="text-lg font-bold">{v}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              目標(β): 初キャッチ到達 ≥80% / D1 ≥40%(ロードマップ§3)
            </p>
          </section>

          {/* Daily table */}
          <section className="overflow-x-auto rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">日次(直近14日)</h2>
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">日付</th>
                  <th className="pb-2 font-medium">アクティブ</th>
                  <th className="pb-2 font-medium">スキャン</th>
                  <th className="pb-2 font-medium">タップ</th>
                  <th className="pb-2 font-medium">キャッチ</th>
                  <th className="pb-2 font-medium">復習添削</th>
                </tr>
              </thead>
              <tbody>
                {dash.days.map((d) => (
                  <tr key={d.day} className="border-t border-border/60">
                    <td className="py-1.5">{d.day.slice(5)}</td>
                    <td className="py-1.5">{d.active_users}</td>
                    <td className="py-1.5">{d.scans}</td>
                    <td className="py-1.5">{d.taps}</td>
                    <td className="py-1.5 font-semibold">{d.catches}</td>
                    <td className="py-1.5">{d.reviews}</td>
                  </tr>
                ))}
                {dash.days.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted-foreground">
                      まだデータがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AppShell>
  );
}
