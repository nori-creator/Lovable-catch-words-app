/**
 * 棚の検査用ハーネス — **本物の DexShelf を描く**。
 *
 * ## なぜ作り替えたか
 * 以前この検査は、棚のHTMLを手書きで複製していた。つまり
 * **コンポーネントを直しても画像は変わらない**。検査が合格しても、
 * 実物が同じように描かれている保証がどこにも無かった
 * (独立監査の指摘)。実際、空の棚の実レイアウトは一度も写っていなかった。
 *
 * ここでは本物を import して描く。画像は data: URL を渡す —
 * `CachedImg` は署名URLの形でないものはそのまま `<img src>` に流すので、
 * ブラウザ内では実物と同じ経路で表示される。
 *
 * 場面はURLの検索文字列で切り替える(`?material=oak&density=spines&count=0`)。
 */
import { createRoot } from "react-dom/client";
import { DexShelf } from "@/components/DexShelf";
import { DENSITY_PER_SHELF, type ShelfDensity, type ShelfMaterial } from "@/lib/shelf-prefs";
import type { StickerWithWord } from "@/lib/stickers.functions";
import "@/styles.css";

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

const q = new URLSearchParams(location.search);
const count = Number(q.get("count") ?? FIXTURES.length);
const material = (q.get("material") ?? "none") as ShelfMaterial;
const density = (q.get("density") ?? "three") as ShelfDensity;

const stickers = FIXTURES.slice(0, count).map(makeSticker);

/**
 * 上のバーも置く。**置かないと嘘になる。**
 * 部屋見出しは `top: var(--app-header-h)` の sticky なので、バーが無い
 * ページでは**先頭の見出しがその分だけ下にずれて、自分の中身に重なる**。
 * 実際、最初に撮った画像では一番上の「空いている棚 — 押すと開きます」が
 * 見出しの下敷きになって消えていた。実物と同じ箱を置いて初めて、
 * sticky の止まる位置が実物と同じになる。
 */
createRoot(document.getElementById("root")!).render(
  <div className="min-h-screen bg-background">
    <header className="scroll-edge sticky top-0 z-30 bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex min-h-[var(--app-header-h)] max-w-3xl items-center px-4 py-3">
        <div className="h-8 w-8 rounded-xl bg-primary" />
        <span className="ml-2 text-base font-semibold tracking-[-0.02em]">Catchwords</span>
      </div>
    </header>
    <main className="mx-auto max-w-3xl px-4 py-4">
      <DexShelf
        stickers={stickers}
        activeCategory={null}
        onOpen={() => {}}
        perShelf={DENSITY_PER_SHELF[density]}
        material={material}
        density={density}
      />
    </main>
  </div>,
);
