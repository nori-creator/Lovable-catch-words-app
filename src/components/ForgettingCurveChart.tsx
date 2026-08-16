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
import { useT } from "@/lib/i18n";

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

/**
 * 線の色。**素の16進を直に書かない。**
 * `#10b981` などを直書きしていたので、暗いテーマで一切変わらず、
 * 黒地の上で発光していた(同じ問題を記憶レベルでも踏んだ)。
 * SVG の属性でも CSS 変数は効くので、状態のトークンをそのまま渡す。
 */
function colorOf(level: Level): string {
  if (level === "strong") return "var(--ok)";
  if (level === "fading") return "var(--warn)";
  return "var(--bad)";
}

/** 記憶レベルの見出し。表示言語に追従させるため翻訳キーを返す。 */
function labelKeyOf(level: Level): string {
  if (level === "strong") return "curve.strong";
  if (level === "fading") return "curve.fading";
  return "curve.weak";
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
  const t = useT();
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
      const endMs = next ? new Date(next.reviewed_at).getTime() : startMs + horizonDays * 86400_000;
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
        {t("curve.empty")}
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
          {/* **文字は線の色で塗らない。** 線として読ませるために選んだ色を
              11px の文字に使うと、琥珀色で 2.09:1 まで落ちる(実測)。
              色は丸が持ち、意味は文字が持つ — 色が読めなくても伝わる。 */}
          <span className="font-medium text-foreground">{t(labelKeyOf(level))}</span>
          {nowPoint && (
            <span className="text-muted-foreground">
              · {t("curve.nowPct", { pct: nowPoint.retention })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Legend color="var(--ok)" label="80%+" />
          <Legend color="var(--warn)" label="50-80%" />
          <Legend color="var(--bad)" label="<50%" />
        </div>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,0.28)" />
            <XAxis
              dataKey="t"
              type="number"
              // 目盛りはデータ由来の端数(47d)ではなく**丸い値**にする。
              // 端数がそのまま軸に出ていると、目盛りではなく不具合に見える。
              domain={[0, (max: number) => Math.ceil(max / 10) * 10]}
              tickFormatter={(v) => t("curve.days", { n: String(Math.round(v)) })}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(v) => `${v}%`}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <Tooltip
              formatter={(v: number) => [`${v}%`, t("curve.retention")]}
              labelFormatter={(l) => t("curve.days", { n: Math.round(Number(l)) })}
              contentStyle={{
                // 白決め打ちだと暗いテーマで白い箱が浮く。
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <ReferenceLine y={80} stroke="var(--ok)" strokeDasharray="2 4" />
            <ReferenceLine y={50} stroke="var(--warn)" strokeDasharray="2 4" />
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
                    stroke="var(--muted-foreground)"
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
                  value: t("curve.youAreHere"),
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

/**
 * 記憶率は**整数**に丸める。
 *
 * 小数第一位まで出していたので、同じ画面で `72%`(バッジ)と `74.8%`
 * (この図)が並び、表記が揃っていなかった。そもそも記憶率は推定値で、
 * 0.1% の差に意味は無い — 小数を出すのは**偽りの精度**(独立監査)。
 */
function round(n: number): number {
  return Math.round(n);
}
