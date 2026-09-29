import { AppShellFrame } from "../AppShell";
import { AppNavigation } from "../AppNavigation";
import type { ReactNode } from "react";
import { HomeSurface } from "@/routes/_authenticated/home";
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
/**
 * **本物のホームの画面（`HomeSurface`）そのもの**に、見本の写真か撮った1枚を載せる。
 *
 * 本棚・今日の誌面・壁の続きまで本物と同じ部品なので、ホームを直すとここも同じ
 * ビルドで変わる（オーナー指示 2026-09-29「アプリ本体をアップデートしたら自動的に
 * 変化するように」）。本棚の日記は登録前なので端末の外へ出さない（空で読み、書いても送らない）。
 */
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
  const items = sticker ? [sticker] : samples;
  return (
    <FirstCatchShell onTab={onCamera ? () => onCamera() : undefined}>
      <section data-tour="home">
        <div inert={!sticker}>
          <HomeSurface
            albumItems={items}
            today={new Date(items[0]?.created_at ?? SAMPLE_DAY)}
            surfaceClass="album-bg-paper"
            opening={animated && !sticker}
            onOpen={() => {}}
            shelfLoaders={GUEST_SHELF}
          />
        </div>
      </section>
    </FirstCatchShell>
  );
}

const SAMPLE_DAY = "2026-09-23T09:00:00.000Z";
/** 登録前の本棚の日記: 何も読まず、何も送らない。 */
const GUEST_SHELF = {
  diary: async () => [],
  save: async () => {},
};
