import { Link, useRouter } from "@tanstack/react-router";
import { Camera, Home, BookOpen, Map as MapIcon, Settings, LogOut, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

type Item = { to: "/home" | "/dex" | "/capture" | "/review" | "/map" | "/settings"; label: string; icon: typeof Home };

const items: Item[] = [
  { to: "/home", label: "ホーム", icon: Home },
  { to: "/dex", label: "図鑑", icon: BookOpen },
  { to: "/capture", label: "撮る", icon: Camera },
  { to: "/review", label: "復習", icon: Sparkles },
  { to: "/map", label: "マップ", icon: MapIcon },
  { to: "/settings", label: "設定", icon: Settings },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/home" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground text-sm font-bold">C</div>
            <span className="text-base font-semibold tracking-tight">
              {title ?? "Catchwords"}
            </span>
          </Link>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="サインアウト"
          >
            <LogOut className="h-3.5 w-3.5" />
            ログアウト
          </button>
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
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
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
