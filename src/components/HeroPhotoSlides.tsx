import { useRef, useState } from "react";
import type { StickerPhoto } from "@/lib/encounters.functions";
import { CachedImg } from "@/lib/image-cache";
import { useT } from "@/lib/i18n";

/**
 * 単語の詳細のいちばん上の写真を、**横に送れる**ようにする。
 *
 * （オーナー指示 2026-09-22「昔同じものを撮って複数画像を単語の詳細に
 *  追加するときは、単語の詳細の画像を同様に横にスライドできるようにして」）
 *
 *  ・1枚目はこれまでどおりの表の絵（切り抜き・自撮りの指定も含めて
 *    `pickStickerPhoto` が決めた物）。2枚目から、**別の日に出会ったときの
 *    写真**を撮った順に並べる。最初の1枚（`first`）は表の絵の元なので
 *    重ねて並べない。
 *  ・下の点で何枚目かを示し、2枚目からは撮った日と場所を添える。
 *  ・横に流す箱なので、画面の左右の払い（タブ移動・戻る）には取られない
 *    （`overflow-x-auto` が目印）。
 */
export function HeroPhotoSlides({
  heroUrl,
  heroAlt,
  photos,
  dateLocale,
  className = "",
}: {
  heroUrl: string;
  heroAlt: string;
  photos: StickerPhoto[];
  dateLocale: string;
  className?: string;
}) {
  const t = useT();
  const rest = [...photos]
    .filter((p) => !p.first)
    .sort((a, b) => +new Date(a.taken_at) - +new Date(b.taken_at));
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const total = rest.length + 1;

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== index) setIndex(i);
  };

  return (
    <>
      <div
        ref={ref}
        onScroll={onScroll}
        className={`hero-slides absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${className}`}
        aria-roledescription="carousel"
        aria-label={t("photos.title")}
      >
        <div className="relative h-full w-full shrink-0 snap-center">
          <CachedImg src={heroUrl} alt={heroAlt} className="h-full w-full object-cover" />
        </div>
        {rest.map((p, i) => (
          <div key={`${p.url}-${i}`} className="relative h-full w-full shrink-0 snap-center">
            <img
              src={p.url}
              alt={t("photos.alt", { n: String(i + 2) })}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-caption font-semibold text-white">
              {new Date(p.taken_at).toLocaleDateString(dateLocale)}
              {p.place ? ` · ${p.place}` : ""}
            </span>
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5"
        aria-hidden
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full bg-white shadow transition-all ${
              i === index ? "w-4 opacity-100" : "w-1.5 opacity-60"
            }`}
          />
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {index + 1} / {total}
      </span>
    </>
  );
}
