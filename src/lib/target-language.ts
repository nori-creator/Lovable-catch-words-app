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

/**
 * ## 2026-08-24: 判定そのものは `target-profile.ts` に移した
 * 言語ごとの違いを1つの表に集めたので、**文字の規則もその表が持つ**。
 * ここに同じ正規表現を残すと、英語版を足したときに片方だけ直る
 * (この app が声・写真・演出で繰り返した形)。ここは呼ぶ側のための口。
 */

import { EN_PROFILE, ZH_TW_PROFILE, headwordCore, targetProfile } from "./target-profile";
import { TARGET_LANGUAGES } from "./target-lang";

/**
 * 台湾華語の見出し語として通せるか。
 *
 * 通す: 漢字だけ(「文旦」「橡皮擦」)。日本語の漢字語と見分けは付かないが、
 *       その場合たいてい中国語としても通じるので、通してよい。
 * 落とす: かなを含む(「シャーペン」「けしごむ」)、欧文・キリル文字・
 *         ハングルを含む(「pencil」「シャーペンpen」)、漢字が1つも無い。
 */
export function isZhHeadword(text: string): boolean {
  return ZH_TW_PROFILE.headwordOk(text);
}

/** 英語の見出し語として通せるか。 */
export function isEnHeadword(text: string): boolean {
  return EN_PROFILE.headwordOk(text);
}

/**
 * 学んでいる言語の見出し語として通せるか。
 *
 * **知らない言語は判定しない。** ここで `targetProfile` の既定
 * (台湾華語)に落とすと、ドイツ語を学ぶ設定の人の "Bleistift" が
 * 「漢字が無い」という理由で静かに消える。落とすなら根拠が要る。
 */
export function isTargetHeadword(text: string, targetLanguage: string): boolean {
  // 中国語系はどれも繁体字の規則で見る(簡体字で入れた人も通す)。
  if (targetLanguage.startsWith("zh")) return isZhHeadword(text);
  if ((TARGET_LANGUAGES as readonly string[]).includes(targetLanguage)) {
    return targetProfile(targetLanguage).headwordOk(text);
  }
  return !!headwordCore(text ?? "");
}

/**
 * 生成が返した見出し語を、**捨てる前に一度だけ直す。**
 *
 * ## なぜ要るか（オーナー報告 2026-09-22「カメラの検索で日本語での検索ができない」）
 * 母語で打った語は AI が学習言語の見出し語に直して返す。その候補は
 * `isTargetHeadword` を通らなければ捨てられる — **捨てられた数がゼロに
 * なると、画面には「単語が見つかりませんでした」とだけ出る。**
 * 打った人からは、探しに行ったことすら分からない。
 *
 * ところが生成は、頼んでいなくても注釈を足してくることがある:
 *
 *   「烤肉 (BBQ)」「燒肉（日式）」「滷肉飯 lǔ ròu fàn」
 *
 * 括弧は `headwordCore` が落とすので「燒肉（日式）」は通るが、
 * **ラテン文字が1つでも混ざった瞬間に丸ごと落ちる**。中身は正しいのに、
 * 付け足しのせいで「そんな語は無い」と言うことになる。
 *
 * ここでは**先頭から続く、その言語の見出し語として通る一番長い部分**を
 * 取り出す。取れなければ `null` — 直せない物を無理に通すと、今度は
 * 母語がそのまま見出しになる元の不具合に戻る。
 *
 * 「シャーペン」のようにかなだけの物は、どこを切っても通らないので
 * `null` のまま落ちる（**そこは緩めない**）。
 */
export function coerceTargetHeadword(raw: string, targetLanguage: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (isTargetHeadword(text, targetLanguage)) return text;
  // 先頭から1文字ずつ伸ばし、**通った中でいちばん長い所**を憶えておく。
  // 前から切るのは、注釈がたいてい後ろに付くから（「烤肉 (BBQ)」）。
  let best: string | null = null;
  for (let i = 1; i <= text.length; i++) {
    const head = text.slice(0, i).trim();
    if (head && isTargetHeadword(head, targetLanguage)) best = head;
  }
  if (best === null) return null;
  // 切った所に飾りが残る（「烤肉 (」）。`headwordCore` はこれを落として
  // 判定するので**通ってしまう**が、そのまま保存すると図鑑に飾りが残る。
  // 落ちる文字なら、落としてから返す。
  const trimmed = best.replace(
    /[\s，、。．・…！？!?,.:;：；「」『』（）()【】〔〕[\]{}"'’”—–\-~〜]+$/u,
    "",
  );
  return trimmed && isTargetHeadword(trimmed, targetLanguage) ? trimmed : best;
}
