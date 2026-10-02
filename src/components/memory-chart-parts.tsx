import { ReferenceArea } from "recharts";
import { useT } from "@/lib/i18n";
import { LEVEL_EDGES } from "@/lib/memory-curve";
import { MEMORY_LEVELS } from "@/lib/memory";

/**
 * **記憶のグラフの共通の部品**（オーナー指示 2026-10-02「2つのグラフのデザインと機能を
 * 統一して。いいところを取り合って」）。
 *
 * 復習の上の「全体の記憶率」（`MiniRetentionGraph`）と、単語ごとの忘却曲線
 * （`MemoryCurveChart`）が同じ物を使う:
 *  ・地を記憶の段の帯で塗り分ける（`levelBands` / `bandAreas`）— 全体のグラフの良い所
 *  ・縦軸の目盛りは段の境目、下端はデータに寄せる（`chartYMin` / `axisTicks`）
 *  ・線は主色の1本、これまでは実線・これからは点線、凡例（`ChartLegend`）— 単語の曲線の良い所
 *  ・点を持って辿る（`CurveScrubber.tsx`）
 */

/** 縦軸の下端: いちばん低い値より 3 ポイント以上下にある段の境目（データの無い所を描かない）。 */
export function chartYMin(values: readonly number[]): number {
  const low = Math.min(...values, 100);
  return [70, 50, 30, 0].find((b) => b <= low - 3) ?? 0;
}

type ViewBox = { x?: number; y?: number; width?: number; height?: number };
type BandShape = { x?: number; y?: number; width?: number; height?: number };

/**
 * 段の帯（下端 `yMin` から上）。境目は `memoryLevel` と同じ `LEVEL_EDGES`
 * （一覧やバッジと同じ色が同じ高さに来る）。
 */
export function levelBands(yMin: number): Array<{ level: number; lo: number; hi: number }> {
  const edges = [0, ...LEVEL_EDGES, 100];
  const out: Array<{ level: number; lo: number; hi: number }> = [];
  for (let level = 0; level < edges.length - 1; level++) {
    const lo = edges[level];
    const hi = edges[level + 1];
    if (hi <= yMin) continue;
    out.push({ level, lo: Math.max(lo, yMin), hi });
  }
  return out;
}

/**
 * 縦軸の目盛り = 帯の境目。ただし**重なる字は出さない**: 上（100%）から下へ見て、
 * 直前の目盛りと軸の幅の 10% 未満しか離れていない境目は落とす（95 と 100 は
 * 下端が 30% 以下のとき 10px も離れない）。下端は必ず出す。
 */
export function axisTicks(yMin: number): number[] {
  const minGap = (100 - yMin) * 0.1;
  const edges = [100, ...[...LEVEL_EDGES].reverse(), 0].filter((e) => e > yMin);
  const kept: number[] = [];
  for (const e of edges) {
    if (kept.length === 0 || kept[kept.length - 1] - e >= minGap) kept.push(e);
  }
  if (kept[kept.length - 1] - yMin < minGap) kept.pop();
  kept.push(yMin);
  return kept.sort((a, b) => a - b);
}

/**
 * 段の帯を `ReferenceArea` の並びで返す（グラフの子として**線より先に**置く）。
 * 部品ではなく関数なのは、recharts が子の型を見て描き分けるため（包むと描かれない）。
 */
export function bandAreas(
  bands: ReturnType<typeof levelBands>,
  x: [number, number],
  label: (level: number) => string,
) {
  return bands.map((b) => (
    <ReferenceArea
      key={`band-${b.level}`}
      x1={x[0]}
      x2={x[1]}
      y1={b.lo}
      y2={b.hi}
      ifOverflow="hidden"
      shape={(p: BandShape) => (
        <rect
          x={p.x}
          y={p.y}
          width={p.width}
          height={p.height}
          className={`mem-lv-${b.level} mem-band`}
        />
      )}
      label={(p: { viewBox?: ViewBox }) => {
        const v = p.viewBox ?? {};
        // 帯が字より低い時は名前を出さない（はみ出して隣の帯に重なる）。
        // 名前は帯の**縦の真ん中**に置く（「はっきり」の帯は 12px ほどしか無い）。
        if ((v.height ?? 0) < 11) return <g />;
        return (
          <text
            x={(v.x ?? 0) + 6}
            y={(v.y ?? 0) + (v.height ?? 0) / 2 + 3.5}
            textAnchor="start"
            fontSize={10}
            fontWeight={600}
            className={`mem-lv-${b.level} mem-band-label`}
          >
            {label(b.level)}
          </text>
        );
      }}
    />
  ));
}

/** 帯の名前（`memory.levelN`）。 */
export function useBandLabel() {
  const t = useT();
  return (level: number) => t(MEMORY_LEVELS[level].labelKey);
}

/**
 * 凡例（2つのグラフで同じ）: これまで（実線）・復習しなかったら（点線）・復習した日（白丸）。
 * 復習した日は、その印を描くグラフ（単語ごとの曲線）だけ。
 */
export function ChartLegend({ reviews = false }: { reviews?: boolean }) {
  const t = useT();
  return (
    <div
      className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground"
      aria-hidden
    >
      <span className="inline-flex items-center gap-1">
        <svg width="18" height="6">
          <line x1="1" y1="3" x2="17" y2="3" stroke="var(--primary)" strokeWidth="2.5" />
        </svg>
        {t("curve.legendPast")}
      </span>
      <span className="inline-flex items-center gap-1">
        <svg width="18" height="6">
          <line
            x1="1"
            y1="3"
            x2="17"
            y2="3"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeDasharray="4 3"
          />
        </svg>
        {t("curve.legendFuture")}
      </span>
      {reviews && (
        <span className="inline-flex items-center gap-1">
          <svg width="10" height="10">
            <circle
              cx="5"
              cy="5"
              r="3.5"
              fill="var(--card)"
              stroke="var(--primary)"
              strokeWidth="2"
            />
          </svg>
          {t("curve.legendReview")}
        </span>
      )}
    </div>
  );
}
