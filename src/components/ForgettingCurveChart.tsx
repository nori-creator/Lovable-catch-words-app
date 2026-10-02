import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Customized,
  ReferenceDot,
} from "recharts";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import {
  buildMemoryCurve,
  curveValueAt,
  curveValueAtExact,
  groupReviews,
  type CurveEvent,
  type CurvePoint,
  type CurveTick,
  type MemoryCurve,
} from "@/lib/memory-curve";
import { stabilityOf } from "@/lib/srs";
import {
  CurveScrubber,
  ScaleProbe,
  type ChartGeo,
  type ScrubLayerProps,
} from "@/components/CurveScrubber";
import {
  axisTicks,
  bandAreas,
  ChartLegend,
  chartYMin,
  levelBands,
  useBandLabel,
} from "@/components/memory-chart-parts";

import { memoryCurveFrom, type HistoryPoint } from "@/lib/memory-curve-from";
export { memoryCurveFrom, type HistoryPoint };

const DAY = 86_400_000;

/**
 * 1語の忘却曲線。（オーナー指摘 2026-09-22「記憶のグラフが見づらい」）
 *
 *  ・**今日**に大きな点と「今日 N%」。
 *  ・線の色は**縦軸の値で塗り分ける**（高い所は「はっきり」の色、低い所は
 *    忘れかけの色）。段の境目は一覧・バッジと同じ。
 *  ・これまでは**実線**、復習しなかった場合の予測だけ**点線**。補助線の
 *    点線（50% / 85% / 今日の縦線 / 格子）はやめた — 点線が何本もあると、
 *    どれが予測なのか読めない。格子は薄い実線の横線だけ。
 *  ・下の日付は**今日・復習した日・復習どき**だけ。
 *  ・グラフの下で、**いつ復習すればいいか**を言葉で言う。もう来ていれば
 *    その場で復習へ進める。
 */
