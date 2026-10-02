import { useMemo, useRef, useState } from "react";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceDot,
  Customized,
} from "recharts";
import {
  axisTicks,
  bandAreas,
  ChartLegend,
  chartYMin,
  levelBands,
  useBandLabel,
} from "@/components/memory-chart-parts";
import {
  CurveScrubber,
  ScaleProbe,
  type ChartGeo,
  type ScrubLayerProps,
} from "@/components/CurveScrubber";

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
  const yMin = chartYMin(values);
  const bands = levelBands(yMin);
  const bandLabel = useBandLabel();
  const yTicks = axisTicks(yMin);
  /**
   * **点を持って過去を辿る**（オーナー指示 2026-10-02「グラフの点はもっと動かせて、
   * グラフに沿って過去の状態をたどれる機能が消えてる」）。単語ごとの忘却曲線と同じ部品。
   * 辿っている間は「今日 94%」の札を隠す（札が2つ重なると読めない）。
   */
  const [scrubbing, setScrubbing] = useState(false);
  const geo = useRef<ChartGeo | null>(null);
  const known = pts.filter((p): p is { d: number; r: number } => p.r != null);
  const whenLabel = (d: number) => {
    const n = Math.round(Math.abs(d));
    if (n === 0) return t("rv.today");
    return d < 0 ? t("curve.daysAgo", { n }) : t("curve.daysLater", { n });
  };
  const dateOf = (d: number) =>
    new Date(nowMs + d * 86_400_000).toLocaleDateString(locale, {
      month: "numeric",
      day: "numeric",
    });
  return (
    <>
      <ChartLegend />
      <div className="relative h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 20, right: 22, bottom: 0, left: -18 }}>
            {/* 段の帯。線より先に描く（下に敷く）。 */}
            {bandAreas(bands, [lo, hi], bandLabel)}
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
                label={
                  !scrubbing
                    ? {
                        value: t("curve.todayPct", { pct: today }),
                        position: "top",
                        fill: "var(--foreground)",
                        fontSize: 12,
                        fontWeight: 700,
                      }
                    : undefined
                }
              />
            )}
            <Customized
              component={(props: ScrubLayerProps) => <ScaleProbe {...props} into={geo} />}
            />
          </LineChart>
        </ResponsiveContainer>
        {known.length > 1 && (
          <CurveScrubber
            geo={geo}
            domain={[Math.max(lo, known[0].d), Math.min(hi, known[known.length - 1].d)]}
            valueAt={(d) => seriesValueAt(known, d)}
            color={() => "var(--primary)"}
            whenLabel={whenLabel}
            onActive={setScrubbing}
          />
        )}
      </div>
    </>
  );
}

/**
 * 日ごとの点の間を**直線で補う**（辿る点の高さ）。線は `monotone` でなめらかに描くが、
 * 点の間の差は 1 ポイント前後なので、直線で補っても指の点は線からほとんど離れない。
 * 端より外は端の値。
 */
export function seriesValueAt(known: ReadonlyArray<{ d: number; r: number }>, d: number): number {
  if (known.length === 0) return 0;
  if (d <= known[0].d) return known[0].r;
  for (let i = 1; i < known.length; i++) {
    const a = known[i - 1];
    const b = known[i];
    if (d <= b.d) return a.r + ((b.r - a.r) * (d - a.d)) / Math.max(1e-9, b.d - a.d);
  }
  return known[known.length - 1].r;
}
