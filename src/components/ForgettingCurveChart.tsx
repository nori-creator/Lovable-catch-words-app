import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Dot,
} from "recharts";

export type HistoryPoint = {
  reviewed_at: string; // ISO
  score: number; // 0-5
  interval_days_after: number;
  ease_after: number;
};

type Props = {
  history: HistoryPoint[];
  currentEase?: number;
  currentIntervalDays?: number;
  lastReviewedAt?: string | null;
  /** Cap horizon (days from first review point) for the chart x axis */
  horizonDays?: number;
};

/**
 * Renders an estimated forgetting curve based on SM-2 outputs.
 *
 * Model: R(t) = exp(-t / S), where S ≈ interval_days * ease (memory stability)
 * After each review, S is "reset" — the curve restarts from 100% at that point.
 */
export function ForgettingCurveChart({
  history,
  currentEase = 2.5,
  currentIntervalDays = 1,
  lastReviewedAt,
  horizonDays = 30,
}: Props) {
  const data = useMemo(() => {
    if (history.length === 0 && !lastReviewedAt) return [];
    const segments: Array<{
      t: number; // days from t0
      retention: number; // 0-100
      reviewMark?: number; // 0-100 if this point is an actual review
    }> = [];

    const points = [...history].sort(
      (a, b) => new Date(a.reviewed_at).getTime() - new Date(b.reviewed_at).getTime(),
    );

    const t0 = points.length
      ? new Date(points[0].reviewed_at).getTime()
      : lastReviewedAt
      ? new Date(lastReviewedAt).getTime()
      : Date.now();

    // For each segment between reviews, draw the exp decay curve from 100% at
    // the review time using S = interval_days * ease at that review.
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const next = points[i + 1];
      const startMs = new Date(p.reviewed_at).getTime();
      const endMs = next ? new Date(next.reviewed_at).getTime() : startMs + horizonDays * 86400_000;
      const stability = Math.max(0.5, p.interval_days_after * Math.max(1, p.ease_after));

      const startT = (startMs - t0) / 86400_000;
      segments.push({ t: round(startT), retention: 100, reviewMark: 100 });

      // sample a few points along the curve
      const steps = 8;
      for (let k = 1; k <= steps; k++) {
        const tMs = startMs + ((endMs - startMs) * k) / steps;
        const dt = (tMs - startMs) / 86400_000;
        const retention = 100 * Math.exp(-dt / stability);
        segments.push({ t: round((tMs - t0) / 86400_000), retention: round(retention) });
      }
    }

    // If no history but we have a current state, project the future curve.
    if (points.length === 0 && lastReviewedAt) {
      const stability = Math.max(0.5, currentIntervalDays * Math.max(1, currentEase));
      const startMs = new Date(lastReviewedAt).getTime();
      const startT = (startMs - t0) / 86400_000;
      segments.push({ t: round(startT), retention: 100, reviewMark: 100 });
      for (let k = 1; k <= 12; k++) {
        const dt = (horizonDays * k) / 12;
        segments.push({ t: round(startT + dt), retention: round(100 * Math.exp(-dt / stability)) });
      }
    }

    return segments;
  }, [history, currentEase, currentIntervalDays, lastReviewedAt, horizonDays]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
        まだ復習データがありません。復習すると忘却曲線がここに表示されます。
      </div>
    );
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => `${Math.round(v)}d`}
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
          />
          <Tooltip
            formatter={(v: number) => [`${v}%`, "記憶率"]}
            labelFormatter={(l) => `${Math.round(Number(l))}日後`}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={80} stroke="hsl(var(--primary))" strokeDasharray="2 4" />
          <Line
            type="monotone"
            dataKey="retention"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, payload, key } = props as {
                cx?: number;
                cy?: number;
                payload?: { reviewMark?: number };
                key?: string | number;
              };
              if (!payload?.reviewMark || cx == null || cy == null) {
                return <g key={key} />;
              }
              return (
                <Dot key={key} cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
              );
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
