import { useId, useMemo } from "react";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { levelOfR } from "@/lib/memory-curve";
import { levelGradient } from "@/components/ForgettingCurveChart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceDot,
  CartesianGrid,
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
 * 見た目は1語の曲線（`MemoryCurveChart`）とそろえる（オーナー指摘
 * 2026-09-22「記憶のグラフが見づらい」）: 今日に点、線は値で塗り分け、
 * これまでは実線・これからは点線、日付は両端と今日だけ。
 */
export function MiniRetentionGraph({
  series,
}: {
  series: Array<{ day_offset: number; avg_retention: number | null; counted?: number }>;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());
  const uid = useId().replace(/:/g, "");
  const nowMs = useMemo(() => Date.now(), []);
  const pts = series.map((p) => ({ d: p.day_offset, r: p.avg_retention }));
  const past = pts.filter((p) => p.d <= 0);
  const future = pts.filter((p) => p.d >= 0);
  const values = (xs: typeof pts) => xs.flatMap((p) => (p.r == null ? [] : [p.r]));
  const pastG = levelGradient(`mr-past-${uid}`, values(past));
  const futureG = levelGradient(`mr-future-${uid}`, values(future));
  const today = pts.find((p) => p.d === 0)?.r ?? null;
  const lo = Math.min(0, ...pts.map((p) => p.d));
  const hi = Math.max(0, ...pts.map((p) => p.d));
  const dateOf = (d: number) =>
    new Date(nowMs + d * 86_400_000).toLocaleDateString(locale, {
      month: "numeric",
      day: "numeric",
    });
  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 20, right: 14, bottom: 0, left: -18 }}>
          <defs>
            {pastG.def}
            {futureG.def}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
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
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            stroke="var(--muted-foreground)"
            fontSize={11}
          />
          <Line
            data={future}
            dataKey="r"
            type="linear"
            stroke={futureG.stroke}
            strokeWidth={2.5}
            strokeDasharray="6 5"
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            data={past}
            dataKey="r"
            type="linear"
            stroke={pastG.stroke}
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
              fill={`var(--mem-${levelOfR(today)})`}
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
