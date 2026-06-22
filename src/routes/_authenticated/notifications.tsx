import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications.functions";
import { Heart, MessageCircle, UserPlus, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "通知 — Catchwords" }] }),
  component: NotificationsPage,
});

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}

function NotificationsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markAllNotificationsRead);
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => fetchList() });

  useEffect(() => {
    markRead().then(() => {
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    });
  }, [markRead, qc]);

  const items = data ?? [];

  return (
    <AppShell title="通知">
      {items.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Bell className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">まだ通知はありません</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = n.type === "like" ? Heart : n.type === "comment" ? MessageCircle : UserPlus;
            const verb = n.type === "like" ? "がいいねしました" : n.type === "comment" ? "がコメントしました" : "がフォローしました";
            const color = n.type === "like" ? "text-rose-500" : n.type === "comment" ? "text-sky-500" : "text-emerald-500";
            const inner = (
              <div className={`lift-soft flex items-center gap-3 rounded-2xl border border-border bg-card p-3 ${!n.read_at ? "ring-1 ring-primary/20" : ""}`}>
                {n.actor?.avatar_url ? (
                  <img src={n.actor.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">
                    {(n.actor?.display_name ?? "?").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{n.actor?.display_name ?? "誰か"}</span>
                    <span className="text-muted-foreground">{verb}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            );
            if (n.post_id && (n.type === "like" || n.type === "comment")) {
              return (
                <li key={n.id}>
                  <Link to="/post/$postId" params={{ postId: n.post_id }}>{inner}</Link>
                </li>
              );
            }
            if (n.actor?.id && n.type === "follow") {
              return (
                <li key={n.id}>
                  <Link to="/u/$userId" params={{ userId: n.actor.id }}>{inner}</Link>
                </li>
              );
            }
            return <li key={n.id}>{inner}</li>;
          })}
        </ul>
      )}
    </AppShell>
  );
}
