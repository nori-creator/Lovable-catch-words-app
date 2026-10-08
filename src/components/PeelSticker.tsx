import { peelGeometry } from "@/lib/peel-geometry";
import {
  movePeelDrag,
  peelOutcome,
  pointerDrives,
  startPeelDrag,
  type PeelDrag,
} from "@/lib/peel-gesture";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { haptic } from "@/lib/haptics";
import { preloadConfetti3d } from "@/components/three/load-confetti";
import "./peel-sticker.css";

type Props = {
  photoUrl: string | null;
  label: string;
  actionLabel: string;
  hint: string;
  disabled?: boolean;
  onPeel: () => void;
  /**
   * 指（またはマウス）が札を掴んだ時。剥がし終える前に呼ぶ — 呼ぶ側はここで札の絵を
   * 決着させる（掴んだ後に絵が替わると、剥がしが最初からやり直しになる）。
   */
  onGrab?: () => void;
};

/**
 * 写真の読み込みを待つ上限（ms）。`onload` が来ない端末・壊れた写真でも、札を
 * はがせないまま置き去りにしない（その時は下に敷いた `<img>` がそのまま見える）。
 */
const READY_TIMEOUT = 2500;

/** The photo as a rounded sticker. The peeled half reflects across
 * the drag direction; the back uses the same mask rather than a rectangular fake fold.
 *
 * 指の動きの決まり（iPhone の Safari ではがせなかった件を含む）は `lib/peel-gesture.ts`。 */
