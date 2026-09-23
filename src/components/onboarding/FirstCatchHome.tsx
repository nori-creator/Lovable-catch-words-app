import type { ReactNode } from "react";
import { Home, BookOpen, Camera, Sparkles, Settings } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { DayMasthead, DayCollage } from "@/routes/_authenticated/home";
import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import { useT } from "@/lib/i18n";
import { useTargetLang } from "@/lib/target-lang-pref";
import { CardSchema } from "@/lib/card-schema";

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
export function FirstCatchHome({
  draft,
  animated = false,
}: {
  draft: FirstCatch | null;
  animated?: boolean;
}) {
  const t = useT();
  const target = useTargetLang();
  const sticker = draft && firstCatchSticker(draft);
  const sample = firstCatchSticker({
    version: 1,
    id: "00000000-0000-4000-8000-000000000001",
    uiLanguage: draft?.uiLanguage ?? "ja",
    targetLanguage: draft?.targetLanguage ?? target,
    dailyMinutes: 10,
    stage: "home",
    photo: "/first-catch-cafe.webp",
    capturedAt: "2026-09-23T09:00:00.000Z",
    card: CardSchema.parse({
      headword_zh: (draft?.targetLanguage ?? target) === "en" ? "coffee" : "咖啡",
      meaning_ja: t("first.sampleCoffee"),
      category_key: "drink",
      level: "",
    }),
  })!;
  return (
    <FirstCatchShell>
      <DayMasthead date={new Date(draft?.capturedAt ?? Date.now())} />
      <section data-tour="home">
        {!sticker && <p className="first-sample-label">{t("first.sampleAlbum")}</p>}
        <div inert={!sticker}>
          <DayCollage
            stickers={[sticker ?? sample]}
            opening={animated && !sticker}
            onOpen={() => {}}
          />
        </div>
      </section>
    </FirstCatchShell>
  );
}
