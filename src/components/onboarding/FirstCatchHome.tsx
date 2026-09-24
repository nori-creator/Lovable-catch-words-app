import type { ReactNode } from "react";
import { Home, BookOpen, Camera, Sparkles, Settings } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { DiaryDate, DayCollage } from "@/routes/_authenticated/home";
import { DexAlbumGrid } from "@/routes/_authenticated/dex";
import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import { useT } from "@/lib/i18n";
import { useTargetLang } from "@/lib/target-lang-pref";
import { CardSchema } from "@/lib/card-schema";

function sampleStickers(
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
  ].map(
    ({ id, photo, word, meaning, category }) =>
      firstCatchSticker({
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
  );
}

export function FirstCatchSampleDex({ draft }: { draft: FirstCatch | null }) {
  const t = useT();
  const target = useTargetLang();
  const samples = sampleStickers(draft, t, target);
  return (
    <div className="first-sample-dex">
      <p className="first-sample-label">{t("first.sampleDex")}</p>
      <DexAlbumGrid items={samples} onOpen={() => {}} />
    </div>
  );
}

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
      {/* 上にアプリ名の帯は置かない — 実物のアプリにも無い（案内の途中で
          見た目が変わると、どれが本物の画面か分からなくなる）。 */}
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
  const samples = sampleStickers(draft, t, target);
  return (
    <FirstCatchShell>
      <section data-tour="home">
        {!sticker && <p className="first-sample-label">{t("first.sampleAlbum")}</p>}
        <div className={!sticker ? "first-sample-album" : ""} inert={!sticker}>
          {/* 実物のホームと同じ形: 日付は誌面の板の上に直に書く（`heading`）。 */}
          <DayCollage
            stickers={sticker ? [sticker] : samples}
            heading={<DiaryDate date={new Date(draft?.capturedAt ?? Date.now())} />}
            opening={animated && !sticker}
            onOpen={() => {}}
          />
        </div>
      </section>
    </FirstCatchShell>
  );
}