export function PeelSticker({
  photoUrl,
  label,
  actionLabel,
  hint,
  disabled = false,
  onPeel,
  onGrab,
}: Props) {
  const id = useId().replace(/:/g, "");
  const reduced = usePrefersReducedMotion();
  const [loaded, setLoaded] = useState<string | null>(null);
  const [pose, setPoseState] = useState({ p: 0, x: 0, y: 0 });
  const [angle, setAngle] = useState(Math.PI / 4);
  const [held, setHeld] = useState(false);
  const [committed, setCommitted] = useState(false);
  const drag = useRef<PeelDrag | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const artwork = photoUrl;
  const ready = !!artwork && loaded === artwork;
  const url = (name: string) => `url(#${id}-${name})`;
  /**
   * 最新の値。Touch の受け口は `addEventListener` で付ける（React の `onTouchMove` は
   * passive なので `preventDefault()` が効かない）ため、描画ごとの値をここから読む。
   */
  const live = useRef({ disabled, committed, ready, reduced, angle, pose, onPeel, onGrab });
  live.current = { disabled, committed, ready, reduced, angle, pose, onPeel, onGrab };
  const setPose = (next: { p: number; x: number; y: number }) => {
    live.current.pose = next;
    setPoseState(next);
  };
  useEffect(() => {
    setLoaded(null);
    setPose({ p: 0, x: 0, y: 0 });
    setCommitted(false);
    drag.current = null;
    setHeld(false);
    cancelAnimationFrame(frame.current);
    if (!artwork) return;
    let alive = true;
    const done = () => {
      if (alive) setLoaded(artwork);
    };
    const image = new Image();
    image.onload = done;
    // 読めなかった・知らせが来ない時も、はがせる面は出す（写真は下の `<img>` が見せる）。
    image.onerror = done;
    const timer = setTimeout(done, READY_TIMEOUT);
    image.src = artwork;
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [artwork]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // はがした直後のキャッチの演出（3D の紙吹雪）を、札が出ている間に読んでおく。
  useEffect(() => (ready && !reduced ? preloadConfetti3d() : undefined), [ready, reduced]);
  // The parent re-enables the surface after a failed save. Allow retry.
  useEffect(() => {
    if (!disabled && committed) {
      const timer = setTimeout(() => {
        setCommitted(false);
        setPose({ p: 0, x: 0, y: 0 });
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [disabled, committed]);
  function settle(target: number) {
    cancelAnimationFrame(frame.current);
    if (live.current.reduced) {
      setPose({ p: target, x: 0, y: 0 });
      return;
    }
    const current = live.current.pose;
    const from = { ...current, p: drag.current?.p ?? current.p };
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      const spring = t === 1 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(10 * t);
      setPose({
        p: Math.max(0, Math.min(1, from.p + (target - from.p) * spring)),
        x: from.x * (1 - spring),
        y: from.y * (1 - spring),
      });
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  function commit() {
    const state = live.current;
    if (state.disabled || state.committed || !state.ready) return;
    live.current.committed = true;
    setCommitted(true);
    haptic("medium");
    settle(1);
    // Keep the gesture intact for native/photo-library APIs and existing save.
    state.onPeel();
  }
  function canStart() {
    const state = live.current;
    return !state.disabled && !state.committed && state.ready;
  }
  function begin(next: PeelDrag) {
    cancelAnimationFrame(frame.current);
    drag.current = next;
    setHeld(true);
    live.current.onGrab?.();
  }
  function update(x: number, y: number) {
    const d = drag.current;
    if (!d) return;
    const { p, angle: chosen } = movePeelDrag(d, x, y, live.current.angle);
    if (chosen !== null && chosen !== live.current.angle) {
      live.current.angle = chosen;
      setAngle(chosen);
    }
    setPose({ p: live.current.reduced ? 0 : p, x: 0, y: 0 });
  }
  function finish(cancelled: boolean) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setHeld(false);
    if (peelOutcome(d, performance.now(), cancelled) === "commit") commit();
    else settle(0);
  }
  function down(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!canStart() || !e.isPrimary || e.button !== 0) return;
    // Touch Events が先に始めた引っ張り（`touchstart` が先に来る端末）は、そのまま続ける。
    if (drag.current?.touch != null) return;
    // 指（touch）は Touch Events が来ればそちらへ渡す（`touchstart` が `touch` を埋める）。
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 捕まえられない端末でも、引っ張りは続ける */
    }
    begin(
      startPeelDrag({
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        width: e.currentTarget.clientWidth,
        now: performance.now(),
      }),
    );
    // 指で触れた瞬間に震わせるのは Pointer の時だけ。iPhone の Safari の触覚
    // （`haptics.ts` の見えないスイッチを押す）は、引いている指の最中に挟まない。
    if (e.pointerType !== "touch") haptic("selection");
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!pointerDrives(drag.current, e.pointerId)) return;
    update(e.clientX, e.clientY);
  }
  function release(e: PointerEvent<HTMLButtonElement>, cancelled = false) {
    e.stopPropagation();
    if (!pointerDrives(drag.current, e.pointerId)) return;
    finish(cancelled);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  /**
   * **指は Touch Events でも追う**（iPhone の Safari、`lib/peel-gesture.ts`）。
   * 受け口は `passive: false` — 引いている間の `touchmove` を止めないと、iOS は画面を
   * 巻き取り始めて Pointer の引っ張りを `pointercancel` で切る。
   */
  useEffect(() => {
    const el = button.current;
    if (!el || !ready) return;
    const find = (list: TouchList, identifier: number | null) => {
      for (let i = 0; i < list.length; i++) {
        const t = list.item(i);
        if (t && (identifier === null || t.identifier === identifier)) return t;
      }
      return null;
    };
    const start = (e: TouchEvent) => {
      const t = e.changedTouches.item(0);
      if (!t) return;
      const d = drag.current;
      if (d && d.touch === null) {
        // Pointer で始まった同じ指。ここからは Touch の側で動かす。
        d.touch = t.identifier;
        return;
      }
      if (d || e.touches.length > 1 || !canStart()) return;
      // Pointer Events が来ない端末: Touch だけで始める。
      begin(
        startPeelDrag({
          id: -1 - t.identifier,
          touch: t.identifier,
          x: t.clientX,
          y: t.clientY,
          width: el.clientWidth,
          now: performance.now(),
        }),
      );
    };
    const moveTouch = (e: TouchEvent) => {
      const d = drag.current;
      if (!d || d.touch === null) return;
      const t = find(e.changedTouches, d.touch);
      if (!t) return;
      // 巻き取り・ゴムの伸び・拡大を止める（引いている指は、シールだけが受ける）。
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      update(t.clientX, t.clientY);
    };
    const end = (cancelled: boolean) => (e: TouchEvent) => {
      const d = drag.current;
      if (!d || d.touch === null || !find(e.changedTouches, d.touch)) return;
      // 指を離した後の作り物の click（カードを裏返す親の onClick）を出さない。
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      finish(cancelled);
    };
    const touchEnd = end(false);
    const touchCancel = end(true);
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", moveTouch, { passive: false });
    el.addEventListener("touchend", touchEnd, { passive: false });
    el.addEventListener("touchcancel", touchCancel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", moveTouch);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("touchcancel", touchCancel);
    };
    // 受け口は面が出た時に1回だけ付ける。中の値は `live` から読む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  const fold = peelGeometry(pose.p, angle);
  return (
    <div
      className="cw-peel"
      data-ready={ready}
      data-photo={true}
      data-held={held}
      data-reduced={reduced}
      data-committed={committed}
    >
      {photoUrl && (
        <img className="cw-peel-photo" src={photoUrl} alt={ready ? "" : label} draggable={false} />
      )}
      {ready && (
        <>
          <button
            ref={button}
            type="button"
            className="cw-peel-touch"
            aria-label={`${label}: ${actionLabel}`}
            disabled={disabled || committed}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(e) => release(e)}
            onPointerCancel={(e) => release(e, true)}
            onLostPointerCapture={(e) => release(e, true)}
            onClick={(e) => {
              e.stopPropagation();
              if (e.detail === 0) commit();
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg
              className="cw-peel-art"
              viewBox="0 0 320 320"
              aria-hidden="true"
              style={{
                transform: `translate3d(${pose.x}px,${pose.y}px,0) rotate(0deg) scale(1)`,
              }}
            >
              <defs>
                <clipPath id={`${id}-photo-round`}>
                  <rect x="20" y="20" width="280" height="280" rx="22" />
                </clipPath>
                <mask
                  id={`${id}-alpha`}
                  maskUnits="userSpaceOnUse"
                  x="-20"
                  y="-20"
                  width="360"
                  height="360"
                >
                  <rect x="20" y="20" width="280" height="280" rx="22" fill="white" />
                </mask>
                <clipPath id={`${id}-front`}>
                  <polygon points={fold.front} />
                </clipPath>
                <clipPath id={`${id}-fold`}>
                  <polygon points={fold.fold} />
                </clipPath>
                <linearGradient id={`${id}-back`} x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#fff" />
                  <stop offset=".65" stopColor="#f5f4f1" />
                  <stop offset="1" stopColor="#a9a8b2" />
                </linearGradient>
                <linearGradient id={`${id}-shine`}>
                  <stop stopColor="#b1ffdc" stopOpacity="0" />
                  <stop offset=".38" stopColor="#b2ffe1" stopOpacity=".35" />
                  <stop offset=".52" stopColor="white" stopOpacity=".85" />
                  <stop offset=".68" stopColor="#d9b6ff" stopOpacity=".45" />
                  <stop offset="1" stopColor="#fbc8e2" stopOpacity="0" />
                </linearGradient>
                <linearGradient
                  id={`${id}-curl`}
                  gradientUnits="userSpaceOnUse"
                  x1={fold.x}
                  y1={fold.y}
                  x2={fold.x + fold.nx * 36}
                  y2={fold.y + fold.ny * 36}
                >
                  <stop stopColor="#85838d" />
                  <stop offset=".24" stopColor="#dedde2" />
                  <stop offset=".6" stopColor="#fff" />
                  <stop offset="1" stopColor="#f4f3f1" />
                </linearGradient>
              </defs>
              <g mask={url("alpha")} opacity={pose.p * 0.18}>
                <rect width="320" height="320" fill="white" />
              </g>
              <g className="cw-peel-shadow">
                <g clipPath={url("front")}>
                  <image
                    href={artwork!}
                    x="20"
                    y="20"
                    width="280"
                    height="280"
                    clipPath={url("photo-round")}
                    preserveAspectRatio="xMidYMid slice"
                  />
                  <g mask={url("alpha")}>
                    <rect
                      className="cw-peel-shine"
                      x="-240"
                      y="0"
                      width="220"
                      height="320"
                      fill={url("shine")}
                    />
                  </g>
                </g>
                {pose.p > 0.005 && (
                  <g transform={fold.matrix}>
                    <g clipPath={url("fold")}>
                      <g mask={url("alpha")}>
                        <rect width="320" height="320" fill={url("back")} />
                        <rect width="320" height="320" fill={url("curl")} transform={fold.matrix} />
                      </g>
                    </g>
                  </g>
                )}
              </g>
            </svg>
          </button>
          <span className="cw-peel-hint" aria-hidden="true">
            {hint}
          </span>
        </>
      )}
    </div>
  );
}
