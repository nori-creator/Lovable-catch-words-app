/**
 * **iOS 版と同じ図鑑の升目**（オーナー指示 2026-10-08）。本物の `DexSurface`（写真の升目）と
 * 本物の `DexAlbumGrid` を描く。
 *
 * - `?scene=dex-book` … 20 のカテゴリーごとに、捕まえた言葉（番号順）→ まだの影（灰色の絵・番号）
 * - `?scene=dex-book&case=cycle` … 同じ言葉を何度も撮ったマス: 写真がゆっくり入れ替わり「×3」
 * - `?scene=dex-book&case=merge` … 文字で2回検索した「貓」が1マスにまとまる（前は2マス）
 *
 * 写真は見本の色の板（通信しない）。番号は本番と同じく端末に覚える（`localStorage`）。
 */
import { useState } from "react";
import { DexAlbumGrid, DexSurface, type ViewMode } from "@/components/screens/DexScreen";
import { NO_FILTER, applyDexFilter, type DexFilter } from "@/lib/dex-filter";
import { memoryBadgeMap } from "@/lib/memory-badge";
import type { StickerWithWord } from "@/lib/stickers.functions";

const board = (color: string, label = "") =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${color}"/><circle cx="120" cy="130" r="58" fill="rgba(255,255,255,.35)"/><text x="120" y="44" font-size="22" text-anchor="middle" fill="rgba(0,0,0,.45)" font-family="system-ui">${label}</text></svg>`,
  );

type Fx = {
  id: string;
  head: string;
  cat: string;
  photo?: string;
  type?: "photo" | "text";
  day?: number;
  enc?: number;
};

function make(f: Fx): StickerWithWord {
  const at = new Date(Date.UTC(2026, 9, f.day ?? 1, 3)).toISOString();
  return {
    id: f.id,
    word_id: `w-${f.head}`,
    caption: null,
    location_name: null,
    lat: null,
    lng: null,
    taken_at: at,
    created_at: at,
    encounter_count: f.enc ?? 0,
    object_url: f.photo ?? null,
    cutout_url: null,
    selfie_url: null,
    object_thumb_url: null,
    cutout_thumb_url: null,
    capture_type: f.type ?? (f.photo ? "photo" : "text"),
    placeholder_url: null,
    placeholder_credit: null,
    word: {
      language: "zh-TW",
      headword: f.head,
      reading_zhuyin: null,
      pinyin: null,
      meaning_ja: "",
      part_of_speech: null,
      example_sentence: null,
      example_translation: null,
      level: null,
      category_key: f.cat,
      silhouette_emoji: null,
      extras: null,
    },
  };
}

/** 図鑑の見本: 表に在る言葉（咖啡 No.002 など）と、表に無い言葉（No.101〜）。 */
const BOOK: Fx[] = [
  { id: "coffee", head: "咖啡", cat: "drink", photo: board("#8a5a3c", "咖啡"), day: 1 },
  { id: "bubble", head: "珍珠奶茶", cat: "drink", photo: board("#c89b6d", "珍珠奶茶"), day: 2 },
  { id: "mango", head: "芒果", cat: "fruit", photo: board("#f5a623", "芒果"), day: 3 },
  { id: "cat-a", head: "貓", cat: "animal", photo: board("#9aa7b4", "貓 1"), day: 4, enc: 1 },
  { id: "cat-b", head: "貓", cat: "animal", photo: board("#c7b299", "貓 2"), day: 6 },
  { id: "dog", head: "狗", cat: "animal", day: 5 },
  { id: "mrt", head: "捷運", cat: "transport", photo: board("#4a90d9", "捷運"), day: 5 },
  { id: "aiyu", head: "愛玉", cat: "dessert", day: 7 },
  { id: "scooter-shop", head: "機車行", cat: "shop", photo: board("#d0483c", "機車行"), day: 8 },
];

