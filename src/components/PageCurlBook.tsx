import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { constrainCorner, curlGeometry, foldGradient, polygonCss, type Pt } from "@/lib/page-curl";

/**
 * **本のようにめくれるアルバム**（オーナー指示 2026-09-27、ほぼ日手帳・絵本の
 * 動画を参考に）。
 *
 * > 「どこからでもページがめくれるように。めくった時の残像やページの
 * >  柔らかさを再現。動画を見直してこのクオリティを作る」
 *
 * - **どこを掴んでもめくれる。** 押した高さが上半分なら右上の角、下半分なら
 *   右下の角を掴んだことにして、指の動きぶん角を動かす（`page-curl.ts`）。
 * - 紙は**斜めの折り目で折り返り、裏が見える**。折り目には光の筋と影、
 *   めくれた紙の下の面には落ち影。
 * - **柔らかさ**: 離すと角は弧を描いて持ち上がりながら着地する（紙が空気を
 *   含んで浮く動き）。
 * - **残像**: 速く払うと、めくれる紙の後ろに薄い紙の影が2枚ついてくる
 *   （速さに比例して濃く）。ほぼ日の動画で、勢いよくめくったときに紙が
 *   何枚も重なって見えるのを写した。
 * - 軽く叩くだけでもめくれる（右の端=次、左の端=前）。
 * - 見開き（`spread`）では右の紙が背を軸に左へ倒れる。左の紙を掴むと戻る。
 *
 * **めくっている間は React で描き直さない**。角の位置が変わるたびに
 * 切り抜きと変換だけを要素に直接書く（写真が何枚あっても1コマに収まる）。
 */
export type BookPage = {
  key: string;
  content: ReactNode;
  /** 紙の裏（表紙の裏など）。無ければ表が薄く透けた紙。 */
  back?: ReactNode;
};

type Turn = {
  dir: "next" | "prev";
  /** 動く角（めくる1枚の中の座標。背が x=0）。 */
  C0: Pt;
  /** この向きの「成功」の端（めくり切る / 平らに戻す）。 */
  success: "turned" | "flat";
  /** 見開きで左の紙をめくる（左右を裏返して計算する）。 */
  mirrored: boolean;
};

const ASPECT = 1.38;