export function MemoryCurveChart({
  curve,
  nowMs,
  stickerId,
  onReview,
}: {
  curve: MemoryCurve;
  nowMs: number;
  /** 渡すと「いま復習する」から、この語だけの復習へ進める。 */
  stickerId?: string;
  onReview?: () => void;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());
  /**
   * **復習で100%へ戻る所は線を切る**（オーナー指示 2026-09-27「記憶の
   * グラフをより細かく」）。線は値で塗り分けているので、縦に戻る所が
   * 赤→黄→緑の縞になり、曲線そのものより目立っていた。戻る所は細い
   * 灰色の縦線で別に描く（`jumps`）。
   */
  const { drawn: pastDrawn, jumps } = useMemo(() => splitJumps(curve.past), [curve.past]);
  // 線・点の色は主色1つ（2026-10-02「2つのグラフのデザインと機能を統一して」）。
  // 記憶の段は線の色ではなく、地の帯で読む（`memory-chart-parts.tsx`）。
  const color = () => "var(--primary)";
  // 縦軸の下端は**覚えた後の値**で決める。撮っただけの区間（0%）まで入れると、肝心の
  // 曲線が上の3割に詰まって読めない。0% からの立ち上がりは下端から伸びる線で見える。
  const yMin = chartYMin([...curve.past, ...curve.future].map((p) => p.r).filter((r) => r > 0));
  const bands = levelBands(yMin);
  const bandLabel = useBandLabel();
  const dateOf = (d: number) =>
    new Date(nowMs + d * DAY).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
  const [lo, hi] = curve.domain;
  const due = curve.bestDay <= 0;
  const bestIn = Math.max(1, Math.round(curve.bestDay));
  /**
   * **指で辿っている所**（今日からの日数）。null なら辿っていない。
   * （オーナー指示 2026-09-23「過去のグラフの時の記憶の状態が何 % だったか
   *  辿れるようにして…縦軸と横軸が点線で表示されるようにして」）
   */
  /**
   * 辿っているか（今日の札を隠すためだけ）。**辿った位置そのものは state に
   * 置かない** — 置くと指が動くたびにグラフ全体を描き直し、1コマに収まらず
   * 「かくかく」になっていた（オーナー報告 2026-09-27）。位置は
   * `CurveScrubber` が自分の中で持ち、点と線だけを動かす。
   */
  const [scrubbing, setScrubbing] = useState(false);
  const geo = useRef<ChartGeo | null>(null);
  const whenLabel = (d: number) => {
    const n = Math.round(Math.abs(d));
    if (n === 0) return t("rv.today");
    return d < 0 ? t("curve.daysAgo", { n }) : t("curve.daysLater", { n });
  };
  const drop = curve.nextDrop;

  return (
    <div>
      {/* 縦軸が何の % かを言う。写真の右上・一覧の % と**同じ数**
          （いま思い出せる確率。`memory.ts` の `memoryOf`）。 */}
      <p className="mb-1 text-caption text-muted-foreground">{t("curve.axisNote")}</p>
      <ChartLegend reviews={curve.reviews.length > 0} />

      <div
        className="relative h-52 w-full"
        role="img"
        aria-label={t("curve.aria", { pct: curve.todayR, n: curve.reviews.length })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 22, right: 14, bottom: 0, left: -18 }}>
            {/* 段の帯。線より先に描く（下に敷く）。全体のグラフと同じ部品。 */}
            {bandAreas(bands, [lo, hi], bandLabel)}
            <XAxis
              type="number"
              dataKey="d"
              domain={[lo, hi]}
              ticks={curve.ticks.map((tk) => tk.d)}
              interval={0}
              height={36}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={(props: { x: number; y: number; payload: { value: number } }) => (
                <CurveTickLabel
                  {...props}
                  tick={curve.ticks.find((tk) => tk.d === props.payload.value)}
                  anchor={
                    props.payload.value - lo < (hi - lo) * 0.08
                      ? "start"
                      : hi - props.payload.value < (hi - lo) * 0.08
                        ? "end"
                        : "middle"
                  }
                  label={(tk) => (tk.kind === "today" ? t("rv.today") : dateOf(tk.d))}
                  sub={(tk) => (tk.kind === "best" ? t("curve.bestTick") : null)}
                />
              )}
            />
            {/* 目盛りは段の境目（全体のグラフと同じ）。 */}
            <YAxis
              domain={[yMin, 100]}
              ticks={axisTicks(yMin)}
              interval={0}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
              stroke="var(--muted-foreground)"
              fontSize={10}
              allowDataOverflow
            />
            <Line
              data={curve.future}
              dataKey="r"
              type="linear"
              stroke="var(--primary)"
              strokeWidth={2.5}
              strokeDasharray="6 5"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            />
            {jumps.map((j) => (
              <ReferenceLine
                key={`jump-${j.d}`}
                segment={[
                  // 撮っただけ（0%）からの立ち上がりは、縦軸の下端から引く（軸の外へ出さない）。
                  { x: j.d, y: Math.max(j.from, yMin) },
                  { x: j.d, y: 100 },
                ]}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.5}
                strokeWidth={1.5}
                ifOverflow="visible"
              />
            ))}
            <Line
              data={pastDrawn}
              dataKey="r"
              type="linear"
              stroke="var(--primary)"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
            {groupReviews(curve.reviews).map((g) => (
              <ReferenceDot
                key={`rv-${g.d}`}
                x={g.d}
                y={100}
                r={4}
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth={2}
                label={
                  g.n > 1
                    ? {
                        value: `×${g.n}`,
                        position: "top",
                        fill: "var(--foreground)",
                        fontSize: 11,
                        fontWeight: 700,
                      }
                    : undefined
                }
              />
            ))}
            {!due && curve.bestDay <= hi && (
              <ReferenceDot
                x={curve.bestDay}
                y={futureValueAt(curve, curve.bestDay)}
                r={5.5}
                fill={color()}
                stroke="var(--card)"
                strokeWidth={2.5}
              />
            )}
            <ReferenceDot
              x={0}
              y={curve.todayR}
              r={7}
              fill={color()}
              stroke="var(--card)"
              strokeWidth={3}
              label={
                // 辿っている間は、辿った所の札だけを出す（札が2つ重なると読めない）。
                !scrubbing
                  ? {
                      value: t("curve.todayPct", { pct: curve.todayR }),
                      position: "top",
                      fill: "var(--foreground)",
                      fontSize: 12,
                      fontWeight: 700,
                    }
                  : undefined
              }
            />
            <Customized
              component={(props: ScrubLayerProps) => <ScaleProbe {...props} into={geo} />}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <CurveScrubber
          geo={geo}
          domain={curve.domain}
          valueAt={(d) => curveValueAtExact(curve, d)}
          color={color}
          whenLabel={whenLabel}
          onActive={setScrubbing}
        />
      </div>

      <div
        className={`mt-2 rounded-2xl p-3 ${due ? "mem-lv-1 mem-chip" : "bg-secondary/60"}`}
        role="status"
      >
        <p className="text-body font-semibold text-foreground">
          {due
            ? t("curve.reviewNow")
            : t("curve.reviewOn", { date: dateOf(curve.bestDay), n: bestIn })}
        </p>
        {/* **次に段が変わる日を1つ**（オーナー指示 2026-09-23「忘れる予測は
            何日後に状態が変わるのか具体的に日付を1つ書いて」）。 */}
        {drop && (
          <p className="mt-0.5 text-footnote font-medium text-foreground">
            {calendarDaysUntil(nowMs, drop.d) === 0
              ? t("curve.nextDropToday", { level: t(`memory.level${drop.level}`) })
              : t("curve.nextDrop", {
                  date: dateOf(drop.d),
                  n: calendarDaysUntil(nowMs, drop.d),
                  level: t(`memory.level${drop.level}`),
                })}
          </p>
        )}
        <p className="mt-0.5 text-footnote text-muted-foreground">
          {due ? t("curve.reviewNowHint") : t("curve.reviewOnHint")}
        </p>
        {due && stickerId && (
          <Link
            to="/review"
            search={{ sticker: stickerId }}
            onClick={onReview}
            className="lift mt-2 inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2 text-body font-semibold text-primary-foreground"
          >
            {t("curve.reviewNowCta")}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * 復習で上へ戻る所（同じ日に値が上がる2点）で線を切る。
 * `drawn` は切れ目に `null` を挟んだ点、`jumps` は戻る所の日と戻る前の値。
 */
export function splitJumps(points: readonly CurvePoint[]): {
  drawn: Array<{ d: number; r: number | null }>;
  jumps: Array<{ d: number; from: number }>;
} {
  const drawn: Array<{ d: number; r: number | null }> = [];
  const jumps: Array<{ d: number; from: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && prev.d === p.d && p.r > prev.r) {
      jumps.push({ d: p.d, from: prev.r });
      drawn.push({ d: p.d, r: null });
    }
    drawn.push(p);
  }
  return { drawn, jumps };
}

/**
 * 今日から何日目の暦の日か（0 = 今日のうち）。「0.4日後」を「1日後」と
 * 言わないため — 日付と日数が食い違う（9/23 なのに 1日後）。
 */
export function calendarDaysUntil(nowMs: number, d: number): number {
  const a = new Date(nowMs);
  const b = new Date(nowMs + d * DAY);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / DAY);
}

