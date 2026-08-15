/** 棚(図鑑)の場面。**本物の `DexShelf` を描く。** */
import { DexShelf } from "@/components/DexShelf";
import { DENSITY_PER_SHELF, type ShelfDensity, type ShelfMaterial } from "@/lib/shelf-prefs";
import type { StickerWithWord } from "@/lib/stickers.functions";

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

export function ShelfScene({ q }: { q: URLSearchParams }) {
  const count = Number(q.get("count") ?? FIXTURES.length);
  const material = (q.get("material") ?? "none") as ShelfMaterial;
  const density = (q.get("density") ?? "three") as ShelfDensity;
  const stickers = FIXTURES.slice(0, count).map(makeSticker);
  return (
    <DexShelf
      stickers={stickers}
      activeCategory={null}
      onOpen={() => {}}
      perShelf={DENSITY_PER_SHELF[density]}
      material={material}
      density={density}
    />
  );
}
