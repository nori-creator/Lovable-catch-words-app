/**
 * **図鑑 ⇄ ホームのタブの行き来**（オーナー報告 2026-10-09「ホームのアイコン押すとカクカクする。
 * このようなラグはなくす。」）。
 *
 * 本番はタブを押すと画面（route）ごと作り直される（各画面が自分の `AppShell` を持つ）。
 * ここでも `key` を変えて同じ「作り直し」を起こし、本物の部品（`HomeSurface` = 本棚・
 * 今日の誌面、`ResurfaceCard`、図鑑の `DexCoverFlow`）をそのまま描く。下のバーを押すと
 * 行き来する。計測（`scripts/home-tab-perf.mjs`）もこの場面を押して測る。
 */
import { useMemo, useState } from "react";
import { AppShellFrame } from "@/components/AppShell";
import { AppNavigation } from "@/components/AppNavigation";
import { ResurfaceCard } from "@/components/ResurfaceCard";
import { DexCoverFlow } from "@/components/DexCoverFlow";
import { DexHeader, DexOverlay } from "@/components/screens/DexScreen";
import { HomeSurface } from "@/components/screens/HomeScreen";
import { NO_FILTER } from "@/lib/dex-filter";
import { wallClass } from "@/lib/wallpaper";
import { FIXTURES, makeSticker } from "./home";
import { SHELF_ITEMS } from "./home-shelf";

const PHOTOS = [
  "/first-catch-cafe.webp",
  "/first-catch-cat.webp",
  "/first-catch-flower.webp",
  "/first-catch-interests.webp",
];

/** 今日の誌面に載る札（写真の札と、字だけの札 — 録画の「蘑菇」「嘴邊肉」「狗」と同じ並び）。 */
const TODAY = [
  ...["蘑菇", "嘴邊肉", "狗"].map((head, i) => ({
    ...makeSticker({ ...FIXTURES[i], head, at: [11 - i * 3, 10] as [number, number] }, 900 + i, 0),
    object_url: null,
    selfie_url: null,
    placeholder_url: null,
  })),
  makeSticker({ ...FIXTURES[3], object: PHOTOS[1], selfie: undefined, at: [8, 5] }, 910, 0),
];

/** 3か月前の1枚（「3か月前に撮ったこの単語、覚えてる？」が出る）。 */
const OLD = makeSticker(
  { ...FIXTURES[0], head: "咖啡", object: PHOTOS[0], selfie: undefined, at: [10, 0] },
  990,
  91,
);

const ITEMS = [...TODAY, OLD, ...SHELF_ITEMS.filter((s) => !s.id.startsWith("s0-"))];
const RECALL = new Map(ITEMS.map((s) => [s.id, 70]));

const DIARY = async () => [] as Array<{ date: string; text: string }>;

function HomeTab({ shelf }: { shelf: boolean }) {
  return (
    <HomeSurface
      shelf={shelf}
      albumItems={ITEMS}
      today={new Date()}
      surfaceClass={wallClass("paper")}
      onOpen={() => {}}
      shelfLoaders={{ diary: DIARY, save: async () => {} }}
    >
      <ResurfaceCard items={ITEMS} recall={RECALL} />
    </HomeSurface>
  );
}

function DexTab() {
  const items = useMemo(() => ITEMS.filter((s) => s.object_url), []);
  return (
    <div>
      <DexOverlay>
        <DexHeader
          found={items.length}
          caught={items.length}
          view="cards"
          onView={() => {}}
          filter={NO_FILTER}
          onFilter={() => {}}
          categories={[]}
          days={[]}
        />
      </DexOverlay>
      <div aria-hidden style={{ height: "var(--dex-overlay-h, 9rem)" }} />
      <DexCoverFlow stickers={items} onOpen={() => {}} memory={new Map()} />
    </div>
  );
}

export function HomeTabSwitchScene({ q }: { q: URLSearchParams }) {
  const [tab, setTab] = useState<"home" | "dex">(q.get("tab") === "dex" ? "dex" : "home");
  const index = tab === "home" ? 0 : 1;
  return (
    // 本番と同じく、タブごとに枠ごと作り直す（`key`）。
    <AppShellFrame
      key={tab}
      immersive={tab === "dex"}
      navigation={
        <AppNavigation
          cursor={index}
          renderLink={(item, _i, props) => (
            <button
              type="button"
              data-nav={item.to}
              {...props}
              onClick={() => {
                if (item.to === "/home") setTab("home");
                else if (item.to === "/dex") setTab("dex");
              }}
            />
          )}
        />
      }
    >
      {tab === "home" ? <HomeTab shelf={q.get("shelf") !== "0"} /> : <DexTab />}
    </AppShellFrame>
  );
}
