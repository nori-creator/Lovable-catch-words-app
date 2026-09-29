import { useSyncExternalStore } from "react";

/**
 * **スマホにアプリとして入れる**（オーナー指示 2026-09-29「Android と iPhone でこの URL を
 * 開いて使用でき、またアプリとしてスマホ上にインストールできるようにして」）。
 *
 * - Android（Chrome など）: ブラウザが出す「インストールできます」の合図
 *   （`beforeinstallprompt`）を預かり、アプリの中の釦から出す。
 * - iPhone / iPad: この合図が無い（Apple が用意していない）。共有ボタン →「ホーム画面に追加」
 *   の手順を画面で案内する。
 * - LINE・Instagram などのアプリの中のブラウザでは入れられないので、Safari / Chrome で
 *   開き直すよう案内する。
 * - すでにアプリとして開いている時・ストアのアプリ（Capacitor）の中では何も出さない。
 */

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "android" | "ios" | "in-app" | "desktop";

export type InstallState = {
  /** アプリとして開いている／ストアのアプリの中／入れ終えた。 */
  installed: boolean;
  /** 釦1つで入れられる（Android の Chrome など）。 */
  canPrompt: boolean;
  platform: InstallPlatform;
};

let deferred: InstallEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* 古いブラウザ */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** 端末の種類。`ua` と `touch` は試験用に渡せる。 */
export function detectPlatform(
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
  touch = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints || 0,
): InstallPlatform {
  if (/\bLine\/|Instagram|FBAN|FBAV|FB_IAB|MicroMessenger|Twitter/i.test(ua)) return "in-app";
  // iPadOS は Mac のふりをするので、触れる画面かどうかで見分ける。
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function snapshot(): InstallState {
  return {
    installed: justInstalled || isStandalone() || isNativeShell(),
    canPrompt: deferred !== null,
    platform: detectPlatform(),
  };
}

let cached: InstallState | null = null;
function read(): InstallState {
  const next = snapshot();
  if (
    !cached ||
    cached.installed !== next.installed ||
    cached.canPrompt !== next.canPrompt ||
    cached.platform !== next.platform
  )
    cached = next;
  return cached;
}

const SERVER_STATE: InstallState = { installed: false, canPrompt: false, platform: "desktop" };

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    read,
    () => SERVER_STATE,
  );
}

/** Android: 預かった合図でインストールの画面を出す。入れたら true。 */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome === "accepted";
}

let started = false;

/**
 * 起動時に1回だけ: インストールの合図を預かり、サービスワーカー（`public/sw.js`）を登録する。
 * Lovable の編集画面の中（枠の中）・手元の開発・ストアのアプリの中では登録しない。
 */
export function initPwa(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // ブラウザが勝手に出す帯はやめ、アプリの中の釦から出す。
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    justInstalled = true;
    emit();
  });
  if (!shouldRegisterServiceWorker()) return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* 登録できなくても、ブラウザとしてはそのまま使える */
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function shouldRegisterServiceWorker(
  loc: { protocol: string; hostname: string } = window.location,
  inFrame = window.self !== window.top,
): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (import.meta.env.DEV) return false;
  if (loc.protocol !== "https:") return false;
  if (inFrame) return false;
  if (/(^|\.)id-preview--|lovableproject\.com$|^localhost$/.test(loc.hostname)) return false;
  return !isNativeShell();
}

const DISMISS_KEY = "cw-install-dismissed";

export function installDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* 覚えられなくても、次に開いた時にまた出るだけ */
  }
}
