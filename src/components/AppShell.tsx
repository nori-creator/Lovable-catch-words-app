import { Link, useRouter } from "@tanstack/react-router";
import { Camera, Home, BookOpen, Settings, LogOut, Sparkles, Map as MapIcon, Rss, BookText, Bell, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { unreadNotificationCount } from "@/lib/notifications.functions";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

type Item = { to: "/home" | "/feed" | "/capture" | "/review" | "/dex"; label: string; icon: typeof Home };

const items: Item[] = [
  { to: "/home", label: "ホーム", icon: Home },
  { to: "/feed", label: "フィード", icon: Rss },
  { to: "/capture", label: "撮る", icon: Camera },
  { to: "/review", label: "復習", icon: Sparkles },
  { to: "/dex", label: "図鑑", icon: BookOpen },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchUnread = useServerFn(unreadNotificationCount);
  const { data: unread } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => fetchUnread(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadCount = unread?.count ?? 0;

  // Realtime notifications: refresh badge + toast when a new notification arrives
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId || cancelled) return;
      const ch = supabase.channel(`notif:${userId}:${Math.random().toString(36).slice(2)}`);
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          const type = (payload.new as { type?: string }).type;
          const msg = type === "like" ? "❤️ いいねが届きました" : type === "comment" ? "💬 コメントが届きました" : type === "follow" ? "👤 新しいフォロワー" : "🔔 新しい通知";
          toast(msg);
        },
      ).subscribe();
      channel = ch;
      if (cancelled) supabase.removeChannel(ch);
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);


  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/home" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-primary-foreground text-sm font-bold shadow-md shadow-primary/30">C</div>
            <span className="text-base font-semibold tracking-tight">
              {title ?? "Catchwords"}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/notifications" aria-label="通知" className="relative rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link to="/journal" aria-label="日記" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <BookText className="h-4 w-4" />
            </Link>
            <Link to="/discover" aria-label="ランキング" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Trophy className="h-4 w-4" />
            </Link>
            <Link to="/map" aria-label="マップ" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <MapIcon className="h-4 w-4" />
            </Link>
            <Link to="/settings" aria-label="設定" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Settings className="h-4 w-4" />
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="サインアウト"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-between px-2 py-2">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className="group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary" }}
              >
                {to === "/capture" ? (
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-primary-foreground shadow-lg shadow-primary/30">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
