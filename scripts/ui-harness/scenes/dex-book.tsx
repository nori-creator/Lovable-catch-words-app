/**
 * **iOS 版と同じ図鑑の升目**（オーナー指示 2026-10-08）。本物の `DexSurface`（写真の升目）と
 * 本物の `DexAlbumGrid` を描く。
 *
 * - `?scene=dex-book` … 20 のカテゴリーごとに、捕まえた言葉（番号順）→ まだの影（塗りの形・番号）。
 *   燒仙草（AI が「植物」と答えた語）が「お菓子」に並ぶ（前は「植物・花」だった）。
 * - `?scene=dex-book&case=all` … 379 の影を全部、カテゴリーごとに（項目ごとに別の形か見比べる）
 * - `?scene=dex-book&case=cycle` … 同じ言葉を何度も撮ったマス: 写真がゆっくり入れ替わり「×3」
 * - `?scene=dex-book&case=merge` … 文字で2回検索した「貓」が1マスにまとまる（前は2マス）
 * - `?scene=dex-book&case=other` … 分類が「その他」の蘑菇・小豬が植物・花と動物に、面膜は洗面・
 *   日用品に、どこにも当たらない語は最後の「その他」の節に（2026-10-09 オーナー報告）
 * - `?scene=dex-book&case=stuck` … other のまま保存された開關・刷子・健康餐・可頌・亮點・手背・面膜。
 *   見出し語の規則で棚へ入り、「その他」には亮點だけが残る（2026-10-09 オーナーの図鑑の画面）
 * - `?scene=dex-book&case=fruit` … AI が "nature" と答えて保存された桃・水蜜桃が「果物・野菜」に、
 *   桃花は「植物・花」、桃園は「建物・お店」、淡水河・觀音山・女王頭・夕陽は「空・自然」に
 *   （2026-10-09 オーナー報告「桃がなぜか景色に分類されてる」）
 *
 * 写真は見本の色の板（通信しない）。番号は本番と同じく端末に覚える（`localStorage`）。
 */
import { useState } from "react";
import { DexAlbumGrid, DexSurface, type ViewMode } from "@/components/screens/DexScreen";
import { DEX_CATEGORIES, dexCategoryLabelKey } from "@/lib/dex-catalog";
import type { DexSlot } from "@/lib/dex-book";
import { useT } from "@/lib/i18n";
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
  // AI が「植物」と答えていた語（名前に「草」）。いまは「お菓子」に並ぶ。
  { id: "grassjelly", head: "燒仙草", cat: "plant", photo: board("#3b2f2a", "燒仙草"), day: 9 },
  { id: "pigeon", head: "鴿子", cat: "animal", photo: board("#b8c2cc", "鴿子"), day: 9 },
  { id: "rice", head: "飯", cat: "food", photo: board("#efe6d2", "飯"), day: 10 },
  { id: "fan", head: "電風扇", cat: "appliance", photo: board("#cfe3f4", "電風扇"), day: 10 },
  { id: "tree", head: "樹", cat: "plant", photo: board("#7fb27a", "樹"), day: 11 },
];

/**
 * 2026-10-09 オーナー報告: 野のキノコの「蘑菇」と子豚の「小豬」が「洗面・日用品」に並んでいた。
 * どちらも AI の分類が other（札の表示は「その他」）で、図鑑は other を日用品に寄せていた。
 */
const OTHER: Fx[] = [
  { id: "mushroom", head: "蘑菇", cat: "other", photo: board("#a0784f", "蘑菇"), day: 1 },
  { id: "piglet", head: "小豬", cat: "other", photo: board("#f2b8b5", "小豬"), day: 2 },
  { id: "mask", head: "面膜", cat: "medicine", photo: board("#f4f1ea", "面膜"), day: 3 },
  { id: "unknown", head: "某個東西", cat: "other", photo: board("#cfcfd4", "?"), day: 4 },
];

/**
 * 2026-10-09 オーナーの図鑑の画面:「その他になぜかいろんなものがそのままになってる。
 * 可頌は食べ物だし、面膜は生活用品だよね。」— どれも保存された分類は other。
 */
