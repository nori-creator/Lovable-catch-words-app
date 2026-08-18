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

import { isZhHeadword } from "./target-language";

export type ProseSpan =
  | { kind: "text"; text: string }
  /**
   * 「」でくくられた**学ぶ言語**の語。
   *
   * 「」の中が必ず学ぶ言語とは限らない。解説には「日本語の『ちん』より」の
   * ように**母語を引用する**書き方が普通に出る。中身を見ずに印を付けていたので、
   * かなに中国語の体裁(`lang="zh-Hant"` と青い地)を着せていた —
   * 読み上げにも嘘を教えることになる。
   */
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
/**
 * 読みに使われる文字(ラテン文字・声調記号・数字)。
 * **1箇所にまとめる** — 同じ並びを2つの正規表現に書き写すと、
 * 片方だけ直したときに「ここでは読みと見なすが、あちらでは見なさない」が起きる。
 */
const READING_CHARS = "[A-Za-zÀ-ÿāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ0-9\\s-]+";

/** 語のうしろに付く読み。「珍(zhēn)」の (zhēn) の部分。 */
const READING_TAIL = new RegExp(`(?:（(${READING_CHARS})）|\\((${READING_CHARS})\\))\\s*$`);

const MARKS = new RegExp(`「([^」]*)」|（(${READING_CHARS})）|\\((${READING_CHARS})\\)`, "g");

/**
 * 「」の中身が、学ぶ言語(いまは台湾華語)として印を付けてよいか。
 * 見出し語の判定と**同じ規則**を使う — 2つ目の規則を作ると必ず食い違う。
 */
function isTargetTerm(inner: string): boolean {
  return isZhHeadword(inner);
}

/**
 * 「」の中身を印に変える。
 *
 * 中身が「語 + 読み」の形(「珍(zhēn)」)のことがあるので、読みを外してから
 * 語の判定をする。外さずに見ると、ラテン文字が混ざっているという理由で
 * 弾かれ、**同じ語が場所によって印いたりいなかったりする**
 * (「珍珠奶茶」には付き「珍(zhēn)」には付かない、が実際に起きていた)。
 */
function spansForQuoted(inner: string, whole: string): ProseSpan[] {
  const withReading = inner.match(READING_TAIL);
  if (withReading) {
    const head = inner.slice(0, withReading.index).trim();
    const reading = (withReading[1] ?? withReading[2]) as string;
    if (head && isTargetTerm(head)) {
      return [
        { kind: "term", text: head },
        { kind: "reading", text: reading },
      ];
    }
  }
  if (inner && isTargetTerm(inner)) return [{ kind: "term", text: inner }];
  return [{ kind: "text", text: whole }];
}

export function splitSpans(text: string): ProseSpan[] {
  const s = text ?? "";
  const out: ProseSpan[] = [];
  let last = 0;
  MARKS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKS.exec(s))) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] !== undefined) {
      // 中身が空の「」、および**学ぶ言語でない中身**は印にしない。
      // 括弧ごと素の文字として残す(引用の形は読み手の手がかりなので消さない)。
      out.push(...spansForQuoted(m[1], m[0]));
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
