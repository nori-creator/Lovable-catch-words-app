import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Horizontal swipe-to-advance wrapper (apple-design §2–§6).
 *
 * - 1:1 finger tracking with the grab offset respected (§2), starting from the
 *   card's *current* on-screen position so a mid-spring grab is continuous (§3).
 * - On release, the resting point is *projected* from the release velocity
 *   (§6, Apple's exponential-decay form) — a flick throws the card even from a
 *   small drag — and the commit uses that projection, not the raw offset.
 * - Below threshold it springs back; the transition uses the iOS sheet curve.
 * - Only horizontal, dominant gestures commit; vertical drags fall through to
 *   scroll, and gestures that begin on a control (button/field) are ignored so
 *   the card's own interactions keep working (§10 disambiguation).
 * - Fully disabled under prefers-reduced-motion (§14) — the card's buttons
 *   remain the way to advance.
 */

const INTERACTIVE = "button, a, input, textarea, select, [role='button'], [contenteditable='true']";

// Apple's momentum projection (Designing Fluid Interfaces): where a flick lands.
function project(velocity: number, decelerationRate = 0.998) {
  return (velocity / 1000) * (decelerationRate / (1 - decelerationRate));
}

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
  const [dx, setDx] = useState(0);
  const [spring, setSpring] = useState(true);
  const st = useRef({
    down: false,
    committed: false,
    sx: 0,
    sy: 0,
    baseDx: 0,
    pid: -1,
    hist: [] as { t: number; x: number }[],
  });

  const active = enabled && !reduced;

  function onPointerDown(e: ReactPointerEvent) {
    if (!active) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    st.current = {
      down: true,
      committed: false,
      sx: e.clientX,
      sy: e.clientY,
      baseDx: dx, // start from the presentation value (§3)
      pid: e.pointerId,
      hist: [{ t: performance.now(), x: e.clientX }],
    };
    setSpring(false);
  }

  function onPointerMove(e: ReactPointerEvent) {
    const s = st.current;
    if (!s.down) return;
    const ddx = e.clientX - s.sx;
    const ddy = e.clientY - s.sy;
    if (!s.committed) {
      if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return; // hysteresis (§10)
      if (Math.abs(ddy) > Math.abs(ddx)) {
        s.down = false; // vertical intent — let the page scroll
        return;
      }
      s.committed = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(s.pid);
      } catch {
        /* capture may fail if the pointer already left — safe to ignore */
      }
    }
    s.hist.push({ t: performance.now(), x: e.clientX });
    if (s.hist.length > 6) s.hist.shift();
    setDx(s.baseDx + ddx);
  }

  function end(e: ReactPointerEvent) {
    const s = st.current;
    if (!s.down) return;
    s.down = false;
    setSpring(true);
    if (!s.committed) {
      setDx(0);
      return;
    }
    const h = s.hist;
    let v = 0;
    if (h.length >= 2) {
      const a = h[0];
      const b = h[h.length - 1];
      const dt = b.t - a.t || 16;
      v = ((b.x - a.x) / dt) * 1000; // px/s
    }
    const width = (e.currentTarget as HTMLElement).offsetWidth || 320;
    const current = s.baseDx + (e.clientX - s.sx);
    const projected = current + project(v); // §6: land where the flick is going
    if (Math.abs(projected) > width * 0.4) {
      const dir = projected < 0 ? -1 : 1;
      setDx(dir * (width + 96)); // throw it off-screen along the gesture
      window.setTimeout(onSwipe, 240);
    } else {
      setDx(0); // spring home
    }
  }

  if (!active) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      className={className}
      style={{
        transform: `translateX(${dx}px) rotate(${dx * 0.025}deg)`,
        transition: spring ? "transform 0.34s var(--ease-ios)" : "none",
        touchAction: "pan-y",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}