/** 再会の写真（本番は見えた時に `listStickerPhotos` で読む）。 */
const ENCOUNTER_PHOTOS: Record<string, string[]> = {
  "cat-a": [board("#e0c48f", "貓 3")],
  "cycle-coffee": [board("#6f4c30", "2回目"), board("#b58763", "3回目")],
};

const photosOf = (id: string) => ENCOUNTER_PHOTOS[id];

export function DexBookScene({ q }: { q: URLSearchParams }) {
  const kase = q.get("case");
  if (kase === "cycle") return <CycleCase />;
  if (kase === "merge") return <MergeCase />;
  return <BookCase />;
}

function BookCase() {
  const [items] = useState(() => BOOK.map(make));
  const [view, setView] = useState<ViewMode>("gallery");
  const [filter, setFilter] = useState<DexFilter>(NO_FILTER);
  const [search, setSearch] = useState("");
  const memory = memoryBadgeMap([
    { sticker_id: "coffee", retention: 92, interval_days: 3, ease: 2.5 },
    { sticker_id: "cat-a", retention: 40, interval_days: 1, ease: 2.5 },
  ]);
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
      memory={memory}
      targetLanguage="zh-TW"
      photosOf={photosOf}
    />
  );
}

/** 同じ言葉を3回: 最初の札 + 再会2回。写真がゆっくり入れ替わり、「×3」。 */
function CycleCase() {
  const items = [
    make({
      id: "cycle-coffee",
      head: "咖啡",
      cat: "drink",
      photo: board("#8a5a3c", "1回目"),
      enc: 2,
    }),
    make({ id: "cycle-cat-1", head: "貓", cat: "animal", photo: board("#9aa7b4", "貓 1"), day: 2 }),
    make({ id: "cycle-cat-2", head: "貓", cat: "animal", photo: board("#c7b299", "貓 2"), day: 3 }),
    make({ id: "cycle-one", head: "芒果", cat: "fruit", photo: board("#f5a623", "1枚だけ") }),
  ];
  return (
    <div style={{ padding: "16px 16px 120px" }}>
      <p style={{ fontSize: 13, color: "#6e6e73", margin: "0 0 12px" }}>
        何度も撮った言葉は写真が約3.6秒ごとにゆっくり入れ替わり、右下に出会った回数（×3）。
        「動きを減らす」設定では入れ替えません。
      </p>
      <DexAlbumGrid
        items={items}
        lang="zh-TW"
        numbers={
          new Map([
            ["cycle-coffee", 2],
            ["cycle-cat-1", 77],
            ["cycle-cat-2", 77],
            ["cycle-one", 13],
          ])
        }
        onOpen={() => {}}
        memory={new Map()}
        photosOf={photosOf}
      />
    </div>
  );
}

/** 文字で2回検索した「貓」（写真なし）。前は2マス（どちらも 0%）、いまは1マスで「×2」。 */
function MergeCase() {
  const items = [
    make({ id: "text-cat-1", head: "貓", cat: "animal", type: "text", day: 1 }),
    make({ id: "text-cat-2", head: "貓", cat: "animal", type: "text", day: 2 }),
    make({ id: "text-dog", head: "狗", cat: "animal", type: "text", day: 3 }),
  ];
  const [view, setView] = useState<ViewMode>("gallery");
  // 動物だけに絞って開く（影の100マスの下に埋もれず、まとまった「貓」がすぐ見える）。
  const [filter, setFilter] = useState<DexFilter>({ category: "animal", day: null });
  const [search, setSearch] = useState("");
  return (
    <DexSurface
      captured={items}
      filtered={applyDexFilter(items, filter)}
      view={view}
      onView={setView}
      filter={filter}
      onFilter={setFilter}
      search={search}
      onSearch={setSearch}
      categories={[{ key: "animal", count: 2 }]}
      days={[]}
      onOpen={() => {}}
      memory={memoryBadgeMap([
        { sticker_id: "text-cat-1", retention: 0, interval_days: 1, ease: 2.5 },
      ])}
      targetLanguage="zh-TW"
    />
  );
}
