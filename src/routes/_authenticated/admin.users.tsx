import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { checkIsAdmin } from "@/lib/admin.functions";
import { UserDetail, UserList } from "@/components/AdminUsersViews";

/**
 * **開発者だけ: 利用者ごとの詳しい情報**（オーナー指示 2026-09-27）。中身は
 * `components/AdminUsersViews.tsx`。このファイルからは `Route` 以外を出さない — 出すと
 * 画面の部品とグラフの部品（recharts）が最初に読む塊に入る（2026-10-03）。
 */
export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [{ title: "Users — CatchWords 管理" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (s: Record<string, unknown>): { u?: string } =>
    typeof s.u === "string" && /^[0-9a-f-]{36}$/.test(s.u) ? { u: s.u } : {},
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const adminFn = useServerFn(checkIsAdmin);
  const { data: adm } = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn() });
  const { u } = Route.useSearch();
  if (adm && !adm.isAdmin) {
    return (
      <AppShell title="Users">
        <p className="text-body text-muted-foreground">このページは管理者専用です。</p>
      </AppShell>
    );
  }
  return (
    <AppShell title="Users">
      {adm?.isAdmin ? u ? <UserDetail id={u} /> : <UserList /> : null}
    </AppShell>
  );
}
