import { useMemo } from "react";
import type { StickerPhoto } from "@/lib/encounters.functions";
import { useT } from "@/lib/i18n";

/**
 * その単語をこれまでに撮った写真を、撮った順に並べる。
 *
 * ## 何を見せたいか
 * 同じものに何度も出会った記録は「覚えた量」ではなく**通った道**なので、
 * 時系列に並べる。1枚目には印を付ける — どれが最初かは、並びだけでは
 * 分からない。
 *
 * ## 1枚しか無いときは出さない
 * 上に大きな写真がもう出ている。同じ絵をもう一度小さく並べても、
 * 増えるのは高さだけ。**再会があったときだけ**意味がある区画。
 */
export function StickerPhotoHistory({
  photos,
  dateLocale,
}: {
  photos: StickerPhoto[];
  dateLocale: string;
}) {
  const t = useT();
  // 「はじめて」の1枚が先、以降は撮った順。サーバ側でも並べているが、
  // 並びは見た目の意味を持つので、描く側でも決めておく。
  const ordered = useMemo(
    () => [...photos].sort((a, b) => +new Date(a.taken_at) - +new Date(b.taken_at)),
    [photos],
  );
  if (ordered.length < 2) return null;

  // 上下どちらにも間を取る。この区画は「上の写真」と「下の解説」の
  // あいだに割って入るので、片側だけ空けると下がくっつく。
  // 描かない(1枚以下)ときは section ごと出ないので、空の余白は残らない。
  return (
    <section className="my-4 rounded-3xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-headline font-semibold">{t("photos.title")}</h2>
        <span className="text-caption text-muted-foreground">
          {t("photos.count", { n: String(ordered.length) })}
        </span>
      </div>
      {/* 2列。3列にすると 390px の画面で1枚が約110pxになり、
          何が写っているか分からなくなる。写真は主役なので大きく取る。 */}
      <ul className="grid grid-cols-2 gap-3">
        {ordered.map((p, i) => (
          <li key={`${p.url}-${i}`} className="min-w-0">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary ring-1 ring-black/5">
              <img
                src={p.url}
                alt={t("photos.alt", { n: String(i + 1) })}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {p.first && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground shadow">
                  {t("photos.first")}
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate text-caption text-muted-foreground">
              {new Date(p.taken_at).toLocaleDateString(dateLocale)}
              {p.place ? ` · ${p.place}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
