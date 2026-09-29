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

/**
 * **輪になって回る置き方**（オーナー指示 2026-09-29 R15「図鑑のスライドのカードは白にして…
 * 添付の動画を参考に…カードの下の変な台を削除して。カードをもう少し手前に持ってきてカードを
 * 大きくして。Blenderやthree.jsなどで添付した動画を再現して」— 参考はカードゲームの
 * パック選び。真ん中の1枚が正面・手前、左右は輪に沿って奥へ回り込み、その奥にさらに
 * 小さく次の札が覗く）。
 *
 * 札は横に `RING_R`・奥に `RING_DEPTH`（カードの幅に対して）の楕円の輪の上に、1枚ぶん
 * `RING_STEP` ラジアンずつ並ぶ。真ん中の札が輪の手前（z = 0）。奥行きを横より深くするのは、
 * 左右の札をはっきり小さく奥へ下げ、真ん中の1枚を主役にするため（動画の左右のパックは
 * 真ん中の 9 割ほどの大きさで、真ん中の後ろに少し潜る）。向きは**外側の端が手前**に来るよう
 * 浅く内へ向ける。`x` と `z` はカードの幅を 1 とした値で返す。
 */
const RING_R = 1.0;
const RING_DEPTH = 1.6;
const RING_STEP = 0.78;
/** 真ん中の札が指に 1:1 で付くための、1枚ぶんの送り（カードの幅に対して）。 */
export const CAROUSEL_STEP = RING_R * RING_STEP;
/** これより遠い札は描かない（輪の真後ろは真ん中の札に隠れる）。 */
export const CAROUSEL_REACH = 3.4;

export function carouselPose(
  offset: number,
  reduced = false,
): { x: number; z: number; rotateY: number; zIndex: number; opacity: number } {
  const o = Math.max(-CAROUSEL_REACH, Math.min(CAROUSEL_REACH, offset));
  const a = Math.abs(o);
  const phi = o * RING_STEP;
  return {
    x: RING_R * Math.sin(phi),
    z: -RING_DEPTH * (1 - Math.cos(phi)),
    // 動きを減らす設定では向きを変えない（置き場所だけ輪に沿う）。
    rotateY: reduced ? 0 : (-phi * 0.3 * 180) / Math.PI,
    // 手前ほど上。重なりの順がひっくり返らないように 4 枚より先は同じ値。
    zIndex: 100 - Math.round(Math.min(4, a) * 10),
    // 輪の奥（2 枚より先）はゆっくり薄れて消える。
    opacity: Math.max(0, Math.min(1, 1 - (a - 2.2) * 0.8)),
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
