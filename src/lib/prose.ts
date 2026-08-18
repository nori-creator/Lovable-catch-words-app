/**
 * 解説の地の文を、読める形に組み直す所。
 *
 * ## なぜ要るか
 * 解説は `<p>` 1つに全文を流し込んでいた。4文つながった和文が
 * 白地に黒で並ぶだけなので、どこに何が書いてあるか探せない
 * (オーナー指摘: 「白黒で単調」「文をそのまま表示すると見づらい」)。
 *
 * やることは2つだけ:
 *   ① 文の切れ目(。)で段落に分ける
 *   ② 文の中の**学ぶ言語の断片**(「」でくくった語)と**読み**((pinyin))に
 *      印を付けられるよう、素の文字と分けて返す
 *
 * ここは**文字列を分けるだけ**。色も大きさも決めない — それは描く側。
 * 分ける規則を試験で縛れるようにするために切り出している。
 */

export type ProseSpan =
  | { kind: "text"; text: string }
  /** 「」でくくられた語。学ぶ言語の断片であることが多い。 */
  | { kind: "term"; text: string }
  /** (wén) のような、括弧に入った読み。 */
  | { kind: "reading"; text: string };

export type ProseParagraph = ProseSpan[];

/** 和文の文末。閉じ括弧が続くときはそこまでを1文に含める。 */
const SENTENCE_END = /。[」』）)]*/g;

/**
 * 文の切れ目で段落に分ける。
 *
 * 1文しか無ければ分けない(段落が1つだけなら、分ける前と同じ)。
 * 空白だけの断片は落とす。**元の文字は落とさない** — 句点も残す。
 */
export function splitParagraphs(text: string): string[] {
  const s = (text ?? "").trim();
  if (!s) return [];
  const out: string[] = [];
  let last = 0;
  SENTENCE_END.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END.exec(s))) {
    const end = m.index + m[0].length;
    const piece = s.slice(last, end).trim();
    if (piece) out.push(piece);
    last = end;
  }
  const tail = s.slice(last).trim();
  if (tail) out.push(tail);
  return out.length ? out : [s];
}

/** 「」の中と、括弧に入った読みを、素の文字から切り分ける。 */
const MARKS =
  /「([^」]*)」|（([A-Za-zÀ-ÿāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ0-9\s-]+)）|\(([A-Za-zÀ-ÿāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ0-9\s-]+)\)/g;

export function splitSpans(text: string): ProseSpan[] {
  const s = text ?? "";
  const out: ProseSpan[] = [];
  let last = 0;
  MARKS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKS.exec(s))) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] !== undefined) {
      // 中身が空の「」は印にしない(飾りの括弧をそのまま残す)。
      if (m[1]) out.push({ kind: "term", text: m[1] });
      else out.push({ kind: "text", text: m[0] });
    } else {
      out.push({ kind: "reading", text: (m[2] ?? m[3]) as string });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out;
}

/** 段落に分け、さらに各段落を印付きの断片に分ける。 */
export function toProse(text: string): ProseParagraph[] {
  return splitParagraphs(text).map(splitSpans);
}
