/**
 * **Web 版の広告（Google AdSense）の場面**（オーナー指示 2026-10-03「アプリ内の広告が動く
 * 機能するようにしたい。」）。
 *
 * 本物の AdSense は読み込まない（審査前の運営者 ID では何も出ないし、見本のページで
 * 本物の広告を出すと規約に触れる）。代わりに `window.adsbygoogle` を**見本の受け口**に
 * 差し替える: 枠1つにつき1回の `push({})` で、枠に「広告（AdSense）」と書いた縞の箱を入れ、
 * 本物と同じ `data-ad-status` を付ける。描くのは本物の枠（`AdCard`）と本物の画面。
 *
 * - `?scene=dex-ads` … 図鑑の写真の並びに広告（`&view=list` で縦の一覧、`&n=` で枚数）
 * - `?scene=home-ads` … ホームの過去の日の間に広告
 * - `?scene=review-end-ads` … 復習の区切りの終わりの画面の下に広告
 * - `?scene=settings-ads` … 開発者の広告の設定（AdSense の番号の欄）
 * - どれも `&fill=unfilled` で「広告が埋まらなかった」形（枠が畳まれて消える）。
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DexSurface } from "@/routes/_authenticated/dex";
import { PastDays } from "@/routes/_authenticated/home";
import { DoneState } from "@/routes/_authenticated/review";
import { AdsPanel } from "@/routes/_authenticated/settings";
import { ReviewEndAdCard } from "@/components/ads/ReviewEndAd";
import { AdCard } from "@/components/ads/AdCard";
import { DEFAULT_AD_CONFIG, diarySlots, type AdConfig } from "@/lib/ad-policy";
import { webPlacements } from "@/lib/adsense";
import { NO_FILTER, type DexFilter } from "@/lib/dex-filter";
import { groupBySpan } from "@/lib/album-span";
import { tStatic } from "@/lib/i18n";
import type { WebAds } from "@/hooks/use-web-ads";
import type { ViewMode } from "@/routes/_authenticated/dex";
import { makeStickers } from "./shelf";
import { FIXTURES, makeSticker } from "./home";

/** 見本の番号（本物ではない。形だけ本物と同じ）。 */
export const HARNESS_AD_CONFIG: AdConfig = {
  ...DEFAULT_AD_CONFIG,
  enabled: true,
  adsensePublisherId: "ca-pub-0000000000000000",
  slotDexInFeed: "1000000001",
  slotDiaryInFeed: "1000000002",
  slotReviewEnd: "1000000003",
};

const HARNESS_ADS: WebAds = {
  show: true,
  reason: null,
  cfg: HARNESS_AD_CONFIG,
  client: HARNESS_AD_CONFIG.adsensePublisherId,
  placements: webPlacements(HARNESS_AD_CONFIG),
};

/**
 * AdSense の受け口の見本。本物と同じく、まだ埋めていない最初の枠を1つ埋める。
 * 見た目は**インラインの style**（Tailwind は `src` しか見ないので、ここで書いた
 * クラスは生成されない — main.tsx の注）。
 */
function installAdsenseMock(fill: "filled" | "unfilled") {
  window.adsbygoogle = {
    push() {
      const el = document.querySelector<HTMLElement>(
        "ins.adsbygoogle:not([data-adsbygoogle-status])",
      );
      if (!el) throw new Error("adsbygoogle.push() error: No slot size for availableWidth=0");
      el.setAttribute("data-adsbygoogle-status", "done");
      // 本物と同じく、少し遅れて結果が付く。
      setTimeout(() => {
        el.setAttribute("data-ad-status", fill);
        if (fill === "unfilled") return;
        const box = document.createElement("div");
        const h = parseInt(el.style.minHeight || "120", 10);
        Object.assign(box.style, {
          height: `${h}px`,
          display: "grid",
          placeItems: "center",
          borderRadius: "12px",
          background:
            "repeating-linear-gradient(135deg, rgba(127,127,127,.14) 0 12px, rgba(127,127,127,.06) 12px 24px)",
          color: "inherit",
          font: "600 13px/1.4 system-ui, sans-serif",
          opacity: "0.75",
          textAlign: "center",
        });
        box.textContent = `${tStatic("ads.label")} · AdSense (preview) · ${el.dataset.adSlot}`;
        el.appendChild(box);
      }, 150);
    },
  };
}

