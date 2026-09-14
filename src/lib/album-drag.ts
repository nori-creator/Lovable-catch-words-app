/**
 * ホームのアルバムを **iPhone のホーム画面のように**触る所の、数だけ。
 *
 * ## オーナー指示 2026-09-13
 * > 「ホームの画像長押ししたら、iPhone のアプリを長押しした時のように
 * >  画像が揺れてドラックしたら場所を変更できて、角を引っ張ったら
 * >  大きさを変更できるようにして。」
 *
 * 長押し・並べ替え・角での拡縮の**仕組みは既に在った**。iPhone らしく
 * 感じられなかった理由は4つで、どれも「有るか無いか」ではなく数の問題:
 *
 *   ① 揺れが速すぎた（170ms＝約6Hz）。iOS はおよそ 4Hz で、
 *      **回転だけでなく上下の揺れも混ざる**。回転だけだと
 *      「震えている」であって「ぐらぐらしている」に見えない。
 *   ② 揺れの位相が2種類しかなかった（`nth-child(2n)`）。半分が
 *      完全に同期して動くので、機械的に見える。
 *   ③ 長押しした指でそのまま掴めなかった。**一度離して押し直す**必要が
 *      あった（iOS は押さえたまま動かせる）。
 *   ④ 角を引くと4つの型に飛ぶだけで、しかも**元の大きさに戻せなかった**。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** アルバムの札の大きさ。升目いくつ分か、で持つ。 */
export type AlbumSize = "small" | "portrait" | "landscape" | "large";

/** 大きさ → 升目（横, 縦）。 */
export const SIZE_CELLS: Record<AlbumSize, readonly [number, number]> = {
  small: [1, 1],
  portrait: [1, 2],
  landscape: [2, 1],
  large: [2, 2],
};

/** 升目（横, 縦）→ 大きさ。 */
export function sizeOfCells(w: number, h: number): AlbumSize {
  const cw = Math.min(2, Math.max(1, Math.round(w)));
  const ch = Math.min(2, Math.max(1, Math.round(h)));
  if (cw === 2 && ch === 2) return "large";
  if (cw === 2) return "landscape";
  if (ch === 2) return "portrait";
  return "small";
}

/**
 * 角を引いたときの大きさ。
 *
 * ## 「方向」ではなく「縦横それぞれ」で決める
 * 前は `dx > 24 && dy > 24 ? "large" : |dx|>|dy| ? …` と**進んだ向き**から
 * 4つの型を選んでいた。角を引く動作は本来「横に広げる」と「縦に伸ばす」の
 * 2つが同時に起きているだけなので、軸ごとに独立に決めるほうが手に合う。
 *
 * ## 元の大きさに戻れること
 * 前は掴んだ瞬間の大きさを `current` に取り置き、`next !== current` の
 * ときだけ書き換えていた。`current` は**一度も更新されない**ので、
 * 大きくしてから引き返しても「元と同じ」と判定されて**戻せなかった**。
 * ここでは毎回「いま指が何升ぶん動いたか」から作り直すので、
 * 引き返せば必ず戻る。
 *
 * @param dx 掴んでからの横の移動 px（右が正）
 * @param dy 掴んでからの縦の移動 px（下が正）
 * @param start 掴んだ瞬間の大きさ
 * @param cell 升目1つの大きさ px（横, 縦）
 */
export function resizeFromDrag(
  dx: number,
  dy: number,
  start: AlbumSize,
  cell: readonly [number, number] = [96, 96],
): AlbumSize {
  const [sw, sh] = SIZE_CELLS[start];
  return sizeOfCells(sw + cellDelta(dx, cell[0]), sh + cellDelta(dy, cell[1]));
}

/**
 * 何升ぶん引いたか。**同じ所で行き来しても震えない**ように、
 * 升目の 55% まで引かないと next へ進まない（ヒステリシス）。
 *
 * 45% など半分より小さくすると、境目で指が1px揺れるだけで
 * 大きさが行ったり来たりして、掴んでいる物が壊れて見える。
 */
export function cellDelta(d: number, cellSize: number): number {
  const unit = Math.max(cellSize, 1);
  const steps = d / unit;
  // 0.55 を越えたら1升、1.55 を越えたら2升…（途中で戻れば必ず戻る）
  const n = Math.floor(Math.abs(steps) + 0.45);
  // **`-0` を返さない。** `Math.sign(-1) * 0` は -0 になる。計算は同じでも、
  // 呼ぶ側が `Object.is` や `toEqual` で比べた日に説明の付かない差になる。
  return n === 0 ? 0 : Math.sign(steps) * n;
}

/**
 * 揺れの位相。**札ごとに違う**。
 *
 * iOS は並んだアイコンが少しずつずれて揺れる。全部が同じ拍で動くと
 * 機械の表になり、2種類だけでも「半分ずつ揃っている」と目が気づく。
 *
 * id から作るので、描き直しても位相が飛ばない（描き直すたびに位相が
 * 変わると、揺れが一瞬止まって見える）。
 */
export function jiggleStyle(id: string): { delayMs: number; durationMs: number } {
  const h = fnv1a(id);
  return {
    // 位相は1周期ぶんの中で散らす。負の delay は「途中から始める」。
    delayMs: -(h % JIGGLE.periodMs),
    // 周期も少しだけ散らす。完全に同じ周期だと、位相をずらしても
    // いずれ揃ってしまう（うなり）。
    durationMs: JIGGLE.periodMs + ((h >>> 8) % JIGGLE.jitterMs),
  };
}

/**
 * 揺れの形。
 *
 * `periodMs 240` ≒ 4Hz。前は 170ms（約6Hz）で、速すぎて「震えている」
 * ようにしか見えなかった。
 *
 * `rotateDeg` と `liftPx` を**両方**動かすのが要点。回転だけだと軸が
 * 止まって見え、平行移動だけだと滑って見える。混ぜると「留め具が緩んで
 * ぐらついている」になる。
 */
export const JIGGLE = {
  periodMs: 240,
  jitterMs: 60,
  rotateDeg: 1.1,
  liftPx: 0.9,
} as const;

/** 掴んで持ち上がった札の見え方。**掴んだ物は揺れを止める**（iOS と同じ）。 */
export const LIFTED = {
  scale: 1.08,
  /** 影の濃さ。持ち上がった高さを伝えるのは影だけ。 */
  shadowAlpha: 0.34,
  shadowBlurPx: 22,
} as const;

/**
 * 並べ替え。`from` を抜いて `to` の位置に差し込む。
 *
 * **入れ替えではなく差し込み。** 入れ替え（swap）にすると、間の札が
 * 飛び越されて元の並びが読めなくなる。
 */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 文字列 → 32bit の数（FNV-1a）。同じ字なら必ず同じ数。 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
