import { useRef, useState, type ReactNode } from "react";
import { photo } from "./peel-sticker";

/**
 * **アルバムを本のようにめくる**（試作・未実装、オーナー指示 2026-09-27
 * 「ホームのアルバムを見開き・ページめくりにした試作」「iPhone の折りたたみ
 * 向けの案も」）。
 *
 * - スマホ（縦長）… 1ページずつ。右端から左へ払う（または ›）と紙がめくれる
 * - 折りたたみを開いた時（横に広い）… 左右2ページの見開き。右のページが
 *   背表紙を軸に左へ倒れる
 *
 * 本番のアルバム（`DayCollage`）は変えていない。ここは動きと見え方の確認だけ。
 * 上の切り替えで「スマホ / 折りたたみを開いた時」の幅を試せる。
 */
const DAYS = [
  { date: "9月27日", words: ["珍珠奶茶", "夜市", "腳踏車"], tint: "#fdf6e3" },
  { date: "9月26日", words: ["芒果", "雨傘"], tint: "#f5f1ff" },
  { date: "9月25日", words: ["捷運", "獎學金", "便當"], tint: "#eefaf3" },
  { date: "9月24日", words: ["公車"], tint: "#fff1f1" },
  { date: "9月23日", words: ["面紙", "雞肉"], tint: "#eef6ff" },
  { date: "9月22日", words: ["滷肉飯"], tint: "#fdf6e3" },
];

function Page({ i }: { i: number }) {
  const d = DAYS[i];
  if (!d) return <div className="flip-page__paper" style={{ background: "#faf8f3" }} />;
  return (
    <div className="flip-page__paper" style={{ background: d.tint }}>
      <p className="text-center text-title font-bold">{d.date}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 px-3">
        {d.words.map((w, k) => (
          <figure key={w} className="flip-page__photo" style={{ rotate: `${k % 2 ? 3 : -3}deg` }}>
            <img src={photo} alt="" className="aspect-square w-full rounded-md object-cover" />
            <figcaption lang="zh-Hant" className="mt-1 text-center text-headline font-bold">
              {w}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="flip-page__num">{i + 1}</p>
    </div>
  );
}

function Book({ spread }: { spread: boolean }) {
  const step = spread ? 2 : 1;
  const [at, setAt] = useState(0);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const start = useRef<number | null>(null);
  const canNext = at + step < DAYS.length;
  const canPrev = at > 0;

  const go = (dir: "next" | "prev") => {
    if (turning || (dir === "next" ? !canNext : !canPrev)) return;
    setTurning(dir);
    window.setTimeout(() => {
      setAt((n) => (dir === "next" ? n + step : n - step));
      setTurning(null);
    }, 650);
  };

  // 下にある（めくった後に見える）ページと、めくれる紙の表と裏。
  const under: ReactNode =
    turning === "next" ? (
      spread ? (
        <>
          <Page i={at} />
          <Page i={at + 3} />
        </>
      ) : (
        <Page i={at + 1} />
      )
    ) : turning === "prev" ? (
      spread ? (
        <>
          <Page i={at - 2} />
          <Page i={at + 1} />
        </>
      ) : (
        <Page i={at} />
      )
    ) : spread ? (
      <>
        <Page i={at} />
        <Page i={at + 1} />
      </>
    ) : (
      <Page i={at} />
    );

  return (
    <div
      className={`flip-book ${spread ? "flip-book--spread" : ""}`}
      onPointerDown={(e) => (start.current = e.clientX)}
      onPointerUp={(e) => {
        if (start.current == null) return;
        const dx = e.clientX - start.current;
        start.current = null;
        if (dx < -40) go("next");
        else if (dx > 40) go("prev");
      }}
    >
      <div className="flip-book__under">{under}</div>
      {turning && (
        <div
          className={`flip-leaf flip-leaf--${turning}`}
          style={spread ? { left: "50%", width: "50%" } : undefined}
        >
          <div className="flip-leaf__front">
            <Page i={turning === "next" ? (spread ? at + 1 : at) : spread ? at - 1 : at - 1} />
          </div>
          <div className="flip-leaf__back">
            <Page i={turning === "next" ? (spread ? at + 2 : at + 1) : spread ? at : at} />
          </div>
        </div>
      )}
      {spread && <div className="flip-book__spine" aria-hidden />}
      <div className="flip-book__nav">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => go("prev")}
          aria-label="前のページ"
        >
          ‹
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => go("next")}
          aria-label="次のページ"
        >
          ›
        </button>
      </div>
    </div>
  );
}

export function PageFlipScene({ q }: { q: URLSearchParams }) {
  const [wide, setWide] = useState(q.get("w") === "fold");
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="画面の幅" className="flex gap-1.5">
        {[
          { v: false, label: "スマホ（1ページ）" },
          { v: true, label: "折りたたみを開いた時（見開き）" },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={wide === o.v}
            onClick={() => setWide(o.v)}
            className={`min-h-11 rounded-full px-3 text-footnote font-semibold ${
              wide === o.v ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto pb-16">
        <div style={{ width: wide ? 720 : "100%", margin: "0 auto" }}>
          <Book key={String(wide)} spread={wide} />
        </div>
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        左へ払う・› で次の日、右へ払う・‹ で前の日。見開きの幅は折りたたみの iPhone
        を開いた時を想定した約720px（実機の幅は発売後に合わせる）。
      </p>
    </div>
  );
}
