import type { SeriesPoint } from "./model";

/**
 * 前後2週間の小さな線（案B・案Dの畳んだ行）。**数は読ませない** — 値は隣の字が言う。
 * recharts を使わないのは、畳んだ行は復習を開いた瞬間に出るから（recharts は
 * 押すまで読み込まない約束 — `review.tsx` の `lazyWithRetry` の注）。
 *
 * これまでは実線、これからは点線で薄く（予測を記録と同じ強さで描かない）。
 */
export function Sparkline({
  series,
  height = 40,
}: {
  series: readonly SeriesPoint[];
  height?: number;
}) {
  const pts = series.filter((p): p is { day_offset: number; avg_retention: number } =>
    Number.isFinite(p.avg_retention),
  );
  if (pts.length < 2) return null;
  const W = 112;
  const H = height;
  const pad = 4;
  const lo = Math.min(...pts.map((p) => p.day_offset), 0);
  const hi = Math.max(...pts.map((p) => p.day_offset), 0);
  const vMin = Math.min(50, ...pts.map((p) => p.avg_retention - 5));
  const x = (d: number) => pad + ((d - lo) / Math.max(1, hi - lo)) * (W - pad * 2);
  const y = (v: number) => pad + ((100 - v) / Math.max(1, 100 - vMin)) * (H - pad * 2);
  const path = (xs: typeof pts) =>
    xs
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${x(p.day_offset).toFixed(1)},${y(p.avg_retention).toFixed(1)}`,
      )
      .join(" ");
  const past = pts.filter((p) => p.day_offset <= 0);
  const future = pts.filter((p) => p.day_offset >= 0);
  const today = pts.find((p) => p.day_offset === 0);
  return (
    // 幅は固定（112px）。伸ばすと今日の点が楕円になる。
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="block">
      {/* 今日の縦の目印（どこからが予測かの境目）。 */}
      <line x1={x(0)} x2={x(0)} y1={0} y2={H} stroke="var(--border)" strokeWidth={1} />
      {future.length > 1 && (
        <path
          d={path(future)}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth={1.75}
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
      )}
      {past.length > 1 && (
        <path
          d={path(past)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {today && (
        <circle
          cx={x(0)}
          cy={y(today.avg_retention)}
          r={3.5}
          fill="var(--primary)"
          stroke="var(--card)"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