/** 予測線の上の、ある日の値（点を線の上にぴったり置くため）。 */
function futureValueAt(curve: MemoryCurve, d: number): number {
  const f = curve.future;
  for (let i = 1; i < f.length; i++) {
    if (f[i].d >= d) {
      const a = f[i - 1];
      const b = f[i];
      const k = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
      return Math.round(a.r + (b.r - a.r) * k);
    }
  }
  return f[f.length - 1]?.r ?? 0;
}

/** 目盛りの字。復習どきだけ2行目に「復習どき」を添える。 */
function CurveTickLabel({
  x,
  y,
  tick,
  anchor,
  label,
  sub,
}: {
  x: number;
  y: number;
  tick?: CurveTick;
  anchor: "start" | "middle" | "end";
  label: (tk: CurveTick) => string;
  sub: (tk: CurveTick) => string | null;
}) {
  if (!tick) return <g />;
  const strong = tick.kind !== "review";
  const s = sub(tick);
  return (
    <g transform={`translate(${x},${y + 4})`}>
      <text
        textAnchor={anchor}
        dy="0.8em"
        fontSize={11}
        fontWeight={strong ? 700 : 500}
        fill={strong ? "var(--foreground)" : "var(--muted-foreground)"}
      >
        {label(tick)}
      </text>
      {s && (
        <text textAnchor={anchor} dy="2.1em" fontSize={11} fontWeight={600} fill="var(--ok-ink)">
          {s}
        </text>
      )}
    </g>
  );
}

/**
 * 図鑑の詳細に置く版。履歴の行をそのまま受ける。
 */
export function ForgettingCurveChart({
  history,
  currentEase,
  currentIntervalDays,
  lastReviewedAt,
  takenAt,
  stickerId,
}: {
  history: HistoryPoint[];
  currentEase?: number;
  currentIntervalDays?: number;
  lastReviewedAt?: string | null;
  takenAt?: string | null;
  stickerId?: string;
}) {
  const t = useT();
  const nowMs = useMemo(() => Date.now(), []);
  const curve = useMemo(
    () =>
      memoryCurveFrom(
        { history, takenAt, lastReviewedAt, currentEase, currentIntervalDays },
        nowMs,
      ),
    [history, takenAt, lastReviewedAt, currentEase, currentIntervalDays, nowMs],
  );
  if (!curve) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-footnote text-muted-foreground">
        {t("curve.empty")}
      </div>
    );
  }
  return <MemoryCurveChart curve={curve} nowMs={nowMs} stickerId={stickerId} />;
}
