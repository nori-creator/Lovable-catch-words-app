/**
 * **本棚の本の左ページ（その日のアルバム）を、枚数ごとに並べて見る**（オーナー指示
 * 2026-10-02「本棚のアルバムの画像のバランスが…縦に長になっていて変だから、大きさや
 * バランスを自動的に調整して」）。
 *
 * 置き方の計算はホームと同じ `layoutDayAlbum` を通し、描くのも本物の `paintAlbumDay`。
 * 写真は手元の固定の絵だけを使う（ログインも通信も要らない）。
 */
import { useEffect, useState } from "react";
import { paintAlbumDay, type DaySpread } from "@/components/shelf3d/textures";
import { layoutDayAlbum } from "@/lib/album-day-layout";

const PHOTOS = [
  { src: "/first-catch-interest-nature.webp", word: "河" },
  { src: "/first-catch-interest-travel.webp", word: "夕陽" },
  { src: "/first-catch-interest-city.webp", word: "紅毛城" },
  { src: "/first-catch-cafe.webp", word: "月台門" },
  { src: "/first-catch-flower.webp", word: "淡水河" },
  { src: "/first-catch-cat.webp", word: "觀音山" },
  { src: "/first-catch-interest-food.webp", word: "蔥麵包" },
];
const NOTES: Record<number, string> = { 1: "夕方の川がきれいだった", 4: "猫が店番してた" };
/** 写真の縦横比（高さ / 幅）。実物の日と同じく縦長と横長が混ざるように。 */
const RATIOS = [0.75, 1.33, 1.25, 1.33, 0.8, 1.33, 1.2];

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function dayOf(n: number, imgs: Array<HTMLImageElement | null>): DaySpread {
  const stickers = PHOTOS.slice(0, n).map((p, i) => ({
    id: `p${i}`,
    caption: NOTES[i] ?? null,
    album_order: i,
  }));
  const photoRatio = Object.fromEntries(stickers.map((s, i) => [s.id, RATIOS[i]]));
  const { items, boardH } = layoutDayAlbum({
    stickers,
    hasHero: () => true,
    photoRatio,
    boardW: 340,
  });
  return {
    y: 2026,
    m: 9,
    d: 13,
    label: `9月13日(日) — ${n}枚`,
    boardH,
    diary: "",
    photos: items.map((it, i) => ({
      img: imgs[i] ?? null,
      word: PHOTOS[i].word,
      note: NOTES[i],
      place: it.place,
      ratio: it.ratio,
      z: it.z,
      id: it.id,
    })),
  };
}

export function BookPageScene({ q }: { q: URLSearchParams }) {
  const counts = (q.get("n") ?? "7,4,2")
    .split(",")
    .map(Number)
    .filter((n) => n >= 1 && n <= PHOTOS.length);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all(PHOTOS.map((p) => load(p.src))).then((imgs) => {
      if (!alive) return;
      setUrls(counts.map((n) => paintAlbumDay(dayOf(n, imgs)).toDataURL("image/jpeg", 0.88)));
    });
    return () => {
      alive = false;
    };
    // 枚数の組は URL で決まるので、開いた時に1度だけ描く。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen space-y-4 p-4" style={{ background: "#6b6f78", color: "#fff" }}>
      <p className="text-footnote">
        本棚の本の左ページ。写真が多くてホームの並びでは縦に長すぎる日は、ページに合わせて列の数と
        大きさを選び直します。写真が少なくてページの下が大きく空く日も、写真を大きくして並べ直します。
      </p>
      {urls.length === 0 && <p className="text-footnote">描いています…</p>}
      {urls.map((u, i) => (
        <figure key={i} className="space-y-1">
          <figcaption className="text-caption">写真 {counts[i]} 枚の日</figcaption>
          <img src={u} alt="" className="w-full rounded-md shadow-lg" />
        </figure>
      ))}
    </div>
  );
}
