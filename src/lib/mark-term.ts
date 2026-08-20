/**
 * 文の中から、その語が出ている所を切り出す。
 *
 * 例文に見出し語が埋もれていて、**どれがその語なのか目で探す**必要があった
 * (オーナー指摘 2026-08-20:「例文の該当の単語は色でマーカーで色付けして。
 * 発音のコツなどで実装してるのと同じように青で」)。
 *
 * 印を付けるのは描く側の仕事だが、**どこに付けるか**は文字列の問題なので
 * ここで決める。純粋な関数にしておけば、境目の振る舞いを試験で決められる。
 */

export type TermSpan = { text: string; hit: boolean };

/**
 * `text` を `term` の前後で切る。`term` が無ければ丸ごと1つ返す。
 *
 * **空の切れ端は返さない。** 語が先頭や末尾に在るとき、素直に切ると
 * 前後に空文字が出る。描く側がそれを `<span>` にすると、
 * 中身の無い印が1つ増える。
 */
export function splitAroundTerm(
  text: string | null | undefined,
  term: string | null | undefined,
): TermSpan[] {
  const src = text ?? "";
  const needle = (term ?? "").trim();
  if (!src) return [];
  // 1文字の語でも印は付けたい(「茶」「水」)。ただし空は探さない —
  // 空を探すと indexOf が 0 を返し続けて止まらなくなる。
  if (!needle) return [{ text: src, hit: false }];

  const out: TermSpan[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) out.push({ text: src.slice(from, at), hit: false });
    out.push({ text: needle, hit: true });
    from = at + needle.length;
  }
  if (from < src.length) out.push({ text: src.slice(from), hit: false });
  return out.length > 0 ? out : [{ text: src, hit: false }];
}
