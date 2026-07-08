import { Link } from "@tanstack/react-router";
import { Home, BookOpen, Settings, Sparkles, ScanLine } from "lucide-react";
import { type ReactNode } from "react";

type Item = { to: "/home" | "/dex" | "/scan" | "/review" | "/settings"; label: string; icon: typeof Home };

// 5-item nav (roadmap B5): the center slot is the one big camera entrance —
// scan (かざす=調べる) with the catch/keyboard entrances living inside it.
const items: Item[] = [
  { to: "/home", label: "ホーム", icon: Home },
  { to: "/dex", label: "図鑑", icon: BookOpen },
  { to: "/scan", label: "スキャン", icon: ScanLine },
  { to: "/review", label: "復習", icon: Sparkles },
  { to: "/settings", label: "設定", icon: Settings },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
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
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-between px-2 py-2">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <Link
                to={to}
                data-nav={to}
                className="group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary" }}
              >
                {to === "/scan" ? (
                  <span className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-background transition-transform group-active:scale-95">
                    <Icon className="h-6 w-6" />
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
