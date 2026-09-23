import { useId, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import {
  buildMemoryCurve,
  gradientStops,
  groupReviews,
  levelOfR,
  type CurveEvent,
  type CurveTick,
  type MemoryCurve,
} from "@/lib/memory-curve";
import { stabilityOf } from "@/lib/srs";

export type HistoryPoint = {
  reviewed_at: string;
  score: number;
  interval_days_after: number;
  ease_after: number;
};

const DAY = 86_400_000;
/** まだ一度も復習していない語の ease（SM-2 の初期値）。 */
const FIRST_EASE = 2.5;

/**
 * 履歴の行から曲線を作る。**復習の画面と図鑑の詳細で同じ関数を使う** —
 * 以前は2か所に別々の計算があり、安定度の式まで違っていた。
 *
 * 線の始まりは**撮った日**（復習には数えない）。履歴が無い古い語で、
 * 最後に復習した時刻だけ分かるものは、それを1回の復習として置く。
 */
export function memoryCurveFrom(
  input: {
    history: HistoryPoint[];
    takenAt?: string | null;
    lastReviewedAt?: string | null;
    currentEase?: number;
    currentIntervalDays?: number;
    /** 安定度が分かっていればそれを使う（一覧の値と揃える）。 */
    stabilityDays?: number;
  },
  nowMs: number,
): MemoryCurve | null {
  const events: CurveEvent[] = input.history.map((h) => ({
    t: new Date(h.reviewed_at).getTime(),
    stability: stabilityOf(h.interval_days_after, h.ease_after),
  }));
  const ease = input.currentEase ?? FIRST_EASE;
  if (events.length === 0 && input.lastReviewedAt) {
    events.push({
      t: new Date(input.lastReviewedAt).getTime(),
      stability: input.stabilityDays || stabilityOf(input.currentIntervalDays ?? 0, ease),
    });
  }
  const encounter = input.takenAt
    ? {
        t: new Date(input.takenAt).getTime(),
        // 撮っただけで一度も復習していない間の安定度。復習前の間隔は 0。
        stability:
          events.length === 0 && input.stabilityDays
            ? input.stabilityDays
            : stabilityOf(0, FIRST_EASE),
      }
    : null;
  return buildMemoryCurve(events, nowMs, { encounter });
}

/**
 * 1語の忘却曲線。（オーナー指摘 2026-09-22「記憶のグラフが見づらい」）
 *
 *  ・**今日**に大きな点と「今日 N%」。
 *  ・線の色は**縦軸の値で塗り分ける**（高い所は長期記憶の色、低い所は
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
  const uid = useId().replace(/:/g, "");
  const past = levelGradient(
    `mc-past-${uid}`,
    curve.past.map((p) => p.r),
  );
  const future = levelGradient(
    `mc-future-${uid}`,
    curve.future.map((p) => p.r),
  );
  const color = (r: number) => `var(--mem-${levelOfR(r)})`;
  const dateOf = (d: number) =>
    new Date(nowMs + d * DAY).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
  const [lo, hi] = curve.domain;
  const due = curve.bestDay <= 0;
  const bestIn = Math.max(1, Math.round(curve.bestDay));

  return (
    <div>
      {/* 縦軸が何の % かを言う。上の段の % は「記憶の強さ」（長くもつかも
          含めた値）で、ここは「いま思い出せる見込み」— 同じ画面に2つの %
          が並ぶので、黙っていると食い違って見える。 */}
      <p className="mb-1 text-caption text-muted-foreground">{t("curve.axisNote")}</p>
      <div
        className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground"
        aria-hidden
      >
        <span className="inline-flex items-center gap-1">
          <svg width="18" height="6">
            <line x1="1" y1="3" x2="17" y2="3" stroke="var(--mem-4)" strokeWidth="2.5" />
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
              stroke="var(--mem-2)"
              strokeWidth="2.5"
              strokeDasharray="4 3"
            />
          </svg>
          {t("curve.legendFuture")}
        </span>
        {curve.reviews.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <svg width="10" height="10">
              <circle
                cx="5"
                cy="5"
                r="3.5"
                fill="var(--card)"
                stroke="var(--mem-5)"
                strokeWidth="2"
              />
            </svg>
            {t("curve.legendReview")}
          </span>
        )}
      </div>

      <div
        className="h-52 w-full"
        role="img"
        aria-label={t("curve.aria", { pct: curve.todayR, n: curve.reviews.length })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 22, right: 14, bottom: 0, left: -18 }}>
            <defs>
              {past.def}
              {future.def}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
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
              data={curve.future}
              dataKey="r"
              type="linear"
              stroke={future.stroke}
              strokeWidth={2.5}
              strokeDasharray="6 5"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              data={curve.past}
              dataKey="r"
              type="linear"
              stroke={past.stroke}
              strokeWidth={3}
              strokeLinejoin="round"
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
                stroke="var(--mem-5)"
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
                fill={color(futureValueAt(curve, curve.bestDay))}
                stroke="var(--card)"
                strokeWidth={2.5}
              />
            )}
            <ReferenceDot
              x={0}
              y={curve.todayR}
              r={7}
              fill={color(curve.todayR)}
              stroke="var(--card)"
              strokeWidth={3}
              label={{
                value: t("curve.todayPct", { pct: curve.todayR }),
                position: "top",
                fill: "var(--foreground)",
                fontSize: 12,
                fontWeight: 700,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
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
 * 線を縦軸の値で塗り分けるための `<linearGradient>` と、線に渡す `stroke`。
 * 全部同じ値の線は単色（`gradientStops` の注記）。
 *
 * 止まりの色は **`style` で渡す**。`stop-color="var(--…)"` のような属性に
 * 書いた CSS 変数は、ブラウザによっては解決されない。
 */
export function levelGradient(id: string, values: number[]): { def: ReactNode; stroke: string } {
  const stops = gradientStops(values);
  if (!stops) {
    return { def: null, stroke: `var(--mem-${levelOfR(values[0] ?? 100)})` };
  }
  return {
    def: (
      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
        {stops.map((s, i) => (
          <stop key={i} offset={s.offset} style={{ stopColor: `var(--mem-${s.level})` }} />
        ))}
      </linearGradient>
    ),
    stroke: `url(#${id})`,
  };
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
