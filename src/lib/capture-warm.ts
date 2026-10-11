/**
 * **カメラを開いた時の下準備（`warmUpCapture`）を、1分に1回まで**にする。
 *
 * 撮る画面は開き直すたびに作り直される（タブの行き来・撮り直し）。そのたびに呼ぶ必要は無い —
 * サーバの覚え（同意・呼ぶ人の種類・使う AI）は数分もつ。
 */
export const CAPTURE_WARM_EVERY_MS = 60_000;

let lastWarm = Number.NEGATIVE_INFINITY;

export function shouldWarmCapture(now: number = Date.now()): boolean {
  if (now - lastWarm < CAPTURE_WARM_EVERY_MS) return false;
  lastWarm = now;
  return true;
}

/** 試験用。 */
export function resetCaptureWarm(): void {
  lastWarm = Number.NEGATIVE_INFINITY;
}