export function PageCurlBook({
  pages,
  spread = false,
  className = "",
  paperClass = "album-bg-paper",
}: {
  pages: BookPage[];
  spread?: boolean;
  className?: string;
  /** 紙の地（本物の紙の凹凸）。 */
  paperClass?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [at, setAt] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);

  // 描く要素（めくっている間は直に書く）。
  const frontEl = useRef<HTMLDivElement>(null);
  const flapEl = useRef<HTMLDivElement>(null);
  const flapShade = useRef<HTMLDivElement>(null);
  const underShade = useRef<HTMLDivElement>(null);
  const ghostEls = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  const st = useRef({
    P: { x: 0, y: 0 } as Pt,
    dragging: false,
    pointerId: -1,
    down: null as null | { x: number; y: number; t: number; local: Pt; P0: Pt },
    history: [] as Array<{ P: Pt; t: number }>,
    anim: 0,
    turn: null as Turn | null,
  });

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const full = el.clientWidth;
      const W = spread ? full / 2 : full;
      setSize({ W, H: Math.round(W * ASPECT) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [spread]);

  useEffect(() => () => cancelAnimationFrame(st.current.anim), []);
  // めくり始めた回は、層が描かれた直後に1度描く（最初の指の動きを落とさない）。
  useLayoutEffect(() => {
    if (turn) paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  const { W, H } = size;
  const step = spread ? 2 : 1;
  const canNext = spread ? at + 2 < pages.length : at + 1 < pages.length;
  const canPrev = spread ? at > 0 : at > 0;

  // ---- 1コマぶんを描く ------------------------------------------------------
  const paint = () => {
    const s = st.current;
    const t = s.turn;
    if (!t || !W) return;
    const g = curlGeometry(t.C0, s.P, W, H);
    const front = frontEl.current;
    const flap = flapEl.current;
    if (!front || !flap) return;
    if (!g) {
      front.style.clipPath = "none";
      flap.style.visibility = "hidden";
      ghostEls.forEach((r) => r.current && (r.current.style.visibility = "hidden"));
      if (underShade.current) underShade.current.style.background = "none";
      return;
    }
    front.style.clipPath = polygonCss(g.flat);
    flap.style.visibility = "visible";
    flap.style.clipPath = polygonCss(g.lifted);
    flap.style.transform = `matrix(${g.matrix.join(",")})`;

    const fg = foldGradient(g.n, g.mid, W, H);
    const reach = Math.hypot(t.C0.x - s.P.x, t.C0.y - s.P.y) / 2;
    // 折り返った紙: 折り目に光の筋、端へ向かって少し陰る（紙が丸まっている）。
    if (flapShade.current) {
      flapShade.current.style.background = `linear-gradient(${fg.angle}deg,
        transparent ${fg.at - 1}px,
        rgb(255 255 255 / 0.55) ${fg.at}px,
        rgb(255 255 255 / 0.12) ${fg.at + 10}px,
        rgb(0 0 0 / 0.03) ${fg.at + reach * 0.45}px,
        rgb(0 0 0 / 0.16) ${fg.at + reach}px)`;
    }
    // めくれた下の面: 折り目のすぐ外に落ち影。
    if (underShade.current) {
      const depth = Math.min(46, 10 + reach * 0.18);
      underShade.current.style.background = `linear-gradient(${fg.angle}deg,
        transparent ${fg.at - 1}px,
        rgb(0 0 0 / 0.30) ${fg.at}px,
        rgb(0 0 0 / 0.08) ${fg.at + depth * 0.5}px,
        transparent ${fg.at + depth}px)`;
    }

    // 残像: 数コマ前の角の位置で、紙の形だけを薄く。
    const now = performance.now();
    s.history.push({ P: { ...s.P }, t: now });
    while (s.history.length > 10) s.history.shift();
    const prev = s.history[s.history.length - 4];
    const speed = prev
      ? Math.hypot(s.P.x - prev.P.x, s.P.y - prev.P.y) / Math.max(1, now - prev.t)
      : 0;
    const strength = Math.max(0, Math.min(1, (speed - 0.6) / 2.4));
    ghostEls.forEach((r, i) => {
      const el = r.current;
      if (!el) return;
      const h = s.history[s.history.length - 1 - (i + 1) * 3];
      const gg = h && strength > 0 ? curlGeometry(t.C0, h.P, W, H) : null;
      if (!gg) {
        el.style.visibility = "hidden";
        return;
      }
      el.style.visibility = "visible";
      el.style.clipPath = polygonCss(gg.lifted);
      el.style.transform = `matrix(${gg.matrix.join(",")})`;
      el.style.opacity = String(strength * (i === 0 ? 0.42 : 0.22));
    });
  };

  // ---- めくり始める --------------------------------------------------------
  const begin = (dir: "next" | "prev", localY: number): Turn => {
    const top = localY < H / 2;
    const C0 = { x: W, y: top ? 0 : H };
    const mirrored = spread && dir === "prev";
    // 1ページずつのとき、前へ戻すのは「めくり切ってある前の紙を平らに戻す」。
    const success = !spread && dir === "prev" ? "flat" : "turned";
    const t: Turn = { dir, C0, success, mirrored };
    st.current.turn = t;
    st.current.P = success === "flat" ? { x: -W, y: C0.y } : { ...C0 };
    st.current.history = [];
    setTurn(t);
    return t;
  };

  const toLocal = (clientX: number, clientY: number, t: Turn | null, dir?: "next" | "prev") => {
    const r = root.current!.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const d = t?.dir ?? dir;
    if (!spread) return { x, y };
    return d === "prev" ? { x: W - x, y } : { x: x - W, y };
  };

  // ---- 離した後・叩いた後の動き -------------------------------------------
  const settle = (toTurned: boolean, velocity = 0) => {
    const s = st.current;
    const t = s.turn;
    if (!t) return;
    cancelAnimationFrame(s.anim);
    const from = { ...s.P };
    const to = toTurned ? { x: -W, y: t.C0.y } : { ...t.C0 };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const reduce = document.documentElement.dataset.motion === "reduce";
    const dur = reduce ? 1 : Math.max(260, Math.min(620, dist * 1.1 - Math.abs(velocity) * 60));
    const lift = reduce ? 0 : Math.min(H * 0.14, dist * 0.12);
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      // 紙は空気を含んで**弧を描いて**着地する（まっすぐ滑らない）。
      const arc = Math.sin(Math.PI * k) * lift * (t.C0.y === 0 ? 1 : -1);
      s.P = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e + arc,
      };
      paint();
      if (k < 1) {
        s.anim = requestAnimationFrame(tick);
        return;
      }
      s.anim = 0;
      const done = toTurned === (t.success === "turned");
      if (done) setAt((n) => (t.dir === "next" ? n + step : n - step));
      s.turn = null;
      setTurn(null);
    };
    s.anim = requestAnimationFrame(tick);
  };

  const flipBy = (dir: "next" | "prev", localY = H * 0.8) => {
    if (dir === "next" ? !canNext : !canPrev) return;
    const t = begin(dir, localY);
    requestAnimationFrame(() => {
      paint();
      settle(t.success === "turned");
    });
  };

  // ---- 指 --------------------------------------------------------------------
  const onDown = (e: ReactPointerEvent) => {
    if (!W) return;
    const s = st.current;
    s.pointerId = e.pointerId;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    // 動いている最中の紙を**掴み直せる**（止めてから指に付ける）。
    if (s.turn && s.anim) {
      cancelAnimationFrame(s.anim);
      s.anim = 0;
      s.dragging = true;
    }
    const local = toLocal(e.clientX, e.clientY, s.turn);
    s.down = { x: e.clientX, y: e.clientY, t: performance.now(), local, P0: { ...s.P } };
  };

  const onMove = (e: ReactPointerEvent) => {
    const s = st.current;
    if (!s.down || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.down.x;
    const dy = e.clientY - s.down.y;
    if (!s.turn) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      let dir: "next" | "prev";
      if (spread) {
        const r = root.current!.getBoundingClientRect();
        dir = s.down.x - r.left > W ? "next" : "prev";
      } else dir = dx < 0 ? "next" : "prev";
      if (dir === "next" ? !canNext : !canPrev) return;
      begin(dir, s.down.y - root.current!.getBoundingClientRect().top);
      s.down.local = toLocal(s.down.x, s.down.y, s.turn);
      s.down.P0 = { ...s.P };
      s.dragging = true;
    }
    const t = s.turn!;
    const local = toLocal(e.clientX, e.clientY, t);
    const want = {
      x: s.down.P0.x + (local.x - s.down.local.x),
      y: s.down.P0.y + (local.y - s.down.local.y),
    };
    s.P = constrainCorner(want, t.C0, W, H);
    paint();
  };

  const onUp = (e: ReactPointerEvent) => {
    const s = st.current;
    if (!s.down || e.pointerId !== s.pointerId) return;
    const down = s.down;
    s.down = null;
    if (!s.turn) {
      // 叩いた: 端の近くならめくる。
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 8 && performance.now() - down.t < 400) {
        const r = root.current!.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const full = r.width;
        if (x > full * 0.62) flipBy("next", y);
        else if (x < full * 0.38) flipBy("prev", y);
      }
      return;
    }
    s.dragging = false;
    // 速さ（角の横の動き、px/ms）。払った勢いを先の位置に足して決める。
    const h = s.history;
    const a = h[h.length - 1];
    const b = h[Math.max(0, h.length - 5)];
    const vx = a && b && a.t !== b.t ? (a.P.x - b.P.x) / (a.t - b.t) : 0;
    const projected = s.P.x + vx * 140;
    // 角が紙の真ん中を越えたらめくる（本と同じ手応え）。
    settle(projected < W * 0.4, vx);
  };

  // ---- 描く ------------------------------------------------------------------
  const page = (i: number) => pages[i];
  const Paper = ({ children, className: c = "" }: { children?: ReactNode; className?: string }) => (
    <div className={`page-curl__paper ${paperClass} ${c}`} style={{ width: W, height: H }}>
      {children}
    </div>
  );
  const backOf = (i: number) => {
    const p = page(i);
    if (!p) return <Paper />;
    if (p.back) return <Paper>{p.back}</Paper>;
    // 裏は**表が薄く透けた紙**（薄い紙を光にかざした見え方）。
    return (
      <Paper className="page-curl__backside">
        <div className="page-curl__bleed">{p.content}</div>
      </Paper>
    );
  };
  const face = (i: number) => {
    const p = page(i);
    return <Paper>{p?.content}</Paper>;
  };

  // めくっている1枚の中身。
  let frontIdx = -1;
  let underIdx = -1;
  let backNode: ReactNode = null;
  if (turn) {
    if (!spread) {
      frontIdx = turn.dir === "next" ? at : at - 1;
      underIdx = turn.dir === "next" ? at + 1 : at;
      backNode = backOf(frontIdx);
    } else if (turn.dir === "next") {
      frontIdx = at;
      underIdx = at + 2;
      // 見開きの右の紙の裏 = 次の見開きの左の紙。めくり切ると鏡に映って
      // 正しく読めるよう、先に左右を裏返しておく。
      backNode = <div style={{ transform: "scaleX(-1)" }}>{face(at + 1)}</div>;
    } else {
      frontIdx = at - 1;
      underIdx = at - 3;
      // 左の紙の裏 = 前の見開きの右の紙（裏返した枠の中なので、そのままで読める）。
      backNode = face(at - 2);
    }
  }
  const unmirror = (node: ReactNode) =>
    turn?.mirrored ? <div style={{ transform: "scaleX(-1)" }}>{node}</div> : node;

  const leafLeft = !turn ? 0 : spread ? (turn.dir === "next" ? W : 0) : 0;

  return (
    <div
      ref={root}
      className={`page-curl ${spread ? "page-curl--spread" : ""} ${className}`}
      style={{ height: H || undefined }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {W > 0 && (
        <>
          {/* 動いていない紙 */}
          {spread ? (
            <>
              <div className="page-curl__slot" style={{ left: 0 }}>
                {(!turn || turn.dir === "next") && at - 1 >= 0 && face(at - 1)}
              </div>
              <div className="page-curl__slot" style={{ left: W }}>
                {(!turn || turn.dir === "prev") && face(at)}
              </div>
              <div className="page-curl__spine" style={{ left: W }} aria-hidden />
            </>
          ) : (
            !turn && <div className="page-curl__slot">{face(at)}</div>
          )}

          {/* めくっている1枚 */}
          {turn && (
            <div
              className="page-curl__leaf"
              style={{
                left: leafLeft,
                width: W,
                height: H,
                transform: turn.mirrored ? "scaleX(-1)" : undefined,
              }}
            >
              <div className="page-curl__layer">
                {underIdx >= 0 && underIdx < pages.length ? unmirror(face(underIdx)) : null}
                <div ref={underShade} className="page-curl__shade" />
              </div>
              <div ref={frontEl} className="page-curl__layer">
                {unmirror(face(frontIdx))}
              </div>
              {ghostEls.map((r, i) => (
                <div key={i} className="page-curl__ghost-wrap">
                  <div
                    ref={r}
                    className={`page-curl__ghost ${paperClass}`}
                    style={{ width: W, height: H, visibility: "hidden" }}
                  />
                </div>
              ))}
              <div className="page-curl__flap-wrap">
                <div
                  ref={flapEl}
                  className="page-curl__flap"
                  style={{ width: W, height: H, visibility: "hidden" }}
                >
                  {backNode}
                  <div ref={flapShade} className="page-curl__shade" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
