/** 棚(図鑑)の場面。**本物の `DexShelf` を描く。** */
import { DexShelf } from "@/components/DexShelf";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { ROOM_CATEGORIES, ROOM_KEYS } from "@/lib/category";

/** 全部の棚(54)。件数が多いときはここへ順に配る。 */
const ALL_CATEGORIES = ROOM_KEYS.flatMap((r) => ROOM_CATEGORIES[r]);

const svg = (w: number, h: number, color: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="4" fill="${color}"/></svg>`,
  );

/**
 * モノの見え方は**実物にある3通りすべて**を出す:
 *   ① 切り抜き ② 切り抜きが無く写真を額に入れたもの ③ 画像がまだ無いもの
 */
const FIXTURES: Array<{
  head: string;
  cat: string;
  cutout?: string;
  object?: string;
  count?: number;
}> = [
  { head: "芒果", cat: "fruit", cutout: svg(100, 88, "#f5a623") },
  { head: "捷運", cat: "vehicle", cutout: svg(70, 120, "#4a90d9") },
  { head: "珍珠奶茶", cat: "drink", object: svg(120, 62, "#b07a4a") },
  { head: "夜市", cat: "shop", cutout: svg(96, 96, "#d0483c"), count: 3 },
  { head: "腳踏車", cat: "vehicle" },
  { head: "雨傘", cat: "tool", cutout: "" },
  { head: "蘋果", cat: "fruit", cutout: svg(90, 90, "#e2574c") },
  { head: "咖啡", cat: "drink", cutout: svg(80, 100, "#6f4c30") },
];

function makeSticker(f: (typeof FIXTURES)[number], i: number): StickerWithWord {
  return {
    id: `s${i}`,
    word_id: `w${i}`,
    caption: null,
    location_name: null,
    lat: null,
    lng: null,
    taken_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    encounter_count: f.count ?? 1,
    object_url: f.object ?? null,
    cutout_url: f.cutout || null,
    selfie_url: null,
    object_thumb_url: null,
    cutout_thumb_url: null,
    capture_type: "photo",
    placeholder_url: null,
    placeholder_credit: null,
    word: {
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

/**
 * AI が作った「その人だけの棚」。既定の54棚に無い分類で、
 * 部屋も新しく生える(`faith` は `ROOM_KEYS` に無い)。
 */
const USER_SHELVES = [
  {
    key: "night_market_snack",
    label: "夜市のおやつ",
    emoji: "🍡",
    room_key: "eat",
    room_label: "食べる",
  },
  {
    key: "temple_offering",
    label: "廟のお供え",
    emoji: "🪷",
    room_key: "faith",
    room_label: "祈る",
  },
];

export function ShelfScene({ q }: { q: URLSearchParams }) {
  const count = Number(q.get("count") ?? FIXTURES.length);
  // 見た目の検査は 8 件で足りるが、**性能は件数が要る**。
  //
  // 足りない分は雛形を繰り返して埋める。このとき**分類も順に回す** —
  // 雛形の 5 分類だけを使い回すと、300 件が 5 つの棚に積み上がり、
  // 残り 49 棚は空のまま畳まれる。それは「54 棚に散らばった図鑑」という
  // 測りたい状況と別物で、実際 `content-visibility` の付いた要素が
  // 5 個しか出ていなかった(= A/B の差がほとんど出ない)。
  const stickers = Array.from({ length: count }, (_, i) => {
    const s = makeSticker(FIXTURES[i % FIXTURES.length], i);
    if (count <= FIXTURES.length) return s;
    return { ...s, word: { ...s.word, category_key: ALL_CATEGORIES[i % ALL_CATEGORIES.length] } };
  });
  // `custom=1` で「AI が棚と部屋を作ったあと」の図鑑を描く。
  // 既定の棚しか無い状態と**両方**撮る — 新しい棚が既存の並びを
  // 押しのけていないことは、並べて見ないと分からない。
  const custom = q.get("custom") === "1";
  // **両方の棚に必ず中身を入れる。** 最初 `i % 14` で振ったら片方が
  // 0件になり、「中身のある棚だけ描く」規則どおり新しい部屋が出なかった。
  // 出したい面が出ていない雛形は、検査しているつもりで何も見ていない。
  const withShelves = custom
    ? stickers.map((s, i) =>
        i % 8 === 3
          ? { ...s, shelf_key: "night_market_snack" }
          : i % 8 === 5
            ? { ...s, shelf_key: "temple_offering" }
            : s,
      )
    : stickers;
  return (
    <DexShelf
      stickers={withShelves}
      activeCategory={null}
      onOpen={() => {}}
      userShelves={custom ? USER_SHELVES : []}
    />
  );
}
