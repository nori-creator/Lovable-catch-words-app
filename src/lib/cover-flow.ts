import { projectMomentum } from "./spring";
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

/** 札と札の間隔（札の幅に対して）。重なって並ぶ量はここで決まる。 */
export const COVER_STEP = 0.62;

/**
 * 指を離したとき、どの札に着くか。指の速さから滑り着く先を見込んで
 * （Apple の減衰の式 `projectMomentum`）、いちばん近い札を選ぶ。端は越えない。
 */
export function settleIndex(offset: number, velocity: number, step: number, count: number): number {
  if (count <= 0) return 0;
  const projected = offset + projectMomentum(velocity);
  return Math.max(0, Math.min(count - 1, Math.round(projected / Math.max(step, 1))));
}
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
 * 下に青いドットのデザインを加えて」）。
 *
 * ## 点は「どこまで来たか」を指す（オーナー指示 2026-09-27）
 * > 「ドットがずっと真ん中のままで意味がない。進むにつれて右に移動するように」
 *
 * 前はいまの1枚を**窓の真ん中**に置いて窓ごと動かしていたので、送っても
 * 青い点は真ん中から動かなかった。いまは点の数を決め（最大 `max`）、
 * **全体のうちどこに居るか**で青い点を選ぶ。先頭なら左端、末尾なら右端、
 * 半分まで来たら真ん中。少ない日は1枚に1つ。押すと、その点が指す所へ送る。
 */
export function progressDots(
  count: number,
  index: number,
  max = 7,
): Array<{ i: number; active: boolean }> {
  if (count <= 0) return [];
  const cur = Math.max(0, Math.min(count - 1, index));
  if (count <= max) return Array.from({ length: count }, (_, i) => ({ i, active: i === cur }));
  const on = Math.round((cur / (count - 1)) * (max - 1));
  return Array.from({ length: max }, (_, k) => ({
    i: Math.round((k / (max - 1)) * (count - 1)),
    active: k === on,
  }));
}
