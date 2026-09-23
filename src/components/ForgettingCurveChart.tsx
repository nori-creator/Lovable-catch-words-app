import { useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Customized,
  ReferenceDot,
} from "recharts";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import {
  buildMemoryCurve,
  curveValueAt,
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
  /**
   * **指で辿っている所**（今日からの日数）。null なら辿っていない。
   * （オーナー指示 2026-09-23「過去のグラフの時の記憶の状態が何 % だったか
   *  辿れるようにして…縦軸と横軸が点線で表示されるようにして」）
   */
  const [scrubD, setScrubD] = useState<number | null>(null);
  const scrubR = scrubD == null ? null : curveValueAt(curve, scrubD);
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
            {/* 25% と 75% の線も引く（オーナー指示 2026-09-23）。 */}
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
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
              label={
                // 辿っている間は、辿った所の札だけを出す（札が2つ重なると読めない）。
                scrubD == null
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
              component={(props: ScrubLayerProps) => (
                <ScrubLayer
                  {...props}
                  domain={curve.domain}
                  d={scrubD}
                  r={scrubR}
                  color={scrubR == null ? "" : color(scrubR)}
                  whenLabel={whenLabel}
                  onScrub={setScrubD}
                />
              )}
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

type AxisScale = { scale: ((v: number) => number) & { invert?: (px: number) => number } };
type ScrubLayerProps = {
  xAxisMap?: Record<string, AxisScale>;
  yAxisMap?: Record<string, AxisScale>;
  offset?: { left: number; top: number; width: number; height: number };
};

/**
 * 指で辿る層。グラフの描く面の上に透明な板を敷き、指の位置を日数に直す。
 * 辿った所に点を置き、**縦軸へ横の点線・横軸へ縦の点線**を引いて、
 * 軸の上に「N日前」「N%」の札を出す。
 */
function ScrubLayer({
  xAxisMap,
  yAxisMap,
  offset,
  domain,
  d,
  r,
  color,
  whenLabel,
  onScrub,
}: ScrubLayerProps & {
  domain: [number, number];
  d: number | null;
  r: number | null;
  color: string;
  whenLabel: (d: number) => string;
  onScrub: (d: number | null) => void;
}) {
  const xa = xAxisMap ? Object.values(xAxisMap)[0] : undefined;
  const ya = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  if (!xa || !ya || !offset) return null;
  const toD = (clientX: number, svg: SVGSVGElement | null) => {
    if (!svg || !xa.scale.invert) return null;
    const box = svg.getBoundingClientRect();
    const px = Math.min(offset.left + offset.width, Math.max(offset.left, clientX - box.left));
    const v = xa.scale.invert(px);
    return Math.min(domain[1], Math.max(domain[0], Math.round(v * 10) / 10));
  };
  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const next = toD(e.clientX, e.currentTarget.ownerSVGElement);
    if (next != null) onScrub(next);
  };
  const x = d == null ? 0 : xa.scale(d);
  const y = r == null ? 0 : ya.scale(r);
  const bottom = offset.top + offset.height;
  return (
    <g className="memory-scrub">
      {d != null && r != null && (
        <g pointerEvents="none">
          {/* **端から端まで**（オーナー指示 2026-09-23「点線は一番横まで、縦線を
              一番上まで」）。横は描く面の左端から右端、縦は上端から下端。 */}
          <line
            x1={offset.left}
            x2={offset.left + offset.width}
            y1={y}
            y2={y}
            stroke="var(--foreground)"
            strokeOpacity={0.55}
            strokeWidth={1.25}
            strokeDasharray="3 3"
          />
          <line
            x1={x}
            x2={x}
            y1={offset.top}
            y2={bottom}
            stroke="var(--foreground)"
            strokeOpacity={0.55}
            strokeWidth={1.25}
            strokeDasharray="3 3"
          />
          <circle cx={x} cy={y} r={6} fill={color} stroke="var(--card)" strokeWidth={2.5} />
          {/* 縦軸の上に %、横軸の上に「N日前」。 */}
          <ScrubTag x={offset.left} y={y} text={`${r}%`} anchor="end" />
          <ScrubTag x={x} y={bottom} text={whenLabel(d)} anchor="middle" below />
        </g>
      )}
      <rect
        x={offset.left}
        y={offset.top}
        width={offset.width}
        height={offset.height}
        fill="transparent"
        style={{ touchAction: "pan-y", cursor: "crosshair" }}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* 取れなくても、面の上なら動く */
          }
          move(e);
        }}
        onPointerMove={(e) => {
          // 押している間だけ辿る（マウスを乗せただけでは動かさない）。
          if (e.buttons === 0 && e.pointerType === "mouse") return;
          if (e.pointerType !== "mouse" && e.pressure === 0) return;
          move(e);
        }}
      />
    </g>
  );
}

/** 軸の上の小さな札（辿った所の値）。 */
function ScrubTag({
  x,
  y,
  text,
  anchor,
  below = false,
}: {
  x: number;
  y: number;
  text: string;
  anchor: "end" | "middle";
  below?: boolean;
}) {
  const w = Math.max(28, text.length * 7 + 12);
  const h = 18;
  const left = anchor === "end" ? x - w - 2 : x - w / 2;
  const top = below ? y + 2 : y - h / 2;
  return (
    <g>
      <rect x={left} y={top} width={w} height={h} rx={9} fill="var(--foreground)" />
      <text
        x={left + w / 2}
        y={top + h / 2}
        dy="0.35em"
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="var(--background)"
      >
        {text}
      </text>
    </g>
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
