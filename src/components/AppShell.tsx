import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Home, BookOpen, Settings, Sparkles, ScanLine } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { logAppEvent } from "@/lib/metrics.functions";
import { useT } from "@/lib/i18n";
import { unlockAudio, Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { PlaceMemoryWatcher } from "@/components/PlaceMemory";

type Item = { to: "/home" | "/dex" | "/scan" | "/review" | "/settings"; labelKey: string; icon: typeof Home };

// 5-item bottom nav (roadmap B5): the center slot is the one big camera
// entrance — scan (かざす=調べる) with the catch/keyboard entrances inside it.
// ラベルは表示言語設定(ja/en)に従う。
const items: Item[] = [
  { to: "/home", labelKey: "nav.home", icon: Home },
  { to: "/dex", labelKey: "nav.dex", icon: BookOpen },
  { to: "/scan", labelKey: "nav.camera", icon: ScanLine },
  { to: "/review", labelKey: "nav.review", icon: Sparkles },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const logEvent = useServerFn(logAppEvent);
  const t = useT();

  // KPI (roadmap §3): one app_open per local day → D1/D7 retention source.
  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA");
      if (localStorage.getItem("kpi-app-open") !== today) {
        localStorage.setItem("kpi-app-open", today);
        void logEvent({ data: { kind: "app_open" } }).catch(() => {});
      }
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Top chrome — a translucent material the content scrolls under (§12),
          with a bright top edge catching light and a bottom scroll-edge hairline
          instead of a hard divider. */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-xl backdrop-saturate-150 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/home" className="flex items-center gap-2 transition-transform duration-150 active:scale-95">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-sm font-bold text-primary-foreground shadow-md shadow-primary/30">
              C
            </div>
            {/* §15: app title is a small headline — tight tracking, no wrapping. */}
            <span className="text-base font-semibold tracking-[-0.02em]">{title ?? "Catchwords"}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

      {/* 場所による思い出し。どの画面にいても効くよう、殻の側に置く。
          設定でONにした人だけ動く(既定はOFF)。 */}
      <PlaceMemoryWatcher />

      {/* Bottom tab bar — a floating translucent material (§12: .app-sheet gives
          the glass, a bright top edge, and an upward shadow because it's a large
          surface; reduced-transparency/contrast collapse it to solid). */}
      <nav className="app-sheet fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-between px-2 py-2">
          {items.map(({ to, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const isScan = to === "/scan";
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  data-nav={to}
                  onClick={() => {
                    // §13 multimodal feedback on the causal event; the camera
                    // entrance also primes audio for the scan/catch chimes.
                    if (isScan) {
                      unlockAudio();
                      Sound.tap();
                      haptic("medium");
                    } else {
                      Sound.pageSnap();
                      haptic("selection");
                    }
                  }}
                  // §1 Response: react on press, not release.
                  className="group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] text-muted-foreground transition-colors"
                  activeProps={{ className: "text-primary" }}
                >
                  {isScan ? (
                    <span className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-background transition-transform duration-150 [transition-timing-function:var(--spring-bounce)] group-active:scale-90">
                      <Icon className="h-6 w-6" />
                    </span>
                  ) : (
                    <Icon className="h-5 w-5 transition-transform duration-150 group-active:scale-90" />
                  )}
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// Legacy re-export kept so any dead references still compile.
export { BookOpen };
