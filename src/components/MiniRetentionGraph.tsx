import { useMemo } from "react";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { LEVEL_EDGES } from "@/lib/memory-curve";
import { MEMORY_LEVELS } from "@/lib/memory";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceDot,
} from "recharts";

/**
 * 全体の記憶率(前後2週間)。
 *
 * **過去は記録から作った実際の値**で、未来だけが予測。
 * 以前はここが「いまの状態を過去へ投げ返した線」だったので、
 * 復習した瞬間に過去14日が全部 100% に跳ね上がっていた。
 *
 * その日に**まだ無かった**語しか無い日は `null` が来る — 0% ではないので、
 * 線をそこで切る(`connectNulls` を付けない)。
 *
 * ## 2026-10-02 線は1色、**地を記憶の段の帯で塗り分ける**
 *
 * > オーナー指示「グラフはグラフ自体の色を変えるのではなく、グラフの域範囲で色を
 * > 変える。ただし案 D のグラフの範囲の色は見にくい」「現行のように過去にスムーズに
 * > トラックできるままにして」
 *
 * 以前は線そのものを値で塗り分けていた（赤→黄→緑）。いまは線は主色の1本で、
 * 背景を `memoryLevel` と同じ境目（30 / 50 / 70 / 85 / 95）で帯に分け、帯の左上に
 * 段の名前を置く。帯の色は `styles.css` の `.mem-band`（段の色を地に薄く混ぜた不透明の
 * 色。案 D の 12% の透かしは明るい画面で白に溶けて見えなかったので、混ぜる割合を
 * 上げ、帯の境に地の色の細い線を引く）。
 *
 * 縦軸は**データのある所へ寄せる**（下端は段の境目に合わせる）。0〜100 の固定だと
 * 「はっきり」の帯が 5px しか無く、名前も線の動きも読めない。
 */
export function MiniRetentionGraph({
  series,
}: {
  series: Array<{ day_offset: number; avg_retention: number | null; counted?: number }>;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());
  const nowMs = useMemo(() => Date.now(), []);
  const pts = series.map((p) => ({ d: p.day_offset, r: p.avg_retention }));
  const past = pts.filter((p) => p.d <= 0);
  const future = pts.filter((p) => p.d >= 0);
  const values = pts.flatMap((p) => (p.r == null ? [] : [p.r]));
  const today = pts.find((p) => p.d === 0)?.r ?? null;
  const lo = Math.min(0, ...pts.map((p) => p.d));
  const hi = Math.max(0, ...pts.map((p) => p.d));
  // 下端は、いちばん低い値より 3 ポイント以上下にある段の境目。
  const low = Math.min(...values, 100);
  const yMin = [70, 50, 30, 0].find((b) => b <= low - 3) ?? 0;
  const bands = levelBands(yMin);
  const yTicks = axisTicks(yMin);
  const dateOf = (d: number) =>
    new Date(nowMs + d * 86_400_000).toLocaleDateString(locale, {
      month: "numeric",
      day: "numeric",
    });
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 20, right: 22, bottom: 0, left: -18 }}>
          {/* 段の帯。線より先に描く（下に敷く）。 */}
          {bands.map((b) => (
            <ReferenceArea
              key={b.level}
              x1={lo}
              x2={hi}
              y1={b.lo}
              y2={b.hi}
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
                // 名前は帯の**縦の真ん中**に置く — 「はっきり」の帯（95〜100%）は 12px ほどしか
                // 無いので、上に寄せると下の帯へはみ出す。
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
                    {t(MEMORY_LEVELS[b.level].labelKey)}
                  </text>
                );
              }}
            />
          ))}
          <XAxis
            type="number"
            dataKey="d"
            domain={[lo, hi]}
            ticks={[lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i)}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v: number) => (v === 0 ? t("rv.today") : dateOf(v))}
            stroke="var(--muted-foreground)"
            fontSize={11}
          />
          <YAxis
            domain={[yMin, 100]}
            ticks={yTicks}
            interval={0}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            stroke="var(--muted-foreground)"
            fontSize={10}
            allowDataOverflow
          />
          {/* これから（点線・予測）。線は1色（`--primary`）。点は日ごとの整数なので、
              `monotone` で全部の点を通しつつなめらかに結ぶ（直線だと寄せた縦軸で階段に見える）。 */}
          <Line
            data={future}
            dataKey="r"
            type="monotone"
            stroke="var(--primary)"
            strokeWidth={2.5}
            strokeDasharray="6 5"
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            data={past}
            dataKey="r"
            type="monotone"
            stroke="var(--primary)"
            strokeWidth={3}
            strokeLinejoin="round"
            dot={false}
            isAnimationActive={false}
          />
          {today != null && (
            <ReferenceDot
              x={0}
              y={today}
              r={6}
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth={3}
              label={{
                value: t("curve.todayPct", { pct: today }),
                position: "top",
                fill: "var(--foreground)",
                fontSize: 12,
                fontWeight: 700,
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
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
