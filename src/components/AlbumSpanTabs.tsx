import { useT } from "@/lib/i18n";
import { ALBUM_SPANS, type AlbumSpan } from "@/lib/album-span";

/**
 * これまでのページを**日 / 週 / 月**のどれで束ねるか(オーナー指摘⑪)。
 *
 * ## なぜ要るのか
 * ホームは日付ごとに1ページ。毎日撮る人には正しいが、3ヶ月遡ると90ページ
 * になる。オーナーがメモに5回書いた「昔に撮ったもの見ない」「下に
 * スクロールするモチベーションない」はここに効く。
 *
 * ## 形は復習の3択と揃える
 * 同じアプリの中で「3つから1つ選ぶ帯」が2種類あると、押し方を2回
 * 覚えることになる。滑る丸の分母を札の数と一致させるところまで同じ
 * (2択用の `w-1/2` を残したまま3つ目を足して、丸が最後の札の半分しか
 * 覆わなかったことがある)。
 *
 * 通信も状態も持たない。
 */
export function AlbumSpanTabs({
  value,
  onChange,
}: {
  value: AlbumSpan;
  onChange: (s: AlbumSpan) => void;
}) {
  const t = useT();
  return (
    <div
      className="relative mx-auto flex max-w-xs rounded-full border border-border bg-secondary p-0.5 text-caption font-semibold"
      role="tablist"
      aria-label={t("home.spanAria")}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-full bg-background shadow transition-transform duration-200"
        style={{
          width: `calc((100% - 0.25rem) / ${ALBUM_SPANS.length})`,
          transform: `translateX(${ALBUM_SPANS.indexOf(value) * 100}%)`,
        }}
      />
      {ALBUM_SPANS.map((s) => (
        <button
          key={s}
          role="tab"
          aria-selected={value === s}
          onClick={() => onChange(s)}
          className={`relative z-10 min-h-11 flex-1 rounded-full px-2 text-center leading-tight transition-colors ${
            value === s ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {t(`home.span.${s}`)}
        </button>
      ))}
    </div>
  );
}
