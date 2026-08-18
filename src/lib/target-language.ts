/**
 * 「その文字列は、学んでいる言語の見出し語として通してよいか」を決める所。
 *
 * ## なぜ要るか
 * 母語(日本語)で調べる欄がある。入力は AI が台湾華語の見出し語に解決して
 * `headword_zh` で返す。ところが呼ぶ側は
 *
 *   const resolved = c.headword_zh || headword;
 *
 * と書いてあった。**解決できなかったときに日本語がそのまま見出しになる。**
 * 実際「シャーペン」がカタカナのまま図鑑に入り、注音だけが下に付いた。
 * 画面はエラーを出さない — 学習者は自分の母語を「台湾華語の単語」として
 * 覚えることになる。
 *
 * 見出し語は**学んでいる言語だけ**を通す。通せないなら、黙って落とさず
 * 呼ぶ側で作り直させる。
 */

/** かな(ひらがな・カタカナ)。長音符 ー は含めない — 単体では判定に使えない。 */
const KANA = /[ぁ-ゟァ-ヺヽヾ]/;
/** 漢字(CJK統合漢字 + 拡張A + 繰り返し記号 々)。 */
const HAN = /[㐀-䶿一-鿿々]/;
/** ラテン文字とキリル文字、ハングル。 */
const NON_CJK_LETTER = /[A-Za-zЀ-ӿ가-힯]/;

/** 見た目だけの飾り(空白・約物・記号)を落とす。 */
function core(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[，、。．・…！？!?,.:;：；「」『』（）()【】〔〕[\]{}"'’”—–\-~〜]/g, "");
}

/**
 * 台湾華語の見出し語として通せるか。
 *
 * 通す: 漢字だけ(「文旦」「橡皮擦」)。日本語の漢字語と見分けは付かないが、
 *       その場合たいてい中国語としても通じるので、通してよい。
 * 落とす: かなを含む(「シャーペン」「けしごむ」)、ラテン文字を含む
 *         (「pencil」「シャーペンpen」)、漢字が1つも無い。
 */
export function isZhHeadword(text: string): boolean {
  const s = core(text ?? "");
  if (!s) return false;
  if (KANA.test(s)) return false;
  if (NON_CJK_LETTER.test(s)) return false;
  return HAN.test(s);
}

/** 学んでいる言語の見出し語として通せるか。いまは台湾華語だけを見る。 */
export function isTargetHeadword(text: string, targetLanguage: string): boolean {
  if (targetLanguage.startsWith("zh")) return isZhHeadword(text);
  // 知らない言語は判定しない。**勝手に落とさない** — 落とすなら根拠が要る。
  return !!core(text ?? "");
}
