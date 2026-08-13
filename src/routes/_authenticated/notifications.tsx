import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { SOCIAL_ENABLED } from "@/lib/features";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications.functions";
import { Heart, MessageCircle, UserPlus, Bell } from "lucide-react";
import { useTimeAgo } from "@/lib/timeago";
import { useT } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/notifications")({
  // みんなの投稿まわりはまだ出さない(src/lib/features.ts に理由)。
  // どこからも辿り着けないうえ誰も投稿できず、通報もブロックも無い。
  // URLを直接打った人だけが永久に空の画面に着く状態なので、ホームへ返す。
  beforeLoad: () => {
    if (!SOCIAL_ENABLED) throw redirect({ to: "/home" });
  },
  head: () => ({ meta: [{ title: tStatic("page.notifications") }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const t = useT();
  const fmtAgo = useTimeAgo();
  const qc = useQueryClient();
  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markAllNotificationsRead);
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => fetchList() });

  useEffect(() => {
    markRead()
      .then(() => {
        // Refresh both the unread badge AND this list, so the per-row "unread"
        // highlight clears on the same visit that marks them read.
        qc.invalidateQueries({ queryKey: ["notifications-unread"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .catch(() => {
        /* a failed mark-read is non-fatal; the badge just stays until next visit */
      });
  }, [markRead, qc]);

  const items = data ?? [];

  return (
    <AppShell title={t("notif.title")}>
      {items.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Bell className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("notif.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon =
              n.type === "like" ? Heart : n.type === "comment" ? MessageCircle : UserPlus;
            const verb =
              n.type === "like"
                ? t("notif.liked")
                : n.type === "comment"
                  ? t("notif.commented")
                  : t("notif.followed");
            const color =
              n.type === "like"
                ? "text-rose-500"
                : n.type === "comment"
                  ? "text-sky-500"
                  : "text-emerald-500";
            const inner = (
              <div
                className={`lift-soft flex items-center gap-3 rounded-2xl border border-border bg-card p-3 ${!n.read_at ? "ring-1 ring-primary/20" : ""}`}
              >
                {n.actor?.avatar_url ? (
                  <img
                    src={n.actor.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">
                    {(n.actor?.display_name ?? "?").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">
                      {n.actor?.display_name ?? t("common.someone")}
                    </span>
                    <span className="text-muted-foreground">{verb}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtAgo(n.created_at)}</p>
                </div>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            );
            if (n.post_id && (n.type === "like" || n.type === "comment")) {
              return (
                <li key={n.id}>
                  <Link to="/post/$postId" params={{ postId: n.post_id }}>
                    {inner}
                  </Link>
                </li>
              );
            }
            if (n.actor?.id && n.type === "follow") {
              return (
                <li key={n.id}>
                  <Link to="/u/$userId" params={{ userId: n.actor.id }}>
                    {inner}
                  </Link>
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
