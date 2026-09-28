import { AppShellFrame } from "../AppShell";
import { AppNavigation } from "../AppNavigation";
import type { ReactNode } from "react";
import { DiaryDate, DayCollage } from "@/routes/_authenticated/home";
import { DexAlbumGrid } from "@/routes/_authenticated/dex";
import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import { useT } from "@/lib/i18n";
import { useTargetLang } from "@/lib/target-lang-pref";
import { CardSchema } from "@/lib/card-schema";

export function sampleStickers(
  draft: FirstCatch | null,
  t: ReturnType<typeof useT>,
  target: ReturnType<typeof useTargetLang>,
) {
  const selected = draft?.targetLanguage ?? target;
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      photo: "/first-catch-cafe.webp",
      word: selected === "en" ? "coffee" : "咖啡",
      meaning: t("first.sampleCoffee"),
      category: "drink",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      photo: "/first-catch-flower.webp",
      word: selected === "en" ? "flower" : "花",
      meaning: t("first.sampleFlower"),
      category: "plant",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      photo: "/first-catch-cat.webp",
      word: selected === "en" ? "cat" : "貓",
      meaning: t("first.sampleCat"),
      category: "animal",
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      photo: "/first-catch-ready.webp",
      word: selected === "en" ? "sea" : "海",
      meaning: t("first.sampleSea"),
      category: "nature",
    },
  ].map(({ id, photo, word, meaning, category }, i) => ({
    ...firstCatchSticker({
      version: 1,
      id,
      uiLanguage: draft?.uiLanguage ?? "ja",
      targetLanguage: selected,
      dailyMinutes: 10,
      stage: "home",
      photo,
      capturedAt: "2026-09-23T09:00:00.000Z",
      card: CardSchema.parse({
        headword_zh: word,
        meaning_ja: meaning,
        category_key: category,
        level: "",
      }),
    })!,
    album_x: i % 2 === 0 ? 0.25 : 0.75,
    album_y: 0.3 + Math.floor(i / 2) * 0.68,
    album_scale: 1.35,
    album_rot: 0,
  }));
}

export function FirstCatchSampleDex({ draft }: { draft: FirstCatch | null }) {
  const t = useT();
  const target = useTargetLang();
  const samples = sampleStickers(draft, t, target);
  return (
    <div className="first-sample-dex">
      <DexAlbumGrid items={samples} onOpen={() => {}} />
    </div>
  );
}

export function FirstCatchShell({
  children,
  tab = 0,
  camera = false,
  fixedViewport = tab === 3,
  onTab,
}: {
  children: ReactNode;
  tab?: number;
  camera?: boolean;
  fixedViewport?: boolean;
  onTab?: (index: number) => void;
}) {
  return (
    <AppShellFrame
      bare={camera}
      immersive={tab === 1}
      headerless={tab === 3}
      fixedViewport={fixedViewport}
      navigation={
        <div inert={!onTab}>
          <AppNavigation
            cursor={tab}
            onCamera={camera}
            indicatorOpacity={camera ? 0 : 1}
            renderLink={(_item, index, props) => (
              <button type="button" {...props} onClick={() => onTab?.(index)} />
            )}
          />
        </div>
      }
    >
      {children}
    </AppShellFrame>
  );
}
/** The exact components used by Home, with the actual captured photo. */
export function FirstCatchHome({
  draft,
  animated = false,
  onCamera,
}: {
  draft: FirstCatch | null;
  animated?: boolean;
  onCamera?: () => void;
}) {
  const t = useT();
  const target = useTargetLang();
  const sticker = draft && firstCatchSticker(draft);
  const samples = sampleStickers(draft, t, target);
  return (
    <FirstCatchShell onTab={onCamera ? () => onCamera() : undefined}>
      <section data-tour="home">
        <div inert={!sticker}>
          {/* 実物のホームと同じ形: 日付は誌面の板の上に直に書く（`heading`）。 */}
          <DayCollage
            stickers={sticker ? [sticker] : samples}
            heading={<DiaryDate date={new Date(draft?.capturedAt ?? "2026-09-23T09:00:00.000Z")} />}
            opening={animated && !sticker}
            onOpen={() => {}}
          />
        </div>
      </section>
    </FirstCatchShell>
  );
}
