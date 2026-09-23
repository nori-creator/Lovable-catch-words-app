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
    zIndex: 100 - Math.round(Math.abs(offset) * 10),
  };
}

export function poseTransform(p: CoverPose): string {
  return `translateZ(${p.translateZ.toFixed(1)}px) rotateY(${p.rotateY.toFixed(2)}deg) scale(${p.scale.toFixed(3)})`;
}
