import { useEffect, useId, useState } from "react";
import type { DexItem } from "@/lib/dex-catalog";
import { dexGlyphOf } from "@/lib/dex-glyphs";
import type { DexSilShape } from "@/lib/dex-silhouettes.generated";

/**
 * **図鑑の、まだ捕まえていない物の影**（オーナー指示 2026-10-08「図鑑の影のクオリティーが低い。
 * もっとデザインのクオリティーを最高品質にして」）。
 *
 * 前は lucide の線の絵を灰色に塗っていた — 線なので影に見えず、鳥・鴿子・麻雀が同じ絵だった。
 * いまは項目ごとに別の**塗りの形**（`dex-glyphs.ts` の表、形は `dex-silhouettes.generated.ts`）。
 *
 * - 色は地の色から作る（`.dex-sil` の CSS 変数）。上が明るく下が濃い、ごく弱い縦のグラデーションに、
 *   下側 1px の明るい縁（押し型のような凹み）。暗いテーマでもそのまま合う。
 * - 形の表（約 150 KB、gzip 約 60 KB）は**図鑑で影を出す時だけ**読む（`import()`）。最初の画面の
 *   荷物を増やさない。読み終わるまでは何も描かない（マスの大きさは外側で決まっているので、ずれない）。
 */

type Shapes = Readonly<Record<string, DexSilShape>>;

let shapes: Shapes | null = null;
let loading: Promise<Shapes> | null = null;

/** 形の表を読む（1回だけ）。 */
function loadDexSilhouettes(): Promise<Shapes> {
  loading ??= import("@/lib/dex-silhouettes.generated").then(
    (m) => (shapes = m.DEX_SIL_SHAPES),
    (e: unknown) => {
      // 読めなかった（圏外・公開の切り替わりの間）。次に図鑑を開いた時に読み直せるよう忘れる。
      loading = null;
      throw e;
    },
  );
  return loading;
}

/** 形の表。読めなかった時は `"failed"`（角の丸い四角で代える）。 */
function useShapes(): Shapes | "failed" | null {
  const [s, setS] = useState<Shapes | "failed" | null>(shapes);
  useEffect(() => {
    if (s) return;
    let alive = true;
    loadDexSilhouettes().then(
      (v) => alive && setS(v),
      () => alive && setS("failed"),
    );
    return () => {
      alive = false;
    };
  }, [s]);
  return s;
}

/**
 * `.sil`: 影（マスの幅の 52% の正方形。形は外枠いっぱいに合わせてあるので、余白の多かった前の線の絵より
 * 小さめに。下に見出し語を重ねるので、マスの側で少し上に寄せる）。
 * 表に絵の無い id（無いはずだが、表が古い端末のデータなど）は角の丸い四角。
 */
export function DexSilhouette({ item }: { item: Pick<DexItem, "id"> }) {
  const all = useShapes();
  // useId は「:r1:」のような記号を含むので、url(#…) で引ける形に。
  const gid = "dexsil" + useId().replace(/[^\w-]/g, "");
  const ref = dexGlyphOf(item.id);
  const shape = all && all !== "failed" && ref ? all[ref] : null;
  return (
    <span aria-hidden className="dex-sil grid aspect-square w-[52%] place-items-center">
      {shape ? (
        <svg
          viewBox={shape[0]}
          className="dex-sil-art h-full w-full overflow-visible"
          data-dex-glyph={ref}
          focusable="false"
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="dex-sil-top" />
              <stop offset="1" className="dex-sil-bottom" />
            </linearGradient>
          </defs>
          <path d={shape[1]} fill={`url(#${gid})`} fillRule={shape[2] ? "evenodd" : undefined} />
        </svg>
      ) : all ? (
        <span className="dex-sil-art block h-[70%] w-[70%] rounded-[22%] bg-[var(--dex-sil-bottom)]" />
      ) : null}
    </span>
  );
}
