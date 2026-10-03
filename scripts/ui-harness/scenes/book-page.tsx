/**
 * **ホームのアルバムと本棚の本の左ページは同じ1枚の台紙**（オーナー決定 2026-10-02「本の
 * アルバムの写真の配置とホームのアルバム画像の配置は同じにして」→「台紙を本のページの形に
 * そろえる」）。
 *
 * 置き方の計算は両方とも `layoutDayAlbum` / `settleDayAlbum` の1本。ホームは本物の
 * `DayCollage`、本は本物の `paintAlbumDay` で描く。写真は手元の固定の絵だけ（ログインも
 * 通信も要らない）。
 *
 *  - `?scene=home-vs-book`   … 同じ日をホーム（上）と本（下）で並べて見比べる（7・4・2・1枚）
 *  - `?scene=book-page`      … 本の左ページだけ（7・4・2・1枚）
 *  - `?scene=book-album-edit` … 本の左ページを長押しして開く並べ替えの面（開いた所から）
 *  `?n=7,4,2,1` で枚数の組を変える。
 */
import { useEffect, useState } from "react";
import { paintAlbumDay, type DaySpread } from "@/components/shelf3d/textures";
import { layoutDayAlbum } from "@/lib/album-day-layout";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { BookAlbumEditor, DayCollage, DiaryDate } from "@/components/screens/HomeScreen";
import { makeSticker } from "./home";

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

/** 今日撮った n 枚（ホームの `DayCollage` に渡す札）。本と同じ写真・語・一言。 */
export function bookDayStickers(n: number): StickerWithWord[] {
  return PHOTOS.slice(0, n).map((p, i) =>
    makeSticker(
      { head: p.word, object: p.src, at: [9 + i, (i * 17) % 60], caption: NOTES[i] },
      i,
      0,
    ),
  );
}

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 本の左ページに書く日付（本番の `HomeShelf` の `dayLabel` と同じ書き方）。 */
function pageLabel(date: Date) {
  return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
}

/** その日の見開きの左（写真の縦横比は読めた絵から。本番の `prepare` と同じ）。 */
function dayOf(n: number, imgs: Array<HTMLImageElement | null>, date: Date): DaySpread {
  const stickers = bookDayStickers(n);
  const photoRatio: Record<string, number> = {};
  stickers.forEach((s, i) => {
    const img = imgs[i];
    if (img?.naturalWidth && img.naturalHeight)
      photoRatio[s.id] = img.naturalHeight / img.naturalWidth;
  });
  const { items, boardH } = layoutDayAlbum({
    stickers,
    hasHero: () => true,
    photoRatio,
    boardW: 340,
  });
  const at = new Map(items.map((it) => [it.id, it]));
  return {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    label: pageLabel(date),
    boardH,
    diary: "",
    photos: stickers.map((s, i) => {
      const it = at.get(s.id);
      return {
        img: imgs[i] ?? null,
        word: s.word.headword,
        note: s.caption ?? undefined,
        place: it?.place,
        ratio: it?.ratio,
        z: it?.z,
        id: s.id,
      };
    }),
  };
}

function countsOf(q: URLSearchParams) {
  return (q.get("n") ?? "7,4,2,1")
    .split(",")
    .map(Number)
    .filter((n) => n >= 1 && n <= PHOTOS.length);
}

/** 本の左ページを描いた絵（枚数ごと）。字体が届く前に描くと代わりの字で焼き付くので、先に待つ。 */
function usePages(counts: number[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const date = new Date();
    void Promise.all([
      ...PHOTOS.map((p) => load(p.src)),
      document.fonts?.ready ?? Promise.resolve(),
    ]).then((loaded) => {
      if (!alive) return;
      const imgs = loaded.slice(0, PHOTOS.length) as Array<HTMLImageElement | null>;
      setUrls(counts.map((n) => paintAlbumDay(dayOf(n, imgs, date)).toDataURL("image/jpeg", 0.88)));
    });
    return () => {
      alive = false;
    };
    // 枚数の組は URL で決まるので、開いた時に1度だけ描く。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return urls;
}

export function BookPageScene({ q }: { q: URLSearchParams }) {
  const counts = countsOf(q);
  const urls = usePages(counts);
  return (
    <div className="min-h-screen space-y-4 p-4" style={{ background: "#6b6f78" }}>
      {urls.map((u, i) => (
        <img key={i} src={u} alt="" className="w-full rounded-md shadow-lg" />
      ))}
    </div>
  );
}

/**
 * 同じ日をホーム（本物の `DayCollage`）と本（本物の `paintAlbumDay`）で並べる。
 * 台紙の形も置き方も同じなので、2つは写真の見た目（紙・テープ・字の色）だけが違う。
 */
export function HomeVsBookScene({ q }: { q: URLSearchParams }) {
  const counts = countsOf(q);
  const urls = usePages(counts);
  return (
    <div className="space-y-8">
      {counts.map((n, i) => (
        <section key={n} className="space-y-3">
          <p className="label-caps text-caption text-muted-foreground">ホーム（{n}枚）</p>
          <DayCollage
            stickers={bookDayStickers(n)}
            onOpen={() => {}}
            heading={<DiaryDate date={new Date()} compact />}
          />
          <p className="label-caps text-caption text-muted-foreground">本棚の本（{n}枚）</p>
          {urls[i] ? (
            <img src={urls[i]} alt="" className="w-full rounded-md shadow-lg" />
          ) : (
            <div className="aspect-[720/1024] w-full animate-pulse rounded-md bg-secondary" />
          )}
        </section>
      ))}
    </div>
  );
}

/** 本の左ページを長押しして開く面（開いた所から。「完了」や「閉じる」で畳む）。 */
export function BookAlbumEditScene({ q }: { q: URLSearchParams }) {
  const n = countsOf(q)[0] ?? 7;
  const [open, setOpen] = useState(true);
  return (
    <>
      <DayCollage
        stickers={bookDayStickers(n)}
        onOpen={() => {}}
        heading={<DiaryDate date={new Date()} />}
      />
      {!open && (
        <button
          type="button"
          className="mt-3 min-h-11 rounded-full bg-primary px-5 text-footnote font-semibold text-primary-foreground"
          onClick={() => setOpen(true)}
        >
          もう一度開く（本の左ページを長押しした所）
        </button>
      )}
      {open && (
        <BookAlbumEditor
          date={new Date()}
          stickers={bookDayStickers(n)}
          surface="album-bg-paper"
          onOpen={() => {}}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
