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
  ReferenceDot,
} from "recharts";

export type HistoryPoint = {
  reviewed_at: string;
  score: number;
  interval_days_after: number;
  ease_after: number;
};

type Props = {
  history: HistoryPoint[];
  currentEase?: number;
  currentIntervalDays?: number;
  lastReviewedAt?: string | null;
  horizonDays?: number;
};

type Level = "strong" | "fading" | "weak";

function levelOf(retention: number): Level {
  if (retention >= 80) return "strong";
  if (retention >= 50) return "fading";
  return "weak";
}

function colorOf(level: Level): string {
  if (level === "strong") return "#10b981"; // emerald
  if (level === "fading") return "#f59e0b"; // amber
  return "#ef4444"; // red
}

function labelOf(level: Level): string {
  if (level === "strong") return "しっかり覚えている";
  if (level === "fading") return "そろそろ忘れそう";
  return "もう忘れかけ";
}

/**
 * Per-word forgetting curve. The line is colored by current retention level.
 * A pulsing "今ココ" marker shows where this word sits on the curve right now.
 */
export function ForgettingCurveChart({
  history,
  currentEase = 2.5,
  currentIntervalDays = 1,
  lastReviewedAt,
  horizonDays = 30,
}: Props) {
  const { data, nowPoint, level } = useMemo(() => {
    const segments: Array<{ t: number; retention: number; reviewMark?: number }> = [];

    const points = [...history].sort(
      (a, b) => new Date(a.reviewed_at).getTime() - new Date(b.reviewed_at).getTime(),
    );

    const t0 = points.length
      ? new Date(points[0].reviewed_at).getTime()
      : lastReviewedAt
      ? new Date(lastReviewedAt).getTime()
      : Date.now();

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const next = points[i + 1];
      const startMs = new Date(p.reviewed_at).getTime();
      const endMs = next
        ? new Date(next.reviewed_at).getTime()
        : startMs + horizonDays * 86400_000;
      const stability = Math.max(0.5, p.interval_days_after * Math.max(1, p.ease_after));

      const startT = (startMs - t0) / 86400_000;
      segments.push({ t: round(startT), retention: 100, reviewMark: 100 });

      const steps = 10;
      for (let k = 1; k <= steps; k++) {
        const tMs = startMs + ((endMs - startMs) * k) / steps;
        const dt = (tMs - startMs) / 86400_000;
        const retention = 100 * Math.exp(-dt / stability);
        segments.push({ t: round((tMs - t0) / 86400_000), retention: round(retention) });
      }
    }

    if (points.length === 0 && lastReviewedAt) {
      const stability = Math.max(0.5, currentIntervalDays * Math.max(1, currentEase));
      const startMs = new Date(lastReviewedAt).getTime();
      const startT = (startMs - t0) / 86400_000;
      segments.push({ t: round(startT), retention: 100, reviewMark: 100 });
      for (let k = 1; k <= 14; k++) {
        const dt = (horizonDays * k) / 14;
        segments.push({
          t: round(startT + dt),
          retention: round(100 * Math.exp(-dt / stability)),
        });
      }
    }

    // Compute "now" position on the latest segment.
    let nowPoint: { t: number; retention: number } | null = null;
    let level: Level = "strong";
    if (lastReviewedAt) {
      const lastMs = new Date(lastReviewedAt).getTime();
      const dtDays = Math.max(0, (Date.now() - lastMs) / 86400_000);
      const stability = Math.max(0.5, currentIntervalDays * Math.max(1, currentEase));
      const retention = 100 * Math.exp(-dtDays / stability);
      nowPoint = {
        t: round((lastMs - t0) / 86400_000 + dtDays),
        retention: round(retention),
      };
      level = levelOf(retention);
    } else if (segments.length) {
      level = levelOf(segments[segments.length - 1].retention);
    }

    return { data: segments, nowPoint, level };
  }, [history, currentEase, currentIntervalDays, lastReviewedAt, horizonDays]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
        まだ復習データがありません。復習すると忘却曲線がここに表示されます。
      </div>
    );
  }

  const stroke = colorOf(level);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <div className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: stroke, boxShadow: `0 0 0 3px ${stroke}33` }}
          />
          <span className="font-medium" style={{ color: stroke }}>
            {labelOf(level)}
          </span>
          {nowPoint && (
            <span className="text-muted-foreground">· 今 {nowPoint.retention}%</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Legend color="#10b981" label="80%+" />
          <Legend color="#f59e0b" label="50-80%" />
          <Legend color="#ef4444" label="<50%" />
        </div>
      </div>
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
              labelFormatter={(l) => `${Math.round(Number(l))}日`}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <ReferenceLine y={80} stroke="#10b981" strokeDasharray="2 4" />
            <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="2 4" />
            <Line
              type="monotone"
              dataKey="retention"
              stroke={stroke}
              strokeWidth={2.5}
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
                  <Dot
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={stroke}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  />
                );
              }}
              isAnimationActive={false}
            />
            {nowPoint && (
              <ReferenceDot
                x={nowPoint.t}
                y={nowPoint.retention}
                r={7}
                fill={stroke}
                stroke="white"
                strokeWidth={3}
                label={{
                  value: "今ココ",
                  position: "top",
                  fill: stroke,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
