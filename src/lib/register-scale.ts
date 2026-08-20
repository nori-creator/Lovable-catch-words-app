/**
 * 「その語は話し言葉寄りか、書き言葉寄りか」を **-2〜+2 の目盛り**で持つ所。
 *
 * ## なぜ数にするか
 * これまで `extras.register_tag` は**自由文字列**だった(「口語」「書面」
 * 「口語・書面」…)。文字列のままでは段階にできないので、画面には札を
 * 1つ置くしかなく、「どちら寄りか」が一目で分からない
 * (オーナー要望:「メーターを作り、真ん中だと中立、書き言葉よりなのか
 * 口語なのかメーターの色やレベルが1目でわかるようにして」)。
 *
 * ## 古いカードを壊さない
 * 既にある139語は文字列しか持っていない。**文字列は消さない**で、
 * 数が無いカードは文字列から機械的に写す。写せない文字列は null =
 * 「分からない」— **真ん中(中立)に置かない。**
 * 中立は「どちらでも使う」という主張であって、「知らない」ではない。
 */

/** -2=完全に口語 / -1=やや口語 / 0=中立 / +1=やや書面 / +2=完全に書面。 */
export type RegisterScale = -2 | -1 | 0 | 1 | 2;

export const REGISTER_MIN = -2;
export const REGISTER_MAX = 2;

const SPOKEN = /口語|話し言葉|会話|チャット|SNS|くだけ|スラング/;
const WRITTEN = /書面|書き言葉|文章|新聞|ニュース|報道|論文|公文|硬い/;

/**
 * 範囲に収めて整数にする。壊れた数でも**投げない**(表示が止まるほうが重い)。
 *
 * **`Number()` に素通しさせない。** `Number(null)` も `Number("")` も `0` になる。
 * 0 はこの目盛りでは「中立(どちらでも使う)」という**主張**なので、
 * 「分からない」が言い切りに化ける。試験がこれを捕まえた。
 */
export function clampRegisterScale(v: unknown): RegisterScale | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return Math.max(REGISTER_MIN, Math.min(REGISTER_MAX, r)) as RegisterScale;
}

/**
 * 古い自由文字列から目盛りを写す。
 * **両方書いてあるものだけが中立**(「口語・書面」= どちらでも使う)。
 * どちらとも読めない文字列は null を返す。
 */
export function registerScaleFromTag(tag: string | null | undefined): RegisterScale | null {
  const s = (tag ?? "").trim();
  if (!s) return null;
  const spoken = SPOKEN.test(s);
  const written = WRITTEN.test(s);
  if (spoken && written) return 0;
  if (spoken) return -2;
  if (written) return 2;
  return null;
}

/**
 * 画面に出す目盛りを決める。数があればそれ、無ければ文字列から写す。
 * どちらも無ければ null(メーターそのものを出さない)。
 */
export function registerScaleOf(ex: {
  register_scale?: number | null;
  register_tag?: string | null;
}): RegisterScale | null {
  const fromNumber = ex.register_scale == null ? null : clampRegisterScale(ex.register_scale);
  if (fromNumber !== null) return fromNumber;
  return registerScaleFromTag(ex.register_tag);
}

/**
 * 目盛りに対応する言葉の鍵。**色だけに頼らない**ための文字。
 * 位置(メーターのどこにあるか)・文字・色の3つで同じことを言う。
 */
export function registerLabelKey(scale: RegisterScale): string {
  switch (scale) {
    case -2:
      return "card.regSpoken";
    case -1:
      return "card.regSpokenish";
    case 0:
      return "card.regNeutral";
    case 1:
      return "card.regWrittenish";
    case 2:
      return "card.regWritten";
  }
}
