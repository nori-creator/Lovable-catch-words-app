/**
 * 図鑑のカード表示（カバーフロー）の、1枚ごとの傾き・奥行き。
 *
 * （オーナー指示 2026-09-22「図鑑の種類をもう一つ追加する…バブルティーの
 *  カードを動画のように横にスライドできるようにする」— 参考は iTunes /
 *  iPod のカバーフロー）
 *
 * `offset` は「真ん中から何枚ぶん離れているか」（左が負、右が正、小数）。
 * 真ん中の1枚は正面を向いて手前に、左右の札は**真ん中へ顔を向けて**奥へ
 * 下がる。2枚より先は同じ角度のまま重なっていく。
 */
export type CoverPose = {
  rotateY: number;
  translateZ: number;
  scale: number;
  zIndex: number;
};

const MAX_TILT = 50;
const DEPTH = 110;

export function coverFlowPose(offset: number, reduced = false): CoverPose {
  const o = Math.max(-2, Math.min(2, offset));
  const a = Math.abs(o);
  const near = Math.min(1, a);
  return {
    // 動きを減らす設定では傾けない（奥行きと大きさの差だけ残す）。
    rotateY: reduced ? 0 : -Math.sign(o) * near * MAX_TILT,
    translateZ: -a * DEPTH,
    scale: 1 - a * 0.07,
    // 真ん中ほど手前。重なった札の順番がひっくり返らないように。
    // 4枚より先は同じ値（見えない札の書き換えを止める。滑らかさのため）。
    zIndex: 100 - Math.round(Math.min(4, Math.abs(offset)) * 10),
  };
}

export function poseTransform(p: CoverPose): string {
  return `translateZ(${p.translateZ.toFixed(1)}px) rotateY(${p.rotateY.toFixed(2)}deg) scale(${p.scale.toFixed(3)})`;
}

/**
 * カードの下の**青い点**（オーナー指示 2026-09-23「図鑑のスライドするやつは
 * 下に青いドットのデザインを加えて」— 参考はコレクションのカードの下の点）。
 *
 * 語が何百あっても点を何百も並べない。iPhone のページの点と同じく、**いまの
 * 1枚のまわりの `max` 個だけ**を出し、端に近い点は小さくして「まだ続く」を
 * 示す。`size` は 2 = 大（いま）、1 = 中、0 = 小（続きがある端）。
 */
export function dotWindow(
  count: number,
  index: number,
  max = 7,
): Array<{ i: number; size: 0 | 1 | 2 }> {
  if (count <= 0) return [];
  const n = Math.min(count, max);
  const cur = Math.max(0, Math.min(count - 1, index));
  const start = Math.max(0, Math.min(count - n, cur - Math.floor(n / 2)));
  const out: Array<{ i: number; size: 0 | 1 | 2 }> = [];
  for (let k = 0; k < n; k++) {
    const i = start + k;
    const moreLeft = k === 0 && start > 0;
    const moreRight = k === n - 1 && start + n < count;
    out.push({ i, size: i === cur ? 2 : moreLeft || moreRight ? 0 : 1 });
  }
  return out;
}
