/**
 * **押した所にピントを合わせる**（オーナー指示 2026-09-30「カメラモードを使ってるときに
 * ものにフォーカスを絞りたいときに何もできないから、ものをタップしたらフォーカスできる
 * ようにして」）。
 *
 * 使うのは W3C の *MediaStream Image Capture* にある `pointsOfInterest`（映像の中の
 * 0〜1 の位置）と `focusMode`。**端末とブラウザが持っている時だけ**使う — 持って
 * いない端末で印だけ出すと「合わせたように見えて合っていない」嘘になるので、
 * そのときは何も出さない（`focusSupport` が null）。
 */

export type FocusPoint = { x: number; y: number };

type Rect = { left: number; top: number; width: number; height: number };

/**
 * 押した画面上の点 → 映像の中の位置（0〜1）。
 *
 * 映像は `object-fit: contain` で枠に収めているので、縦横比が違えば上下か左右に
 * 余白ができる。余白を押したら null（映像の外）。`rect` は `<video>` の
 * `getBoundingClientRect()` — 見た目の拡大（CSS の `scale`）も含んだ大きさなので、
 * 拡大中でも押した物の位置がそのまま出る。
 */
export function focusPointFromTap(
  clientX: number,
  clientY: number,
  rect: Rect,
  videoWidth: number,
  videoHeight: number,
): FocusPoint | null {
  if (!rect.width || !rect.height || !videoWidth || !videoHeight) return null;
  const boxAspect = rect.width / rect.height;
  const videoAspect = videoWidth / videoHeight;
  let w = rect.width;
  let h = rect.height;
  if (videoAspect > boxAspect) h = rect.width / videoAspect;
  else w = rect.height * videoAspect;
  const left = rect.left + (rect.width - w) / 2;
  const top = rect.top + (rect.height - h) / 2;
  const x = (clientX - left) / w;
  const y = (clientY - top) / h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

type FocusCaps = { focusMode?: string[]; exposureMode?: string[] };

/** ピントの合わせ方。端末が持っていなければ null。 */
export type FocusSupport = { focusMode: string | null; exposure: boolean } | null;

/**
 * この映像の線がタップでピントを合わせられるか。
 * `pointsOfInterest` を受け付けない（WebKit などの）ブラウザでは null。
 */
export function focusSupport(track: MediaStreamTrack | undefined): FocusSupport {
  if (!track || typeof navigator === "undefined") return null;
  const supported = (navigator.mediaDevices?.getSupportedConstraints?.() ?? {}) as Record<
    string,
    boolean | undefined
  >;
  if (!supported.pointsOfInterest) return null;
  const caps = ((track.getCapabilities as undefined | (() => FocusCaps))?.call(track) ??
    {}) as FocusCaps;
  const modes = caps.focusMode ?? [];
  const focusMode = modes.includes("single-shot")
    ? "single-shot"
    : modes.includes("continuous")
      ? "continuous"
      : null;
  const exposure = (caps.exposureMode ?? []).includes("continuous");
  // 合わせ方も露出も持たないなら、位置を渡しても何も変わらない。
  if (!focusMode && !exposure) return null;
  return { focusMode, exposure };
}

/** 押した位置にピント（と明るさ）を合わせる。効かなければ false。 */
export async function focusAt(
  track: MediaStreamTrack,
  support: NonNullable<FocusSupport>,
  point: FocusPoint,
): Promise<boolean> {
  const c: Record<string, unknown> = { pointsOfInterest: [point] };
  if (support.focusMode) c.focusMode = support.focusMode;
  if (support.exposure) c.exposureMode = "continuous";
  try {
    // 標準の型に無い項目（Image Capture の拡張）なので `never` で渡す。
    await track.applyConstraints({ advanced: [c] } as never);
    return true;
  } catch {
    return false;
  }
}

/** 2本の指の間の距離（つまんで寄る倍率の計算に使う）。 */
export function pinchDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
