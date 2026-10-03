import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { checkIsAdmin } from "@/lib/admin.functions";
import { BetaDashboard } from "@/components/AdminBetaViews";
import { betaLabels } from "@/components/admin-beta-labels";
import { useUiLang } from "@/lib/i18n";

/**
 * **ベータの指標（開発者だけ）**（ロードマップ Phase 9.4 / 11、2026-10-03）。中身は
 * `components/AdminBetaViews.tsx`。このファイルからは `Route` 以外を出さない
 * （出すとグラフの部品が最初に読む塊に入る。`admin.users.tsx` と同じ理由）。
 * 管理者かどうかはサーバでも確かめる（`beta-metrics.functions.ts` の `requireAdmin`）。
 */
export const Route = createFileRoute("/_authenticated/admin/beta")({
  head: () => ({
    meta: [{ title: "Beta — CatchWords admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminBetaPage,
});

function AdminBetaPage() {
  const adminFn = useServerFn(checkIsAdmin);
  const { data: adm } = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn() });
  const lb = betaLabels(useUiLang());
  if (adm && !adm.isAdmin) {
    return (
      <AppShell title="Beta">
        <p className="text-body text-muted-foreground">Admin only</p>
      </AppShell>
    );
  }
  return <AppShell title={lb("title")}>{adm?.isAdmin ? <BetaDashboard /> : null}</AppShell>;
}
