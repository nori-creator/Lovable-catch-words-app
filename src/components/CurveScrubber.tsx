import { useEffect, useRef, useState } from "react";

/**
 * **グラフの点を指で辿る部品**（単語ごとの忘却曲線と、復習の上の「全体の記憶率」で共用）。
 *
 * もとは `ForgettingCurveChart.tsx` の中だけに在った。全体のグラフにも同じ「点を持って
 * 過去の状態を辿る」動きが欲しい（オーナー指示 2026-10-02「グラフの点はもっと動かせて、
 * グラフに沿って過去の状態をたどれる機能が消えてる」）ので、ここへ出した。
 * 使い方: グラフの中に `<Customized component={(p) => <ScaleProbe {...p} into={geo} />} />`
 * を置いて縮尺を読み、同じ箱（`relative`）の上に `<CurveScrubber geo={geo} … />` を重ねる。
 */

type AxisScale = { scale: ((v: number) => number) & { invert?: (px: number) => number } };
export type ScrubLayerProps = {
  xAxisMap?: Record<string, AxisScale>;
  yAxisMap?: Record<string, AxisScale>;
  offset?: { left: number; top: number; width: number; height: number };
};

export type ChartGeo = {
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
export function ScaleProbe({
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
export function CurveScrubber({
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

  /**
   * **横に辿り始めたら、画面の縦の巻き取りに指を渡さない**（オーナー報告「点を押したまま
   * 横に滑らせると引っかかる」）。面は `touch-action: pan-y`（縦には画面を巻ける）なので、
   * 横に辿る途中で指が少し縦にぶれると、ブラウザが巻き取りを始めて指の追跡を取り消していた
   * （pointercancel → 点が止まる）。指の最初の動きが横なら、その指の間は巻き取りを止める。
   * 縦に動き出した指はそのまま画面を巻く（グラフの上でも画面は縦に動かせる）。
   */
  const hit = useRef<SVGRectElement>(null);
  useEffect(() => {
    const el = hit.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let lock: "x" | "y" | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      x0 = t.clientX;
      y0 = t.clientY;
      lock = null;
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (!lock) {
        const dx = Math.abs(t.clientX - x0);
        const dy = Math.abs(t.clientY - y0);
        if (dx < 4 && dy < 4) return;
        lock = dx >= dy ? "x" : "y";
      }
      if (lock === "x" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", start, { passive: true });
    // 巻き取りを止めるには passive: false が要る（既定の passive では preventDefault が効かない）。
    el.addEventListener("touchmove", move, { passive: false });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
    };
  }, []);

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
        ref={hit}
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
