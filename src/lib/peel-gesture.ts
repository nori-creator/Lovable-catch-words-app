/**
 * **シールをはがす指の動き**の決まり（`PeelSticker.tsx`）。画面に触らない純粋な部分だけを
 * ここに置き、テスト（`peel-gesture.test.ts`）で確かめる。
 *
 * ## iPhone の Safari で「はがせない」（実機の報告 2026-10-03）
 *
 * 前は Pointer Events だけで引っ張っていた。指で引くと iOS は途中で画面を巻き取る側に
 * 回し、`pointercancel` を送ってくる — 札は少しめくれては戻るだけで、チュートリアルでは
 * 「図鑑に追加」の釦も案内の板で押せないので、先へ進めなかった。
 *
 * - `touch-action: none` は付けていたが、iOS はそれを Web の中ではなく**表示の層の重なり**
 *   で引き当てる。いちばん疑わしいのは、カードの裏面（`card-back`、180度回って見えない面、
 *   `touch-action` 無し）が表の上に重なっていること（実機では未確認。`styles.css` で
 *   見えない面を `visibility: hidden` にして外した）。デスクトップの WebKit（実物確認の
 *   自動操作はマウス）と Chromium はその道を通らないので、どちらでも再現しなかった。
 *   iOS と同じく途中で `pointercancel` を送ると、前のコードは Chromium の指でもはがれない。
 * - 直し方: 指の動きは**Touch Events でも受ける**（受け口はシール自身に、`passive: false`）。
 *   引いている間の `touchmove` で `preventDefault()` して巻き取りを止め、指で始めた引っ張りは
 *   `pointercancel` / `lostpointercapture` では終わらせない（終わりは `touchend`）。
 *   Pointer Events が来ない端末（古い iOS）では `touchstart` から始める。
 * - **軽く押す（タップ）だけでもはがれる。** 引く距離が足りない・指が滑る人でも進める
 *   （キーボードの Enter / Space と同じ「はがす」）。
 */

/** はがれたと見なす引きの割合（`progress` がこれ以上で離せば、はがれる）。 */
export const PEEL_COMMIT = 0.32;
/** タップと見なす指の揺れ（px）。これより動いたら「引いた」。 */
export const PEEL_TAP_SLOP = 10;
/** タップと見なす長さ（ms）。長押しは、はがさない（写真を見ているだけ）。 */
export const PEEL_TAP_MS = 600;
/** 引く向きを決めるまでの動き（px）。 */
const ANGLE_AFTER = 5;

export type PeelDrag = {
  /** Pointer の id（Touch から始めた時は -1 - identifier）。 */
  id: number;
  /** Touch Events で追っている指の identifier。Touch が来なければ null。 */
  touch: number | null;
  x: number;
  y: number;
  width: number;
  startedAt: number;
  /** 始めた所から一番離れた距離（タップかどうか）。 */
  moved: number;
  p: number;
  angle: number | null;
};

export function startPeelDrag(at: {
  id: number;
  x: number;
  y: number;
  width: number;
  now: number;
  touch?: number | null;
}): PeelDrag {
  return {
    id: at.id,
    touch: at.touch ?? null,
    x: at.x,
    y: at.y,
    width: Math.max(1, at.width),
    startedAt: at.now,
    moved: 0,
    p: 0,
    angle: null,
  };
}

/** 指が動いた。引きの割合と向きを更新する（`drag` をその場で書き換える）。 */
export function movePeelDrag(drag: PeelDrag, x: number, y: number, fallbackAngle: number) {
  const dx = x - drag.x,
    dy = y - drag.y;
  const distance = Math.hypot(dx, dy);
  drag.moved = Math.max(drag.moved, distance);
  if (drag.angle === null && distance > ANGLE_AFTER) drag.angle = Math.atan2(dy, dx);
  const direction = drag.angle ?? fallbackAngle;
  drag.p = Math.max(
    0,
    Math.min(1, (dx * Math.cos(direction) + dy * Math.sin(direction)) / (drag.width * 1.75)),
  );
  return { p: drag.p, angle: drag.angle };
}

/**
 * 離した時の結末。十分引いた・軽く押した → はがす。途中で止められた（`cancelled`）・
 * 引きが足りない・長押し → 元に戻す。
 */
export function peelOutcome(drag: PeelDrag, now: number, cancelled = false): "commit" | "settle" {
  if (cancelled) return "settle";
  if (drag.p >= PEEL_COMMIT) return "commit";
  const tap = drag.moved <= PEEL_TAP_SLOP && now - drag.startedAt <= PEEL_TAP_MS;
  return tap ? "commit" : "settle";
}

/**
 * Pointer の知らせを、この引っ張りで使うか。指で始めて Touch Events が届いている
 * 引っ張りは、Touch の側だけで動かす（iOS が途中で送る `pointercancel` で切らない）。
 */
export function pointerDrives(drag: PeelDrag | null, pointerId: number): boolean {
  return !!drag && drag.id === pointerId && drag.touch === null;
}
