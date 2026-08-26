import { TARGET_LANGUAGES, normalizeTargetLanguage } from "./target-lang";
import { isTargetHeadword } from "./target-language";

/**
 * **その語が本当は何語なのかを、見出し語の文字から正す。**
 *
 * オーナー報告 2026-08-26(絵つき):
 * > 「英単語なのに TOCFL のレベルが表示される」
 * > 「学習言語や表示言語を切り替えたときに…混ざる。lamp を撮ったら
 * >  こうなった。あとから直ったけど、切り替えたときは混ざる」
 *
 * 撮った絵では `lamp` に **TOCFL 1級・量詞・台灣筆記**が並んでいた。
 * どれも「その語は台湾華語だ」という前提から出てくるもので、原因は1つ
 * — `words.language` に `zh-TW` が入って保存されていたこと。
 * 学習言語の写しが既定へ戻る隙間(設定の画面。同じ日に直した)に撮ると、
 * **英語の語が台湾華語の行として作られる**。
 *
 * ## なぜ画面の側でも正すのか
 * オーナーは Supabase に直接触れないので、**既に保存された行を書き直す
 * 手立てが無い**。行が直るのを待つあいだ、`lamp` はずっと
 * 「TOCFL 1級の中国語」として出続ける。
 *
 * ## これは当て推量ではない
 * 台湾華語の見出し語は**漢字を含むこと**が条件(`isZhHeadword`)。
 * `lamp` はその条件を満たさない。「頻度から級を見積もる」ような推し量りとは
 * 違って、ここは**その言語の規則が明確に否と言っている**場合だけ動く。
 *
 *  - 保存された言語で通る語 … そのまま(**触らない**)
 *  - 保存された言語では通らず、他の1つだけで通る語 … そちらに正す
 *  - どれでも通る / どれでも通らない語 … そのまま(決め手が無い)
 *
 * 最後の行が大事で、**迷ったら動かさない**。数字や記号だけの語、
 * 両方の言語で在り得る語を勝手に付け替えると、直すつもりで壊す。
 */
export function resolveWordLanguage(
  storedLanguage: string | null | undefined,
  headword: string | null | undefined,
): string {
  const stored = normalizeTargetLanguage(storedLanguage);
  const word = (headword ?? "").trim();
  if (!word) return stored;
  // 保存されている言語で通るなら、それが正しい。**触らない。**
  if (isTargetHeadword(word, stored)) return stored;

  const fits = TARGET_LANGUAGES.filter((l) => l !== stored && isTargetHeadword(word, l));
  // 決め手が1つのときだけ正す。2つ以上通るなら根拠にならない。
  return fits.length === 1 ? fits[0] : stored;
}