const STUCK: Fx[] = [
  { id: "switch", head: "開關", cat: "other", photo: board("#e8e4da", "開關"), day: 1 },
  { id: "brush", head: "刷子", cat: "other", photo: board("#c9a77a", "刷子"), day: 1 },
  { id: "mealbox", head: "健康餐", cat: "other", photo: board("#9cc58a", "健康餐"), day: 2 },
  { id: "croissant", head: "可頌", cat: "other", photo: board("#d9a45b", "可頌"), day: 2 },
  { id: "highlight", head: "亮點", cat: "other", photo: board("#f3e27a", "亮點"), day: 3 },
  { id: "backhand", head: "手背", cat: "other", photo: board("#f0c9a8", "手背"), day: 3 },
  { id: "facemask", head: "面膜", cat: "other", photo: board("#f4f1ea", "面膜"), day: 4 },
];

/**
 * 2026-10-09 オーナー報告「桃がなぜか景色に分類されてる」。保存された分類はどれも AI の答えのまま
 * （桃・水蜜桃 = nature、桃子 = plant）。図鑑は表 → 見出し語の規則 → 保存された鍵の順に置く。
 */
const FRUIT: Fx[] = [
  { id: "peach", head: "桃", cat: "nature", photo: board("#f7b7a3", "桃"), day: 1 },
  { id: "peach-zi", head: "桃子", cat: "plant", photo: board("#f4a69a", "桃子"), day: 1 },
  { id: "white-peach", head: "水蜜桃", cat: "nature", photo: board("#fbd3c4", "水蜜桃"), day: 2 },
  { id: "blossom", head: "桃花", cat: "nature", photo: board("#f9c6d8", "桃花"), day: 2 },
  { id: "taoyuan", head: "桃園", cat: "building", photo: board("#b9c4d0", "桃園"), day: 3 },
  { id: "river", head: "淡水河", cat: "other", photo: board("#7fb3d5", "淡水河"), day: 3 },
  { id: "guanyin", head: "觀音山", cat: "other", photo: board("#8fae8b", "觀音山"), day: 4 },
  { id: "queen", head: "女王頭", cat: "nature", photo: board("#c9b18f", "女王頭"), day: 4 },
  { id: "sunset", head: "夕陽", cat: "sky", photo: board("#f39c6b", "夕陽"), day: 5 },
];

function OtherCase({ fixtures = OTHER }: { fixtures?: Fx[] }) {
  const [items] = useState(() => fixtures.map(make));
  const [view, setView] = useState<ViewMode>("gallery");
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
      targetLanguage="zh-TW"
    />
  );
}

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
  if (kase === "all") return <AllCase />;
  if (kase === "other") return <OtherCase />;
  if (kase === "stuck") return <OtherCase fixtures={STUCK} />;
  if (kase === "fruit") return <OtherCase fixtures={FRUIT} />;
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

/**
 * 379 の影を全部（カテゴリーごと）。本番の図鑑は各カテゴリーの最初の5つだけを出すので、
 * 残りの影の形はここで見る。
 */
function AllCase() {
  const t = useT();
  return (
    <div style={{ padding: "16px 16px 120px" }}>
      <p style={{ fontSize: 13, color: "#6e6e73", margin: "0 0 12px" }}>
        まだ捕まえていない物の影（379）。本番では各カテゴリーの最初の5つが出ます。
      </p>
      {DEX_CATEGORIES.map((c) => {
        const slots: DexSlot<StickerWithWord>[] = c.items.map((it) => ({
          kind: "shadow",
          id: `i:${it.id}`,
          no: it.baseNo,
          item: it,
        }));
        return (
          <section key={c.no} style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>
              {c.emoji} {t(dexCategoryLabelKey(c.no))}
            </h2>
            <DexAlbumGrid
              items={[]}
              slots={slots}
              lang="zh-TW"
              numbers={new Map()}
              onOpen={() => {}}
              memory={new Map()}
            />
          </section>
        );
      })}
    </div>
  );
}
