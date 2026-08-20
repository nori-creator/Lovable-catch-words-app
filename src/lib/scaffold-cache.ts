/**
 * スピーキングの足場を「その1枚」に控えるための、鍵の作り方と読み方。
 *
 * ## なぜ語ではなく1枚なのか
 * 足場の質問は**その人が撮ったときの一言**から作る。控えを `words`
 * (利用者どうしで共有される表)に置くと、同じ語を持つ別の人に
 * **その人の思い出が出る**。個人の記憶を混ぜてよい場所ではない。
 *
 * ## なぜ一言を鍵に混ぜるのか
 * 一言を書き直したら質問も作り直す必要がある。古い一言から作った問いが
 * 残ると、**本人にとって身に覚えのないことを聞かれる**ことになる。
 */

/**
 * 一言の指紋。
 * **中身をそのまま鍵にしない** — 長い文がそのまま鍵になると控えが無駄に太る。
 * 書き直したことが分かれば十分。
 */
export function captionFingerprint(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "none";
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * 控えの鍵。表示言語 × 母語 × 一言。
 * どれかが変われば別の足場になる。
 */
export function scaffoldCacheKey(input: {
  lang: string;
  l1: string;
  caption: string | null | undefined;
}): string {
  return `v5_${input.lang}_${input.l1}_${captionFingerprint(input.caption)}`;
}

/**
 * 控えの箱から中身を取り出す。**鍵が違えば使わない。**
 * 形が変わっていても落ちない — 読めなければ作り直すだけ。
 */
export function readScaffoldBox<T>(raw: unknown, key: string, parse: (v: unknown) => T): T | null {
  if (!raw || typeof raw !== "object") return null;
  const box = raw as { key?: unknown; scaffold?: unknown };
  if (box.key !== key) return null;
  try {
    return parse(box.scaffold);
  } catch {
    return null;
  }
}
