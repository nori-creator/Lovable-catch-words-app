import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
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
  curveValueAtExact,
  gradientStops,
  groupReviews,
  levelOfR,
  type CurveEvent,
  type CurvePoint,
  type CurveTick,
  type MemoryCurve,
} from "@/lib/memory-curve";
import { stabilityOf } from "@/lib/srs";

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
  const uid = useId().replace(/:/g, "");
  const past = levelGradient(
    `mc-past-${uid}`,
    curve.past.map((p) => p.r),
  );
  const future = levelGradient(
    `mc-future-${uid}`,
    curve.future.map((p) => p.r),
  );
  const pastFill = levelFill(`mc-fill-${uid}`);
  /**
   * **復習で100%へ戻る所は線を切る**（オーナー指示 2026-09-27「記憶の
   * グラフをより細かく」）。線は値で塗り分けているので、縦に戻る所が
   * 赤→黄→緑の縞になり、曲線そのものより目立っていた。戻る所は細い
   * 灰色の縦線で別に描く（`jumps`）。
   */
  const { drawn: pastDrawn, jumps } = useMemo(() => splitJumps(curve.past), [curve.past]);
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
        className="relative h-52 w-full"
        role="img"
        aria-label={t("curve.aria", { pct: curve.todayR, n: curve.reviews.length })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 22, right: 14, bottom: 0, left: -18 }}>
            <defs>
              {past.def}
              {future.def}
              {pastFill.def}
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
            {/* 線の下をごく薄く塗る（段の色）。どの段にどれだけ居たかが面で分かる。 */}
            <Area
              data={pastDrawn}
              dataKey="r"
              type="linear"
              stroke="none"
              fill={pastFill.fill}
              baseValue={0}
              connectNulls={false}
              isAnimationActive={false}
            />
            {jumps.map((j) => (
              <ReferenceLine
                key={`jump-${j.d}`}
                segment={[
                  { x: j.d, y: j.from },
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
              stroke={past.stroke}
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

type AxisScale = { scale: ((v: number) => number) & { invert?: (px: number) => number } };
type ScrubLayerProps = {
  xAxisMap?: Record<string, AxisScale>;
  yAxisMap?: Record<string, AxisScale>;
  offset?: { left: number; top: number; width: number; height: number };
};

type ChartGeo = {
  x: (d: number) => number;
  y: (r: number) => number;
  invertX: (px: number) => number;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * グラフの縮尺を**読むだけ**の部品。何も描かない。
 * Recharts が描くたびに、日数→横の位置、% →縦の位置の換算を `into` に置く。
 */
function ScaleProbe({
  xAxisMap,
  yAxisMap,
  offset,
  into,
}: ScrubLayerProps & { into: { current: ChartGeo | null } }) {
  const xa = xAxisMap ? Object.values(xAxisMap)[0] : undefined;
  const ya = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  if (xa?.scale.invert && ya && offset) {
    const invert = xa.scale.invert;
    into.current = {
      x: (d) => xa.scale(d),
      y: (r) => ya.scale(r),
      invertX: (px) => invert(px),
      left: offset.left,
      top: offset.top,
      width: offset.width,
      height: offset.height,
    };
  }
  return null;
}

/** 指に付いてくる速さ（秒）。小さいほどぴったり。 */
const DRAG_TAU = 0.035;
/** 押した所へ**滑って行く**速さ（秒）。押した瞬間に飛ばない。 */
const GLIDE_TAU = 0.11;
/** 点の高さが線に追いつく速さ（秒）。 */
const Y_TAU = 0.05;

/**
 * **指で辿る層**（オーナー指示 2026-09-23、2026-09-27 に作り直し）。
 *
 * > 「タップするとかくかく → なめらかに。グラフ上の点を持つと滑らかに
 * >  過去の状態を辿れるように」
 *
 * 前の版の「かくかく」の原因は3つあった:
 *  1. 指が動くたびに**グラフ全体を React で描き直していた**（1コマに収まらない）
 *  2. 点の高さを**1% に丸めた値**で置いていた（縦が階段状に跳ねる）
 *  3. 押した瞬間に点が**その場へ飛んでいた**
 *
 * いまは:
 *  1. 点・点線・札だけを**毎コマ直接**動かす（React の描き直しは始めと終わりの2回）
 *  2. 高さは丸めない値（`curveValueAtExact`）。札の数字だけ丸める
 *  3. 押した所へ**滑って行き**、押したまま動かすと指にぴったり付いてくる
 *     （指数的に近づける — 動きを減らす設定では即座に）
 *
 * 離しても点はそこに残る（読んでいる途中で消えない）。
 */
function CurveScrubber({
  geo,
  domain,
  valueAt,
  color,
  whenLabel,
  onActive,
}: {
  geo: { current: ChartGeo | null };
  domain: [number, number];
  valueAt: (d: number) => number;
  color: (r: number) => string;
  whenLabel: (d: number) => string;
  onActive: (on: boolean) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const hLine = useRef<SVGLineElement>(null);
  const vLine = useRef<SVGLineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const rTag = useRef<SVGGElement>(null);
  const dTag = useRef<SVGGElement>(null);
  const s = useRef({
    target: null as number | null,
    cur: null as number | null,
    /** 描いている点の高さ（px）。復習で 100% に戻る所も一瞬で飛ばさない。 */
    y: null as number | null,
    dragging: false,
    tau: GLIDE_TAU,
    raf: 0,
    last: 0,
  });
  // 最新の関数を毎回読む（描き直しで作り直される）。
  const fns = useRef({ valueAt, color, whenLabel, domain });
  fns.current = { valueAt, color, whenLabel, domain };

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);

  const setTag = (g: SVGGElement | null, x: number, y: number, text: string, below: boolean) => {
    if (!g) return;
    const w = Math.max(28, text.length * 7 + 12);
    const h = 18;
    const left = below ? x - w / 2 : x - w - 2;
    const top = below ? y + 2 : y - h / 2;
    const rect = g.firstElementChild as SVGRectElement | null;
    const label = g.lastElementChild as SVGTextElement | null;
    rect?.setAttribute("x", String(left));
    rect?.setAttribute("y", String(top));
    rect?.setAttribute("width", String(w));
    if (label) {
      label.setAttribute("x", String(left + w / 2));
      label.setAttribute("y", String(top + h / 2));
      label.textContent = text;
    }
  };

  /** 描く。高さが落ち着いたかを返す。 */
  const draw = (d: number, alpha: number): boolean => {
    const g = geo.current;
    if (!g) return true;
    const r = fns.current.valueAt(d);
    const x = g.x(d);
    const yTarget = g.y(r);
    const st = s.current;
    // 横は指に付く。縦は**線の上を追いかける** — 復習した日を跨ぐと線は
    // 縦に 100% まで戻るので、そのまま置くと点が1コマで飛ぶ。
    st.y = st.y == null ? yTarget : st.y + (yTarget - st.y) * alpha;
    if (Math.abs(yTarget - st.y) < 0.3) st.y = yTarget;
    const y = st.y;
    const bottom = g.top + g.height;
    hLine.current?.setAttribute("x1", String(g.left));
    hLine.current?.setAttribute("x2", String(g.left + g.width));
    hLine.current?.setAttribute("y1", String(y));
    hLine.current?.setAttribute("y2", String(y));
    vLine.current?.setAttribute("x1", String(x));
    vLine.current?.setAttribute("x2", String(x));
    vLine.current?.setAttribute("y1", String(g.top));
    vLine.current?.setAttribute("y2", String(bottom));
    if (dot.current) {
      dot.current.setAttribute("cx", String(x));
      dot.current.setAttribute("cy", String(y));
      dot.current.style.fill = fns.current.color(Math.round(r));
    }
    setTag(rTag.current, g.left, y, `${Math.round(r)}%`, false);
    setTag(dTag.current, x, bottom, fns.current.whenLabel(d), true);
    return y === yTarget;
  };

  const tick = (now: number) => {
    const st = s.current;
    if (st.target == null) return;
    const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 1 / 60;
    st.last = now;
    const reduce = document.documentElement.dataset.motion === "reduce";
    if (st.cur == null || reduce) st.cur = st.target;
    else st.cur += (st.target - st.cur) * (1 - Math.exp(-dt / st.tau));
    const span = fns.current.domain[1] - fns.current.domain[0];
    const xSettled = Math.abs(st.target - st.cur) < span * 0.0005;
    if (xSettled) st.cur = st.target;
    const ySettled = draw(st.cur, reduce ? 1 : 1 - Math.exp(-dt / Y_TAU));
    const settled = xSettled && ySettled;
    if (settled && !st.dragging) {
      st.raf = 0;
      st.last = 0;
      return;
    }
    st.raf = requestAnimationFrame(tick);
  };

  const toD = (clientX: number) => {
    const g = geo.current;
    const el = svg.current;
    if (!g || !el) return null;
    const box = el.getBoundingClientRect();
    const px = Math.min(g.left + g.width, Math.max(g.left, clientX - box.left));
    const [lo, hi] = fns.current.domain;
    return Math.min(hi, Math.max(lo, g.invertX(px)));
  };

  const aim = (clientX: number, tau: number) => {
    const d = toD(clientX);
    if (d == null) return;
    const st = s.current;
    // 初めて触ったときは**今日の点から**滑り出す（どこから来たか分かる）。
    if (st.cur == null) st.cur = 0;
    st.target = d;
    st.tau = tau;
    if (!st.raf) st.raf = requestAnimationFrame(tick);
  };

  const [shown, setShown] = useState(false);

  return (
    <svg ref={svg} className="memory-scrub absolute inset-0 h-full w-full" aria-hidden>
      <g pointerEvents="none" style={{ opacity: shown ? 1 : 0 }}>
        <line
          ref={hLine}
          stroke="var(--foreground)"
          strokeOpacity={0.55}
          strokeWidth={1.25}
          strokeDasharray="3 3"
        />
        <line
          ref={vLine}
          stroke="var(--foreground)"
          strokeOpacity={0.55}
          strokeWidth={1.25}
          strokeDasharray="3 3"
        />
        <circle ref={dot} r={7} stroke="var(--card)" strokeWidth={2.5} />
        <g ref={rTag}>
          <rect height={18} rx={9} fill="var(--foreground)" />
          <text
            dy="0.35em"
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill="var(--background)"
          />
        </g>
        <g ref={dTag}>
          <rect height={18} rx={9} fill="var(--foreground)" />
          <text
            dy="0.35em"
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill="var(--background)"
          />
        </g>
      </g>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="transparent"
        style={{ touchAction: "pan-y", cursor: "grab" }}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* 取れなくても、面の上なら動く */
          }
          s.current.dragging = true;
          if (!shown) {
            setShown(true);
            onActive(true);
          }
          aim(e.clientX, GLIDE_TAU);
        }}
        onPointerMove={(e) => {
          if (!s.current.dragging) return;
          // 押した直後の滑りが終わる前に指が動いたら、そこから指に付く。
          aim(e.clientX, DRAG_TAU);
        }}
        onPointerUp={() => {
          s.current.dragging = false;
        }}
        onPointerCancel={() => {
          s.current.dragging = false;
        }}
      />
    </svg>
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
 * 線の下の面の塗り。**主色を上ほど少し濃く、下へ向けて消す**。
 * 段の色で塗ると横縞になり、線より面のほうが目立った（試して撮った絵で確認）。
 */
export function levelFill(id: string): { def: ReactNode; fill: string } {
  return {
    def: (
      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: "var(--primary)", stopOpacity: 0.14 }} />
        <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
      </linearGradient>
    ),
    fill: `url(#${id})`,
  };
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
