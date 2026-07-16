/**
 * Cross-platform haptic feedback shim. Uses navigator.vibrate on Android
 * and gracefully no-ops on iOS Safari (which still doesn't expose a Web
 * haptics API in 2026). Kept intentionally tiny — every UI tap can call it.
 */

type Kind = "light" | "medium" | "heavy" | "success" | "warning" | "selection" | "heartbeat";

const PATTERNS: Record<Kind, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 22,
  selection: 6,
  success: [10, 40, 18],
  warning: [18, 60, 18],
  heartbeat: [12, 260, 12, 260, 12],
};

let enabled = true;
try {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("cw-haptics") : null;
  if (saved === "0") enabled = false;
} catch { /* ignore */ }

export function setHapticsEnabled(v: boolean) {
  enabled = v;
  try { localStorage.setItem("cw-haptics", v ? "1" : "0"); } catch { /* ignore */ }
}
export function areHapticsEnabled() { return enabled; }

export function haptic(kind: Kind = "light") {
  if (!enabled) return;
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try { nav.vibrate(PATTERNS[kind]); } catch { /* ignore */ }
}
