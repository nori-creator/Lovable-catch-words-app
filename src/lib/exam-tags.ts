/**
 * 検定の印（ECDICT の `exam_tags`）を、読める札に直す。
 *
 * ## なぜ要るか（オーナー指摘 2026-08-27 ⑭）
 * > 「TOCFL の外の単語の場合どのように分類表示するか考えて。」
 *
 * 英語の辞書 25,595 語のうち、CEFR の級が入っているのは 7,009 語だけ。
 * 残り 18,586 語は級が空で、**級外**としか言いようがない。
 * ところが「級外」は「やさしい/知らなくていい」と読まれやすい —
 * `ephemeral`（TOEFL・IELTS・GRE）も `photosynthesis`（TOEFL・GRE）も
 * この 18,586 の側に入っている。
 *
 * 理由は取り込んだ級の出所が **CEFR-J（A1〜B2 まで）** だから。
 * C1・C2 の語は最初から級が付きようがない。実際、本番の級の分布は
 * 1〜4 だけで 5・6 が1語も無い。
 *
 * だから級外の語には、**級の代わりに分かっていること**を出す。
 * その語がどの試験に出るかは `exam_tags` に入っていて、これは事実。
 * 「CEFR の外」と言い切るより「TOEFL・GRE の語」のほうが、
 * 読む人にとって役に立つし、嘘が少ない。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** 出す印と、その並び順。**難しさの順ではなく、学習者に近い順。** */
const KNOWN: ReadonlyArray<{ tag: string; label: string }> = [
  { tag: "toefl", label: "TOEFL" },
  { tag: "ielts", label: "IELTS" },
  { tag: "gre", label: "GRE" },
  { tag: "cet4", label: "CET-4" },
  { tag: "cet6", label: "CET-6" },
  // 中国の学校の課程。台湾の学習者にも通じる語で書く。
  { tag: "zk", label: "中学" },
  { tag: "gk", label: "高校" },
  { tag: "ky", label: "大学院" },
];

/** 一度に出す数の上限。8つ並ぶと、札ではなく壁になる。 */
export const MAX_EXAM_TAGS = 4;

/**
 * 印の並びを、出す札の並びに直す。
 *
 * - 知らない印は落とす（辞書の版が変わって増えた印を素通しすると、
 *   `cet6plus` のような生の綴りがそのまま画面に出る）
 * - 並びは `KNOWN` の順に揃える（辞書の行ごとに順番が違うので、
 *   同じ語なのに札の並びが変わって見える）
 * - 上限で切る
 */
export function examTagLabels(tags: readonly string[] | null | undefined): string[] {
  if (!tags?.length) return [];
  const have = new Set(tags.map((t) => (t ?? "").trim().toLowerCase()).filter(Boolean));
  const out: string[] = [];
  for (const { tag, label } of KNOWN) {
    if (have.has(tag)) out.push(label);
    if (out.length >= MAX_EXAM_TAGS) break;
  }
  return out;
}
