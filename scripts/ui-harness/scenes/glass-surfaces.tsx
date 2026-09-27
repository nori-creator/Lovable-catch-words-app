import { useState, type CSSProperties } from "react";
import { StickerDetailScene } from "./word-card";
import { photo } from "./peel-sticker";

/**
 * **本文・写真・カードの地にもガラスを当てたら**（オーナー指示 2026-09-27
 * 「本文や写真、カードの背景にも適用するを見てみたい。試作品出して」）。
 *
 * 単語の詳細の画面で4つを見比べる。**本番には入れていない** — 当てる所は
 * `styles.css` の `.glass-trial` の中だけ。
 *
 *  A 今の形（押す物・浮いている物だけガラス）
 *  B カードの地をガラスに（後ろに写真をぼかして敷く。敷く物が無いと
 *    ガラスは「薄い白」にしか見えない）
 *  C B ＋ 写真の縁もガラス（縁の光と反射の筋）
 *  D 写真の縁 ＋ 本文をガラス（カードの地は消し、字の1行ずつが曇りの帯）
 */
const VARIANTS = [
  { key: "a", label: "A 今" },
  { key: "b", label: "B カード" },
  { key: "c", label: "C ＋写真" },
  { key: "d", label: "D ＋本文" },
] as const;

export function GlassSurfacesScene({ q }: { q: URLSearchParams }) {
  const initial = VARIANTS.find((v) => v.key === q.get("v"))?.key ?? "b";
  const [v, setV] = useState<(typeof VARIANTS)[number]["key"]>(initial);
  return (
    <div
      className="glass-trial"
      data-v={v}
      style={{ "--glass-photo": `url("${photo}")` } as CSSProperties}
    >
      <div
        role="radiogroup"
        aria-label="ガラスの当て方"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          display: "flex",
          gap: 6,
          padding: "8px 0 10px",
          flexWrap: "wrap",
        }}
      >
        {VARIANTS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={v === o.key}
            onClick={() => setV(o.key)}
            style={{
              flex: "0 0 auto",
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: v === o.key ? "#0a84ff" : "rgba(255,255,255,0.85)",
              color: v === o.key ? "#fff" : "#111",
              fontWeight: 600,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <StickerDetailScene objectUrl={photo} />
    </div>
  );
}
