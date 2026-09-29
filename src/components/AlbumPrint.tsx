import type { CSSProperties } from "react";
import { Term } from "@/components/Term";
import { decorFor } from "@/lib/collage-decor";
import type { WallId } from "@/lib/wallpaper";

/** 写真を壁に留める物（`lib/collage-decor.ts`）。ホームのアルバムと初回の画面で共有する。 */
export function CollageFasteners({ id, wall }: { id: string; wall: WallId }) {
  const d = decorFor(id, wall);
  if (d.kind === "none") return null;
  if (d.kind === "pin") {
    // コルクの壁は**画鋲**。頭の色は4色、位置は上の辺の真ん中あたり。
    return (
      <span
        aria-hidden="true"
        className={`collage-pin collage-pin--${d.color}`}
        style={{ left: `${d.x}%` }}
      />
    );
  }
  if (d.kind === "corners") {
    return (
      <>
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <span key={c} aria-hidden="true" className={`collage-corner collage-corner--${c}`} />
        ))}
      </>
    );
  }
  return (
    <>
      {d.tapes.map((tp) => (
        <span
          key={tp.spot}
          aria-hidden="true"
          className={`collage-tape collage-tape--${tp.spot} collage-tape--${tp.color}`}
          style={{ rotate: `${tp.rot}deg` }}
        />
      ))}
    </>
  );
}

/**
 * **ホームのアルバムと同じ1枚の写真**（オーナー指示 2026-09-29「写真自体のデザインも
 * ホーム画面のアルバムの写真と全く同じものにして」）。
 *
 * 中身はホームの札と同じクラス（`collage__photo` / `collage__print` / `collage__margin`）
 * と同じ留め具。**箱の形は写真の比のまま**（`ratio` = 高さ÷幅）にするので、写真は
 * 上下も左右も切られず、縦に潰れもしない。語を書く下の白い余白は、ホームと同じく
 * 箱の下へ `--pol-strip` ぶんはみ出す — 並べる側はその高さも見込んで置く。
 */
export function AlbumPrint({
  id,
  src,
  word,
  lang,
  ratio,
  note,
  plainWord = false,
  fasteners = true,
  className,
  style,
}: {
  /** 留め具を決める種（ホームと同じく `id` から決まる）。 */
  id: string;
  src: string;
  word: string;
  lang?: string | null;
  /** 写真の高さ÷幅。 */
  ratio: number;
  /** 写真の下に手書きで添える一言（ホームの「撮ったときに書いた一言」と同じ）。 */
  note?: string;
  /** 語ではなく画面の言葉（「食べ物」など）を書くとき。学習言語の字組みにしない。 */
  plainWord?: boolean;
  /**
   * テープ・四隅留めを付けるか。初回の画面（最初の画面・興味の質問・準備ができました・
   * ログイン）では付けない（オーナー指示 2026-09-30「付箋や角の装飾はいらない」）。
   * 紙・下の余白の語・影はホームと同じまま。
   */
  fasteners?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`album-print ${className ?? ""}`}
      style={{ ...style, ["--print-ratio" as string]: String(ratio) }}
    >
      <span className="collage__photo">
        <span className="collage__print">
          <img
            src={src}
            alt=""
            loading="eager"
            decoding="async"
            className="block h-full w-full object-cover"
          />
        </span>
        <span className="collage__margin">
          {plainWord ? (
            <span className="collage__margin-word">{word}</span>
          ) : (
            <Term lang={lang} className="collage__margin-word">
              {word}
            </Term>
          )}
        </span>
      </span>
      {fasteners && <CollageFasteners id={id} wall="paper" />}
      {note && (
        <span className="collage__cap album-print__cap">
          <span className="collage__note handwritten-ja ja-phrase">{note}</span>
        </span>
      )}
    </span>
  );
}
