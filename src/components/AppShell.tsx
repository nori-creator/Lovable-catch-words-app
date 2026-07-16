import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine, MoreHorizontal, BookOpen, Sparkles, Home as HomeIcon, Settings as SettingsIcon, MapPin, Users, Bell, PenSquare, BookOpenCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { logAppEvent } from "@/lib/metrics.functions";
import { unlockAudio, Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * New shell (redesign v2):
 *   ┌────────────────────────────────────────┐
 *   │  [Home │ Museum]              (…)     │  ← top segmented + more
 *   │                                        │
 *   │         page content                   │
 *   │                                        │
 *   │             (●)  breathing scan FAB    │
 *   └────────────────────────────────────────┘
 *
 * Bottom 5-tab nav removed. Home and Museum are the only always-visible
 * destinations; the FAB is the scan entrance. Everything else lives inside
 * the More sheet (Review, Journal, Feed, Map, Notifications, Settings).
 */

type Path = string;

const MORE_LINKS: { to: Path; label: string; icon: typeof HomeIcon }[] = [
  { to: "/review", label: "復習", icon: Sparkles },
  { to: "/journal", label: "日記", icon: PenSquare },
  { to: "/map", label: "マップ", icon: MapPin },
  { to: "/feed", label: "みんな", icon: Users },
  { to: "/notifications", label: "通知", icon: Bell },
  { to: "/discover", label: "探索", icon: BookOpenCheck },
  { to: "/settings", label: "設定", icon: SettingsIcon },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const logEvent = useServerFn(logAppEvent);
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // KPI: one app_open per local day.
  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA");
      if (localStorage.getItem("kpi-app-open") !== today) {
        localStorage.setItem("kpi-app-open", today);
        void logEvent({ data: { kind: "app_open" } }).catch(() => {});
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active: "home" | "museum" | "other" =
    location.pathname.startsWith("/home") ? "home"
    : location.pathname.startsWith("/dex") ? "museum"
    : "other";

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ─── Top segmented nav ─── */}
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <nav className="seg-pill flex items-center gap-1 rounded-full p-1 shadow-lg">
            <SegLink to="/home" label="Home" active={active === "home"} />
            <SegLink to="/dex" label="Museum" active={active === "museum"} />
          </nav>
          <button
            aria-label="その他"
            onClick={() => { haptic("light"); Sound.tap(); setMoreOpen(true); }}
            className="seg-pill lift-soft grid h-10 w-10 place-items-center rounded-full text-foreground/80 shadow-lg"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        {title && (
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
            {title}
          </p>
        )}
      </header>

      {/* ─── Page ─── */}
      <main className="mx-auto max-w-3xl">
        {children}
      </main>

      {/* ─── Breathing scan FAB (hidden on the scan page itself) ─── */}
      {!location.pathname.startsWith("/scan") && (
        <Link
          to="/scan"
          aria-label="スキャン"
          onClick={() => { unlockAudio(); Sound.tap(); haptic("medium"); }}
          className="fixed left-1/2 z-40 -translate-x-1/2 rounded-full bg-gradient-to-br from-primary to-[color:oklch(0.75_0.18_240)] text-primary-foreground breathe grid h-16 w-16 place-items-center"
          style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        >
          <ScanLine className="h-7 w-7 drop-shadow" />
        </Link>
      )}

      {/* ─── More sheet ─── */}
      {moreOpen && (
        <MoreSheet onClose={() => setMoreOpen(false)} />
      )}
    </div>
  );
}

function SegLink({ to, label, active }: { to: Path; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      onClick={() => { Sound.pageSnap(); haptic("selection"); }}
      className={[
        "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "text-foreground/70 hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md animate-fade-in" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-t-[2rem] border-t border-white/10 bg-card p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-slide-in-right"
        style={{ animation: "fade-in 0.25s ease-out, float-up 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/20" />
        <div className="grid grid-cols-4 gap-2">
          {MORE_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => { Sound.tap(); haptic("light"); onClose(); }}
              className="lift-soft flex flex-col items-center gap-1.5 rounded-2xl bg-secondary/60 px-2 py-4 text-center"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium text-foreground/85">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// Legacy re-exports kept so any dead references still compile
export { BookOpen };
