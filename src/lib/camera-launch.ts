import { motionReducedNow } from "@/hooks/use-reduced-motion";

/**
 * カメラのタブを押したとき、下のレンズが撮影の世界へ広がる演出。
 *
 * ## なぜ React の状態でやらないのか（オーナー指摘 2026-09-15
 * 「カメラのアイコンを押した時のアニメーションが表示されるのが最初だけで
 * 2回目とか押すと表示されなくなる」）
 *
 * もとは `AppShell` が `cameraOpening` という状態を持ち、その状態が真の間だけ
 * 覆いを描いていた。ところが**この app は画面ごとに `AppShell` を描いている**
 * （16ファイルが各自 `<AppShell>` を持つ）。押すと画面が入れ替わる =
 * **覆いを持っている当人が消える**。演出は始まった瞬間に道連れになる。
 *
 * 最初の1回だけ見えていたのは、初回は行き先の読み込みに時間がかかって
 * 古い画面が少し残るから。2回目からは行き先が手元にあるので即座に入れ替わり、
 * **演出が始まる前に消える**。押す速さではなく、読み込みの速さで出たり
 * 出なかったりしていた。
 *
 * だから React の外に出す。`document.body` に直に貼り、720ms 後に自分で
 * 剥がす。画面が何回入れ替わろうと、貼った物は誰の持ち物でもないので消えない。
 */

/** 演出の長さ(ms)。CSS の `camera-lens-open` と揃える。 */
const OPEN_MS = 720;
/** 動きを減らす設定のときの長さ。CSS の `-reduced` と揃える。 */
const OPEN_MS_REDUCED = 220;

/** いま出ている覆い。**二重に出さない**（連打しても1枚）。 */
let live: { el: HTMLElement; timer: number } | null = null;

export function playCameraLaunch(): void {
  if (typeof document === "undefined") return;
  // 連打。**前のを消してから出し直す** — 重ねると2枚目が1枚目の上で
  // 同じ絵を描き、縁が二重に見える。
  if (live) {
    window.clearTimeout(live.timer);
    live.el.remove();
    live = null;
  }
  const el = document.createElement("div");
  el.className = "camera-launch";
  el.setAttribute("aria-hidden", "true");
  const lens = document.createElement("span");
  lens.className = "camera-launch__lens";
  el.appendChild(lens);
  document.body.appendChild(el);
  const ms = motionReducedNow() ? OPEN_MS_REDUCED : OPEN_MS;
  const timer = window.setTimeout(() => {
    el.remove();
    live = null;
  }, ms + 40);
  live = { el, timer };
}
