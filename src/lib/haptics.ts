/**
 * Cross-platform haptic feedback shim.
 *
 * Capacitor（ネイティブアプリ）の中では @capacitor/haptics を呼ぶので
 * iOS でも触覚が効く。ブラウザのときは従来どおり navigator.vibrate に
 * 落ちる（iOS Safari では振動API自体が無いので、そこでは何もしない）。
 * 呼び出し側の約束（`haptic("light")` など）は一切変えない。
 */

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

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
} catch {
  /* ignore */
}

export function setHapticsEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem("cw-haptics", v ? "1" : "0");
  } catch {
    /* ignore */
  }
}
export function areHapticsEnabled() {
  return enabled;
}

/** ネイティブにいるときだけ true。Web では Capacitor が橋を持たない。 */
function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function nativeHaptic(kind: Kind) {
  switch (kind) {
    case "light":
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    case "medium":
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    case "heavy":
      await Haptics.impact({ style: ImpactStyle.Heavy });
      return;
    case "selection":
      await Haptics.selectionChanged();
      return;
    case "success":
      await Haptics.notification({ type: NotificationType.Success });
      return;
    case "warning":
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    case "heartbeat":
      // 心拍はネイティブAPIに該当が無いので、弱いimpactを3回刻んで近似。
      for (let i = 0; i < 3; i++) {
        await Haptics.impact({ style: ImpactStyle.Light });
        if (i < 2) await new Promise((r) => setTimeout(r, 260));
      }
      return;
  }
}

export function haptic(kind: Kind = "light") {
  if (!enabled) return;
  if (isNative()) {
    // 待たない。触覚が遅れても画面は止めない。失敗は無視する
    // （OS設定で触覚OFF、デスクトップなど）。
    void nativeHaptic(kind).catch(() => {});
    return;
  }
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}
