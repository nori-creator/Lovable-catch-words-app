import { useEffect, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { createSpring, projectMomentum, velocityFrom, type Spring } from "@/lib/spring";

/**
 * 横スワイプで次へ進むカード(apple-design §2〜§6)。
 *
 * - §2 指に1:1で付いてくる。掴んだ位置のずれも保つ。
 * - §3 **途中で掴める**。戻っている最中のカードを掴んでも飛ばない —
 *   ばねの**いまの値**から続きを引き継ぐ。逆向きに投げ直しても速度が
 *   連続するので「壁にぶつかった」感じが出ない。
 * - §5 離した瞬間の**速度をばねに引き渡す**。ドラッグと自走の継ぎ目が消える。
 * - §6 着地点は速度から**予測**する。小さく速く弾いただけでも飛んでいく。
 * - §8 進む向きに回転と傾きで先出しする。どこへ行くのか予告してから行く。
 * - §10 縦方向のドラッグはスクロールに譲る。ボタンや入力の上から始めた
 *   ジェスチャーは無視する(カード内の操作を殺さないため)。
 * - §14 reduced motion では丸ごと無効。カード内のボタンで進める。
 *
 * 以前は離したあとが CSS transition だった。時間が決め打ちなので、戻る途中の
 * カードを掴むと state 上の 0 から再開してガクッと飛んでいた。ばねに替えて
 * 「いつでも掴める」を本当にした。
 */

const INTERACTIVE = "button, a, input, textarea, select, [role='button'], [contenteditable='true']";

/** 画面外へ投げ切ったと見なす余白。 */
const OFFSCREEN_PAD = 96;
/** 進むと判定する距離(カード幅に対する比)。予測着地点で測る。 */
const COMMIT_RATIO = 0.4;

export function SwipeCard({
  children,
  onSwipe,
  enabled = true,
  className,
}: {
  children: ReactNode;
  onSwipe: () => void;
  enabled?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const active = enabled && !reduced;

  const elRef = useRef<HTMLDivElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const swipeRef = useRef(onSwipe);
  swipeRef.current = onSwipe;

  const st = useRef({
    down: false,
    committed: false,
    sx: 0,
    sy: 0,
    baseDx: 0,
    pid: -1,
    thrown: false,
    hist: [] as { t: number; x: number }[],
  });

  // ばねは1本(横方向のみ)。値が変わるたびに transform を直接書く —
  // React の再描画を挟まないので、指との遅れが出ない(§1/§11)。
  useEffect(() => {
    if (!active) return;
    const paint = (dx: number) => {
      const el = elRef.current;
      if (!el) return;
      // §8 進む向きへの先出し: 回転は移動量に比例させる。
      el.style.transform = `translate3d(${dx}px, 0, 0) rotate(${dx * 0.025}deg)`;
    };
    const s = createSpring(0, paint, { damping: 1, response: 0.35 });
    springRef.current = s;
    return () => {
      s.dispose();
      springRef.current = null;
    };
  }, [active]);

  function onPointerDown(e: ReactPointerEvent) {
    if (!active) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    const s = springRef.current;
    if (!s || st.current.thrown) return;
    // §3 いま画面に出ている値から掴む。走行中なら**その場で止める** —
    // 目標値から始めるとここで飛ぶ。
    const live = s.value();
    s.stop();
    st.current = {
      down: true,
      committed: false,
      sx: e.clientX,
      sy: e.clientY,
      baseDx: live,
      pid: e.pointerId,
      thrown: false,
      hist: [{ t: performance.now(), x: e.clientX }],
    };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const s = st.current;
    const spring = springRef.current;
    if (!s.down || !spring) return;
    const ddx = e.clientX - s.sx;
    const ddy = e.clientY - s.sy;
    if (!s.committed) {
      if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return; // §10 ヒステリシス
      if (Math.abs(ddy) > Math.abs(ddx)) {
        s.down = false; // 縦に動いた = スクロールの意思。譲る
        return;
      }
      s.committed = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(s.pid);
      } catch {
        /* ポインタが既に外に出ていると失敗する。無視して問題ない */
      }
    }
    s.hist.push({ t: performance.now(), x: e.clientX });
    if (s.hist.length > 6) s.hist.shift();
    // §2 指と1:1。ばねを経由せず値を直接置く。
    spring.set(s.baseDx + ddx);
  }

  function end(e: ReactPointerEvent) {
    const s = st.current;
    const spring = springRef.current;
    if (!s.down || !spring) return;
    s.down = false;
    if (!s.committed) {
      spring.to(0);
      return;
    }
    const v = velocityFrom(s.hist); // px/s
    const width = (e.currentTarget as HTMLElement).offsetWidth || 320;
    const current = spring.value();
    const projected = current + projectMomentum(v); // §6 弾いた先を見る

    if (Math.abs(projected) > width * COMMIT_RATIO) {
      // §5 速度をそのまま引き渡すので、指を離した瞬間に継ぎ目が出ない。
      // §4 勢いのある操作の後なので少しだけ跳ねてよい。
      const dir = projected < 0 ? -1 : 1;
      s.thrown = true;
      spring.to(dir * (width + OFFSCREEN_PAD), {
        velocity: v,
        damping: 0.9,
        response: 0.3,
      });
      window.setTimeout(() => swipeRef.current(), 240);
    } else {
      // 戻る。ここも速度を引き継ぐ — 戻す方向に弾いていればその勢いで戻る。
      spring.to(0, { velocity: v, damping: 1, response: 0.35 });
    }
  }

  if (!active) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      className={className}
      style={{ touchAction: "pan-y", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
