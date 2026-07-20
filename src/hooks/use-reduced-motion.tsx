import { useEffect, useState } from "react";

/**
 * Tracks the user's `prefers-reduced-motion` setting (apple-design §14).
 * Components use it to swap springs/parallax/canvas motion for a gentler,
 * non-vestibular equivalent. SSR-safe: defaults to `false` until mounted.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}
