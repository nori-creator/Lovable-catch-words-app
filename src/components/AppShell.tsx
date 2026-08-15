import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Home, BookOpen, Settings, Sparkles, Camera } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { logAppEvent } from "@/lib/metrics.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useT } from "@/lib/i18n";
import { unlockAudio, Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { PlaceMemoryWatcher } from "@/components/PlaceMemory";
import { useScrolled } from "@/hooks/use-scrolled";

type Item = {
  to: "/home" | "/dex" | "/capture" | "/review" | "/settings";
  labelKey: string;
  icon: typeof Home;
};

// 5-item bottom nav (roadmap B5): the center slot is the one big camera
// entrance.
// 2026-08-03 NORI指定で**カメラのフロー(/capture)に戻した**。撮る→自撮り→
// 候補→切り抜き→図鑑にドン、という一本道がこのアプリの体験そのものだから。
// かざして調べるスキャン(/scan)はカメラ画面の中から開ける。
const items: Item[] = [
  { to: "/home", labelKey: "nav.home", icon: Home },
  { to: "/dex", labelKey: "nav.dex", icon: BookOpen },
  { to: "/capture", labelKey: "nav.camera", icon: Camera },
  { to: "/review", labelKey: "nav.review", icon: Sparkles },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

/**
 * ヘッダーの丸アイコン。設定で顔写真を登録していればそれを出す。
 * 「自分の写真が毎画面にいる」ほうがアプリに愛着が湧く(NORI指定)。
 * 未設定のうちは従来のマークにフォールバックするので、写真が無くても崩れない。
 * (ログイン画面のアイコンとアプリアイコンは別途差し替える予定。)
 */
function BrandMark() {
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 5 * 60 * 1000,
  });
  const avatar = (profile as { avatar_url?: string | null } | undefined)?.avatar_url;
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-xl object-cover shadow-md ring-1 ring-black/5"
      />
    );
  }
  return (
    <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-sm font-bold text-primary-foreground shadow-md shadow-primary/30">
      C
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const logEvent = useServerFn(logAppEvent);
  const t = useT();
  const scrolled = useScrolled();

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
      {/* Top chrome — a translucent material the content scrolls under (§12).
          区切り線は常設しない: 中身が実際に下に潜り込んだときだけ、柔らかい
          縁がふわっと出る。何も潜っていないうちは境目そのものが無い。 */}
      <header
        data-scrolled={scrolled ? "true" : undefined}
        className="scroll-edge sticky top-0 z-30 bg-background/70 backdrop-blur-xl backdrop-saturate-150 pt-[env(safe-area-inset-top)]"
      >
        {/* 高さは `--app-header-h` に固定する。図鑑の部屋見出しがこの下端で
            止まる約束になっているので、ここが伸び縮みすると見出しが裏に潜る。 */}
        <div className="mx-auto flex min-h-[var(--app-header-h)] max-w-3xl items-center justify-between px-4 py-3">
          <Link
            to="/home"
            className="flex items-center gap-2 transition-transform duration-150 active:scale-95"
          >
            <BrandMark />
            {/* §15: app title is a small headline — tight tracking, no wrapping.
                **ここは h1 にしない。** 一度 h1 にしたが、ホーム・復習・
                単語カードにはすでに h1 があるので、**全ページが h1 を2つ
                持つ**ことになった — 直そうとした階層をむしろ壊していた。
                これはどの画面にも出るアプリ名(道標)であって、その画面の
                見出しではない。h1 は各画面が自分で持つ。 */}
            <span className="text-base font-semibold tracking-[-0.02em]">
              {title ?? "Catchwords"}
            </span>
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
            const isScan = to === "/capture";
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
                    // グラデーションの終点を**トークンから作る**。
                    // `oklch(0.72 0.18 240)` と直に書いていたので、テーマや
                    // 主色を測って直しても**ここだけ置き去り**になり、白い
                    // アイコンに対して 2.37:1 だった(図形の下限 3:1 未満)。
                    // 主色より必ず暗い側へ寄せるので、白は主色の上と同等以上に読める。
                    <span className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-[linear-gradient(to_bottom_right,var(--primary),color-mix(in_oklab,var(--primary)_78%,black))] text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-background transition-transform duration-150 [transition-timing-function:var(--spring-bounce)] group-active:scale-90">
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
