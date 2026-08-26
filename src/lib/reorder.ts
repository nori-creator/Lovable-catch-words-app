/**
 * 並べ替えの計算。**指の動きから離して、ここだけで試験する。**
 *
 * オーナー指示 2026-08-25:
 * > 「単語の項目の選択バーを**長押ししたらドラッグ&ドロップ**で並べ替え」
 *
 * ## なぜ純粋な関数に切り出すか
 * ドラッグは「押した / 動いた / 離した」の組み合わせで、画面の上でしか
 * 起こらない。そこに**並べ替えの計算まで混ぜる**と、順番がずれる不具合が
 * 出たときに「指の扱いが悪いのか、計算が悪いのか」を切り分けられない。
 *
 * ここには**座標と配列**しか無い。DOM もタイマーも触らない。
 */

/** 長押しと見なす時間(ms)。押してすぐ動かすのは「スクロール」。 */
export const LONG_PRESS_MS = 400;

/**
 * 長押しの判定を諦める指の移動量(px)。
 *
 * **0 にはできない。** 指は必ず少し動くので、0 にすると長押しが一度も
 * 成立しない。逆に大きすぎると、スクロールのつもりが並べ替えになる。
 */
export const LONG_PRESS_SLOP_PX = 8;

/** 1つ動かす。**元の配列は変えない。** */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const clamped = Math.max(0, Math.min(out.length - 1, to));
  if (from === clamped) return out;
  const [item] = out.splice(from, 1);
  out.splice(clamped, 0, item);
  return out;
}

/** 行の縦の範囲。画面から測って渡す。 */
export type RowBox = { top: number; bottom: number };

/**
 * 指がいまどの行の上に在るか。**どの行の上でもなければ `null`。**
 *
 * 行の間の隙間や、一覧の外に出たときに `0` を返すと、
 * **一覧の外へ指を出しただけで先頭に飛ぶ**(触っていて一番驚く壊れ方)。
 */
export function rowAtY(rows: readonly RowBox[], y: number): number | null {
  for (let i = 0; i < rows.length; i++) {
    if (y >= rows[i].top && y <= rows[i].bottom) return i;
  }
  return null;
}

/**
 * 掴んでいる行を、指の位置に合わせてどこへ動かすか。
 *
 * 行の上に無いときは**動かさない**(`from` を返す)。
 * 一覧の**外**へ出たときも同じ — 掴んだまま指を一覧の外へ出す人は多い。
 */
export function dragTarget(rows: readonly RowBox[], from: number, y: number): number {
  const at = rowAtY(rows, y);
  return at == null ? from : at;
}
