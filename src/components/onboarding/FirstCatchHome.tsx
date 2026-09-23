import type { ReactNode } from "react";
import { Home, BookOpen, Camera, Sparkles, Settings } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { DayMasthead, DayCollage, HomeEmptyState } from "@/routes/_authenticated/home";
import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import { useT } from "@/lib/i18n";

export function FirstCatchShell({
  children,
  tab = 0,
  camera = false,
}: {
  children: ReactNode;
  tab?: number;
  camera?: boolean;
}) {
  const t = useT();
  return (
    <div className="first-shell">
      {!camera && (
        <header>
          <div className="first-brand">
            <img src="/icon-192.png" alt="" />
            CatchWords
          </div>
        </header>
      )}
      <main className={camera ? "" : "first-content"}>{children}</main>
      <TabBar cursor={tab} onCamera={camera} indicatorOpacity={camera ? 0 : 1}>
        {[Home, BookOpen, Camera, Sparkles, Settings].map((Icon, i) => (
          <li key={i} className="relative z-10 flex-1">
            <button
              type="button"
              disabled
              className="tabbar__cell w-full"
              aria-current={i === tab ? "page" : undefined}
            >
              <Icon className="h-5 w-5" />
              <span>
                {t(["nav.home", "nav.dex", "nav.camera", "nav.review", "nav.settings"][i])}
              </span>
            </button>
          </li>
        ))}
      </TabBar>
    </div>
  );
}
/** The exact components used by Home, with the actual captured photo. */
export function FirstCatchHome({ draft }: { draft: FirstCatch | null }) {
  const sticker = draft && firstCatchSticker(draft);
  return (
    <FirstCatchShell>
      <DayMasthead date={new Date(draft?.capturedAt ?? Date.now())} />
      <section data-tour="home">
        {sticker ? <DayCollage stickers={[sticker]} onOpen={() => {}} /> : (
          <>
            <img className="first-home-photo" src="/first-catch-cafe.webp" alt="" />
            <HomeEmptyState />
          </>
        )}
      </section>
    </FirstCatchShell>
  );
}
