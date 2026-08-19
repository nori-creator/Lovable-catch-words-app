/**
 * 和文の約物(句読点・括弧・感嘆符)の決めごとを**機械が読める形**にする。
 *
 * ## なぜ要るか
 * 前の周に i18n 全体を手で洗って、半角の `!` `?` `(` `)` を和文の中から
 * 追い出した。**しかしそれを守らせる物が何も無かった**ので、その後に
 * 足した1文がさっそく半角括弧で戻っていた
 * (「選ぶとすぐ保存されます(下の「保存」は不要)。」)。
 * 手で直した決めごとは、次に文字列を足す人には見えない。規則そのものを
 * 検査にして、増えないようにする。
 *
 * ## 何を規則にして、何を規則にしないか
 * **今すでに違反が0のものだけ**を規則にする。半角コロンは i18n に18件
 * 残っているが、これは前の周に「残す」と決めた物
 * (`例: 芒果` のように、後ろに欧文や変数が続く見出し)。決めた事と
 * 違う規則を作れば、検査は「直せ」と言い続けて誰も見なくなる。
 * 規則は**現状を固定する物**であって、方針を変える物ではない。
 *
 * ここは純粋な関数だけを置く。i18n も React も import しない —
 * 検査の対象(辞書)と検査する道具(この file)を分けておかないと、
 * 道具の試験が辞書の中身に引きずられる。
 */

/** 破った決めごとの名前。 */
export type JaPunctRule = "bang" | "paren" | "counter" | "ellipsis";

export type JaPunctIssue = {
  rule: JaPunctRule;
  /** 実際に見つかった文字列(直す場所が分かるように、前後を少し含める)。 */
  found: string;
};

/** かな・漢字・和文の約物。「和文の直後か」を判定するのに使う。 */
const JA_CHAR = "ぁ-んァ-ヶ一-龥々ー、。「」『』（）";

/**
 * 助数詞。**数と助数詞の間は空けない**(「6枚」であって「6 枚」ではない)。
 *
 * 全部を並べる気は無い。実際に app が数える物だけを挙げる —
 * 網羅していない一覧を網羅のふりで持つと、載っていない助数詞が
 * 「規則が無いから正しい」に見える。
 */
const COUNTERS = "枚回件語日個人分秒歳冊本匹";

/**
 * 和文の半角括弧。
 *
 * ## 「和文の括弧」の見分け方
 * **中身に欧文が混じらないこと**で見る。最初は「中身が全部かな・漢字」で
 * 書いたが、それだと「全体の記憶率(前後2週間)」を見逃した — 数字が1つ
 * 入っているだけで和文でなくなる訳がない。和文の中で算用数字は普通に使う
 * (6枚・2週間)。同じ理由で `§` や中黒も和文の側に数える。
 *
 * 欧文が混じる物は半角のままでよい(`(zh-TW)` `(TOCFL Level 2)`)。
 * 全角括弧の中に欧文を入れると、その欧文の左右だけ不自然に空く。
 *
 * 和文が1文字も無い物(`(3)` のような番号)も触らない。括弧の中が
 * 数字だけなら、それは和文の文ではない。
 *
 * `{n}` のような差し込みは中身が実行時まで分からないので見逃す。
 * 入れ子も見ない — 静かに見逃すだけで、嘘の合格は作らない。
 */
const HALF_PAREN = /\(([^()]*)\)/g;

/** 半角のままでよい括弧か。 */
function parenIsFine(inner: string): boolean {
  if (!inner) return true;
  if (/[A-Za-z]/.test(inner)) return true; // 欧文が混じる
  if (inner.includes("{")) return true; // 差し込み
  return !/[ぁ-んァ-ヶ一-龥]/.test(inner); // 和文が1文字も無い
}

/** 和文の直後の半角 `!` `?`。前が欧文なら半角のままでよい(`OK!`)。 */
const HALF_BANG = new RegExp(`[${JA_CHAR}][!?]`, "g");

/** 数と助数詞の間の空白。 */
const COUNTER_SPACE = new RegExp(`[0-9０-９]\\s+[${COUNTERS}]`, "g");

/** 点3つ。和文では三点リーダ `…` を使う。 */
const ASCII_ELLIPSIS = /\.\.\./g;

const RULES: readonly [JaPunctRule, RegExp][] = [
  ["bang", HALF_BANG],
  ["counter", COUNTER_SPACE],
  ["ellipsis", ASCII_ELLIPSIS],
];

/**
 * 1つの文字列を見て、破っている決めごとを全部返す。
 * 何も破っていなければ空の配列。**投げない** — 一覧をまとめて見たいので、
 * 最初の1件で止まっては困る。
 */
export function checkJaPunctuation(text: string): JaPunctIssue[] {
  const out: JaPunctIssue[] = [];
  HALF_PAREN.lastIndex = 0;
  for (const m of text.matchAll(HALF_PAREN)) {
    if (!parenIsFine(m[1])) out.push({ rule: "paren", found: m[0] });
  }
  for (const [rule, re] of RULES) {
    // `g` 付きの正規表現は `lastIndex` を持ち回るので、使う前に必ず戻す。
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) out.push({ rule, found: m[0] });
  }
  return out;
}

/** 人が読む一行。どの決めごとを、どこで破ったか。 */
export function describeIssue(key: string, issue: JaPunctIssue): string {
  const how: Record<JaPunctRule, string> = {
    paren: "中身が和文だけの括弧は全角(（）)にする",
    bang: "和文の直後の感嘆符・疑問符は全角(！？)にする",
    counter: "数と助数詞の間は空けない",
    ellipsis: "点3つではなく三点リーダ(…)を使う",
  };
  return `${key}: 「${issue.found}」 — ${how[issue.rule]}`;
}
