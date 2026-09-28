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

/**
 * **iPhone の Safari で震わせる**（オーナー指示 2026-09-28「単語をキャッチしたときに
 * スマホのバイブレーションを振動させる」）。
 *
 * Safari は振動の API（`navigator.vibrate`）を持たない — キャッチの演出は前から
 * 何度も `haptic()` を呼んでいたが、iPhone のブラウザでは**1度も震えていなかった**。
 * iOS 18 からの Safari は `<input type="checkbox" switch>` を切り替えると本体の
 * 触覚を鳴らすので、見えない切り替えを置き、札（label）を押して切り替える
 * （切り替えそのものを押しても鳴らない。label 越しに押すのが要点）。
 * 公開の報告では iOS 17.4〜26.4 で効き、26.5 で塞がれた — 効かない端末では何も起きない
 * だけで、画面は壊れない。アプリ（Capacitor）は本物の触覚 API を使うので関係ない。
 */
const IOS_TAPS: Record<Kind, number[]> = {
  light: [0],
  selection: [0],
  medium: [0],
  heavy: [0, 40],
  success: [0, 90],
  warning: [0, 120],
  heartbeat: [0, 270, 540],
};

let iosSwitch: { label: HTMLLabelElement } | null = null;

function isIosWeb(): boolean {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

function iosTap() {
  try {
    if (!iosSwitch || !iosSwitch.label.isConnected) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      input.setAttribute("aria-hidden", "true");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText =
        "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px;top:0";
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = { label };
    }
    iosSwitch.label.click();
  } catch {
    /* 効かない端末では何もしない */
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
  if (typeof nav.vibrate !== "function") {
    if (isIosWeb()) {
      for (const at of IOS_TAPS[kind]) {
        if (at === 0) iosTap();
        else setTimeout(iosTap, at);
      }
    }
    return;
  }
  try {
    nav.vibrate(PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}
