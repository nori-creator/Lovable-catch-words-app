import { peelGeometry } from "@/lib/peel-geometry";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { haptic } from "@/lib/haptics";
import "./peel-sticker.css";

type Props = {
  photoUrl: string | null;
  cutoutUrl: string | null;
  label: string;
  actionLabel: string;
  hint: string;
  disabled?: boolean;
  onPeel: () => void;
};

/** Provider-independent alpha silhouette. The peeled half reflects across
 * the drag direction; the back uses the same mask rather than a rectangular fake fold. */
export function PeelSticker({
  photoUrl,
  cutoutUrl,
  label,
  actionLabel,
  hint,
  disabled = false,
  onPeel,
}: Props) {
  const id = useId().replace(/:/g, "");
  const reduced = usePrefersReducedMotion();
  const [loaded, setLoaded] = useState<string | null>(null);
  const [pose, setPose] = useState({ p: 0, x: 0, y: 0 });
  const [angle, setAngle] = useState(Math.PI / 4);
  const [held, setHeld] = useState(false);
  const [committed, setCommitted] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    width: number;
    p: number;
    angle: number | null;
  } | null>(null);
  const frame = useRef(0);
  const ready = !!cutoutUrl && loaded === cutoutUrl;
  const url = (name: string) => `url(#${id}-${name})`;
  useEffect(() => {
    setLoaded(null);
    setPose({ p: 0, x: 0, y: 0 });
    setCommitted(false);
    drag.current = null;
    setHeld(false);
    cancelAnimationFrame(frame.current);
    if (!cutoutUrl) return;
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (alive) setLoaded(cutoutUrl);
    };
    image.src = cutoutUrl;
    return () => {
      alive = false;
    };
  }, [cutoutUrl]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
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
    if (reduced) {
      setPose({ p: target, x: 0, y: 0 });
      return;
    }
    const from = { ...pose, p: drag.current?.p ?? pose.p };
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
    if (disabled || committed || !ready) return;
    setCommitted(true);
    haptic("medium");
    settle(1);
    // Keep the gesture intact for native/photo-library APIs and existing save.
    onPeel();
  }
  function down(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (disabled || committed || !ready || !e.isPrimary || e.button !== 0) return;
    cancelAnimationFrame(frame.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      width: e.currentTarget.clientWidth,
      p: 0,
      angle: null,
    };
    setHeld(true);
    haptic("selection");
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (d.angle === null && Math.hypot(dx, dy) > 5) {
      d.angle = Math.atan2(dy, dx);
      setAngle(d.angle);
    }
    const direction = d.angle ?? angle;
    const p = Math.max(
      0,
      Math.min(1, (dx * Math.cos(direction) + dy * Math.sin(direction)) / (d.width * 0.5)),
    );
    d.p = p;
    setPose({
      p: reduced ? 0 : p,
      x: reduced ? 0 : Math.max(-12, Math.min(28, dx * 0.12)),
      y: reduced ? 0 : Math.max(-12, Math.min(28, dy * 0.12)),
    });
  }
  function release(e: PointerEvent<HTMLButtonElement>, cancelled = false) {
    e.stopPropagation();
    if (drag.current?.id !== e.pointerId) return;
    if (!cancelled && drag.current.p >= 0.58) commit();
    else settle(0);
    drag.current = null;
    setHeld(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const fold = peelGeometry(pose.p, angle);
  return (
    <div
      className="cw-peel"
      data-ready={ready}
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
            type="button"
            className="cw-peel-touch"
            aria-label={`${label}: ${actionLabel}`}
            disabled={disabled || committed}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(e) => release(e)}
            onPointerCancel={(e) => release(e, true)}
            onLostPointerCapture={(e) => {
              if (drag.current?.id === e.pointerId) release(e, true);
            }}
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
                transform: `translate3d(${pose.x}px,${pose.y}px,0) rotate(${held ? -2 : 0}deg) scale(${held ? 1.035 : 1})`,
              }}
            >
              <defs>
                <filter
                  id={`${id}-paper`}
                  x="-30%"
                  y="-30%"
                  width="160%"
                  height="160%"
                  colorInterpolationFilters="sRGB"
                >
                  <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="rim" />
                  <feFlood floodColor="white" />
                  <feComposite in2="rim" operator="in" result="white" />
                  <feMerge>
                    <feMergeNode in="white" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id={`${id}-silhouette`} x="-30%" y="-30%" width="160%" height="160%">
                  <feMorphology in="SourceAlpha" operator="dilate" radius="5" />
                  <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
                </filter>
                <mask
                  id={`${id}-alpha`}
                  maskUnits="userSpaceOnUse"
                  x="-20"
                  y="-20"
                  width="360"
                  height="360"
                >
                  <image
                    href={cutoutUrl!}
                    x="32"
                    y="32"
                    width="256"
                    height="256"
                    filter={url("silhouette")}
                  />
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
                    href={cutoutUrl!}
                    x="32"
                    y="32"
                    width="256"
                    height="256"
                    filter={url("paper")}
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
