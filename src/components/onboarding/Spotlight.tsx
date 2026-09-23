import { useEffect, useRef, useState } from "react";

/** Overlay blocks pointer input outside the target; capture listeners also block
 * keyboard/assistive clicks and background scroll. No clone of the real control. */
export function Spotlight({
  target,
  text,
  nextLabel,
  onNext,
  interactive = false,
  allowSelector,
}: {
  target: string;
  text: string;
  nextLabel?: string;
  onNext?: () => void;
  interactive?: boolean;
  allowSelector?: string;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = document.querySelector<HTMLElement>(target);
    if (!node) return;
    node.scrollIntoView({ block: "start", behavior: "instant" });
    // Leave the bottom of the viewport for the coach, rather than covering the target.
    if (target !== ".camera-shutter") window.scrollBy(0, -90);
    const measure = () => setRect(node.getBoundingClientRect());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const allowed = (e: Event) =>
      // The shutter's file-picker fallback dispatches a click on its hidden input.
      (target === ".camera-shutter" &&
        e.type === "click" &&
        e.target instanceof HTMLInputElement &&
        e.target.matches('[data-first-stage="camera"] input[type="file"][capture]')) ||
      (e.target instanceof Node &&
        (panel.current?.contains(e.target) ||
          (interactive &&
            node.contains(e.target) &&
            (!allowSelector ||
              (e.target instanceof Element && !!e.target.closest(allowSelector))))));
    const block = (e: Event) => {
      if (!allowed(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const focus = (e: Event) => {
      if (!allowed(e)) panel.current?.focus();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (e.key === "Tab") {
        const selector = 'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]';
        const candidates = [
          ...(interactive ? node.querySelectorAll<HTMLElement>(allowSelector ?? selector) : []),
          ...(interactive && node.matches(selector) ? [node] : []),
          ...(panel.current?.querySelectorAll<HTMLElement>(selector) ?? []),
        ].filter((el) => el.getClientRects().length > 0);
        if (!candidates.length) {
          e.preventDefault();
          panel.current?.focus();
          return;
        }
        e.preventDefault();
        const index = candidates.indexOf(document.activeElement as HTMLElement);
        candidates[(index + (e.shiftKey ? -1 : 1) + candidates.length) % candidates.length].focus();
      }
    };
    const types = ["pointerdown", "click", "wheel", "touchmove"];
    types.forEach((type) =>
      document.addEventListener(type, block, { capture: true, passive: false }),
    );
    document.addEventListener("focusin", focus, true);
    document.addEventListener("keydown", keys, true);
    panel.current?.focus();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      types.forEach((type) => document.removeEventListener(type, block, true));
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("keydown", keys, true);
    };
  }, [target, interactive, allowSelector]);
  const top = rect ? Math.max(8, rect.top - 6) : 0;
  const bottom = rect ? Math.min(window.innerHeight, rect.bottom + 6) : 0;
  const left = rect ? Math.max(6, rect.left - 6) : 0;
  const right = rect ? Math.min(window.innerWidth - 6, rect.right + 6) : 0;
  return (
    <div className="tour-layer" data-tour-overlay>
      <div className="tour-block" style={{ inset: `0 0 auto 0`, height: top }} />
      <div
        className="tour-block"
        style={{ top, bottom: `calc(100% - ${bottom}px)`, left: 0, width: left }}
      />
      <div
        className="tour-block"
        style={{ top, bottom: `calc(100% - ${bottom}px)`, left: right, right: 0 }}
      />
      <div className="tour-block" style={{ top: bottom, bottom: 0, left: 0, right: 0 }} />
      {rect && (
        <div
          className="tour-ring"
          style={{
            top,
            left,
            width: right - left,
            height: bottom - top,
            pointerEvents: interactive ? "none" : "auto",
          }}
        />
      )}
      <div
        ref={panel}
        role="dialog"
        aria-label={text}
        tabIndex={-1}
        className="tour-coach"
        style={
          rect && bottom + 200 < window.innerHeight - 100
            ? { top: bottom + 18 }
            : { bottom: `max(110px, env(safe-area-inset-bottom))` }
        }
      >
        <p>{text}</p>
        {onNext && (
          <button className="first-primary" onClick={onNext}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
