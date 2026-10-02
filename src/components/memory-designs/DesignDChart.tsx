import { useT } from "@/lib/i18n";
import { MEMORY_LEVELS } from "@/lib/memory";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useMemdT } from "./copy";
import { lastForecast, seriesAt, type SeriesPoint } from "./model";
import { useDateOf } from "./hooks";

/**
 * 段の境目（`lib/memory.ts` の `memoryLevel` と同じ区切り）。帯の下端と上端。
 * 段の区切りを写すのはここだけ — 変えた時は `memoryLevel` に合わせる。
 */
const BANDS: Array<{ level: number; lo: number; hi: number }> = [
  { level: 0, lo: 0, hi: 30 },
  { level: 1, lo: 30, hi: 50 },
  { level: 2, lo: 50, hi: 70 },
  { level: 3, lo: 70, hi: 85 },
  { level: 4, lo: 85, hi: 95 },
  { level: 5, lo: 95, hi: 100 },
];

type ViewBox = { x?: number; y?: number; width?: number; height?: number };

/** 線や帯の上に乗る字。**地の色で縁取り**して、線が通っても字面が残るようにする。 */
function OutlinedText({
  x,
  y,
  children,
  anchor = "start",
  weight = 400,
  size = 11,
  fill = "var(--muted-foreground)",
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  size?: number;
  fill?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      stroke="var(--card)"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {children}
    </text>
  );
}

export function DesignDChart({ series, nowMs }: { series: SeriesPoint[]; nowMs: number }) {
  const t = useMemdT();
  const tApp = useT();
  const dateOf = useDateOf(nowMs);
  const rows = series.map((p) => ({
    d: p.day_offset,
    past: p.day_offset <= 0 ? p.avg_retention : null,
    future: p.day_offset >= 0 ? p.avg_retention : null,
  }));
  const values = series.flatMap((p) => (p.avg_retention == null ? [] : [p.avg_retention]));
  // 縦軸は**データのある所へ寄せる**。下端は段の境目に合わせる（帯が途中で切れない）。
  const low = Math.min(...values, 100);
  const yMin = [70, 50, 30, 0].find((b) => b <= low - 3) ?? 0;
  const bands = BANDS.filter((b) => b.hi > yMin);
  const lo = Math.min(0, ...series.map((p) => p.day_offset));
  const hi = Math.max(0, ...series.map((p) => p.day_offset));
  const today = seriesAt(series, 0);
  const end = lastForecast(series);

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 22, right: 22, bottom: 0, left: -14 }}>
          {/* 段の帯。**色は薄く**（主役は線）、名前は帯の左上に小さく。 */}
          {bands.map((b) => {
            const lv = MEMORY_LEVELS[b.level];
            return (
              <ReferenceArea
                key={b.level}
                y1={Math.max(b.lo, yMin)}
                y2={b.hi}
                x1={lo}
                x2={hi}
                fill={`var(--mem-${b.level})`}
                fillOpacity={0.12}
                stroke="none"
                ifOverflow="hidden"
                label={(props: { viewBox?: ViewBox }) => {
                  const v = props.viewBox ?? {};
                  // 帯が字より低い時は名前を出さない（はみ出して隣の帯に重なる）。
                  if ((v.height ?? 0) < 13) return <g />;
                  return (
                    <OutlinedText x={(v.x ?? 0) + 4} y={(v.y ?? 0) + 11} size={10}>
                      {tApp(lv.labelKey)}
                    </OutlinedText>
                  );
                }}
              />
            );
          })}
          {/* これから側の地。**予測**と書く — 記録と同じ顔をさせない。 */}
          <ReferenceArea
            x1={0}
            x2={hi}
            y1={yMin}
            y2={100}
            fill="var(--foreground)"
            fillOpacity={0.05}
            stroke="none"
            label={(props: { viewBox?: ViewBox }) => {
              const v = props.viewBox ?? {};
              return (
                <OutlinedText
                  x={(v.x ?? 0) + (v.width ?? 0) / 2}
                  y={(v.y ?? 0) - 8}
                  anchor="middle"
                  weight={600}
                >
                  {`${t("dForecast")} →`}
                </OutlinedText>
              );
            }}
          />
          <XAxis
            type="number"
            dataKey="d"
            domain={[lo, hi]}
            ticks={[lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i)}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v: number) => (v === 0 ? t("today") : dateOf(v))}
            stroke="var(--muted-foreground)"
            fontSize={11}
          />
          <YAxis
            domain={[yMin, 100]}
            ticks={[yMin, ...BANDS.map((b) => b.hi).filter((v) => v > yMin)]}
            interval={0}
            tickFormatter={(v: number) => `${v}%`}
            tickLine={false}
            axisLine={false}
            stroke="var(--muted-foreground)"
            fontSize={10}
            allowDataOverflow
          />
          {/* 点は整数の % なので、縦軸を寄せると折れ線が**階段**に見える（試した絵で確認）。
              なめらかにつなぐ — `basis` は両端の点を必ず通るので、今日の点は線の上に乗る。 */}
          <Line
            dataKey="future"
            type="basis"
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            dataKey="past"
            type="basis"
            stroke="var(--primary)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          {end && (
            <ReferenceDot
              x={end.day}
              y={end.value}
              r={4}
              fill="var(--card)"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              label={(props: { viewBox?: ViewBox }) => {
                const v = props.viewBox ?? {};
                return (
                  <OutlinedText
                    x={(v.x ?? 0) + (v.width ?? 0) / 2}
                    y={(v.y ?? 0) + 22}
                    anchor="end"
                    weight={700}
                    size={12}
                    fill="var(--foreground)"
                  >
                    {`${end.value}%`}
                  </OutlinedText>
                );
              }}
            />
          )}
          {today != null && (
            <ReferenceDot
              x={0}
              y={today}
              r={6}
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth={3}
              label={(props: { viewBox?: ViewBox }) => {
                const v = props.viewBox ?? {};
                return (
                  <OutlinedText
                    x={(v.x ?? 0) + (v.width ?? 0) / 2}
                    y={(v.y ?? 0) - 6}
                    anchor="middle"
                    weight={700}
                    size={12}
                    fill="var(--foreground)"
                  >
                    {`${t("today")} ${today}%`}
                  </OutlinedText>
                );
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