/** 場面が描かれる前（枠の `useEffect` より前）に受け口を差し替える。 */
function useAdsenseMock(q: URLSearchParams) {
  useState(() => {
    installAdsenseMock(q.get("fill") === "unfilled" ? "unfilled" : "filled");
    return null;
  });
}

/** 図鑑（写真の並び・縦の一覧）に広告。本物の `DexSurface` を描く。 */
export function DexAdsScene({ q }: { q: URLSearchParams }) {
  useAdsenseMock(q);
  const n = Number(q.get("n") ?? 40);
  // 実際の図鑑に近く、数個のカテゴリーに多めに入った形（1枚ずつの組だと格子の中の広告が見えない）。
  const [items] = useState(() =>
    makeStickers(n).map((s, i) => ({
      ...s,
      word: { ...s.word, category_key: i % 4 === 3 ? "drink" : "food" },
    })),
  );
  const [view, setView] = useState<ViewMode>(q.get("view") === "list" ? "list" : "gallery");
  const [filter, setFilter] = useState<DexFilter>(NO_FILTER);
  const [search, setSearch] = useState("");
  return (
    <DexSurface
      captured={items}
      filtered={items}
      view={view}
      onView={setView}
      filter={filter}
      onFilter={setFilter}
      search={search}
      onSearch={setSearch}
      categories={[]}
      days={[]}
      onOpen={() => {}}
      memory={new Map()}
      ads={HARNESS_ADS}
    />
  );
}

/** ホームの過去の日（日記）の間に広告。 */
export function HomeAdsScene({ q }: { q: URLSearchParams }) {
  useAdsenseMock(q);
  const [days] = useState(() => {
    const shots = [1, 2, 3, 5, 8, 9, 12, 15].flatMap((d) =>
      FIXTURES.slice(0, 3).map((f, i) => makeSticker(f, i, d)),
    );
    return groupBySpan(shots, (s) => new Date(s.created_at), "day");
  });
  return (
    <PastDays
      days={days}
      onOpen={() => {}}
      truncated={false}
      shown={days.length}
      total={days.length}
      adAfter={diarySlots(days.length, HARNESS_AD_CONFIG, false)}
      renderAd={() => (
        <AdCard
          client={HARNESS_ADS.client}
          slot={HARNESS_AD_CONFIG.slotDiaryInFeed}
          minHeight={120}
        />
      )}
    />
  );
}

/** 復習の区切り: 終わりの画面の下の広告の札（全画面ではない）。 */
export function ReviewEndAdsScene({ q }: { q: URLSearchParams }) {
  useAdsenseMock(q);
  return (
    <>
      <DoneState
        onAgain={() => {}}
        answered={10}
        correct={8}
        batch={{ limit: 0, doneToday: 10, dueRemaining: 187 }}
      />
      <ReviewEndAdCard client={HARNESS_ADS.client} slot={HARNESS_AD_CONFIG.slotReviewEnd} />
    </>
  );
}

/** 開発者の広告の設定。番号を入れた形で開いておく。 */
export function SettingsAdsScene({ q }: { q: URLSearchParams }) {
  const qc = useQueryClient();
  useState(() => {
    qc.setQueryData(
      ["ad-config"],
      q.get("empty") === "1" ? DEFAULT_AD_CONFIG : { ...HARNESS_AD_CONFIG, enabled: false },
    );
    return null;
  });
  return <AdsPanel defaultOpen />;
}
