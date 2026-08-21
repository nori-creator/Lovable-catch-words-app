/**
 * 学んでいる言語の**決め打ちを1箇所に集める**(指摘⑬ の下ごしらえ)。
 *
 * オーナー: 「英語を学ぶ台湾人向けの版」も作りたい。
 *
 * ## なぜ先に集めるのか
 * `"zh-TW"` という文字列が **42箇所**に直に書かれていた。言語をもう1つ
 * 増やすとき、この42箇所を1つずつ見つけて直すことになる。**見落としても
 * 型でもビルドでも落ちない** — 落ちるのは、英語版の利用者の画面に
 * 台湾華語の声が出たときだけ。
 *
 * ここは**値を変えない**。いまと同じ `"zh-TW"` を返すだけの入れ替えなので、
 * この回では見た目も動きも1つも変わらない。変わるのは「次に言語を足す人が
 * 見る場所が1つになる」こと。
 *
 * ## 役割ごとに分けて持つ — 同じ値でも混ぜない
 * いま `"zh-TW"` が使われている所は、実は**3種類**ある:
 *
 *   1. **学んでいる言語**   … 見出し語・カード生成・辞書の絞り込み
 *   2. **読み上げの言語**   … `SpeechSynthesisUtterance.lang` / TTS
 *   3. **地図の表示言語**   … 地名をどの言語で返してもらうか
 *
 * いまはたまたま3つとも `"zh-TW"` だが、**英語版では全部ばらける**
 * (学ぶ言語 = 英語 / 読み上げ = `en-US` / 地図 = 台湾の人が読む `zh-TW`)。
 * 1つの定数にまとめると、そのとき3つを解きほぐす作業が発生する。
 * 最初から別の名前で持つ。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

/** いま選べる学習言語。増えたらここに足す。 */
export const TARGET_LANGUAGES = ["zh-TW"] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

/** 既定の学習言語。 */
export const DEFAULT_TARGET_LANGUAGE: TargetLanguage = "zh-TW";

/** 知らない値が来たら既定に落とす。**黙って未知の言語で動かさない。** */
export function normalizeTargetLanguage(raw: string | null | undefined): TargetLanguage {
  const v = (raw ?? "").trim();
  return (TARGET_LANGUAGES as readonly string[]).includes(v)
    ? (v as TargetLanguage)
    : DEFAULT_TARGET_LANGUAGE;
}

/**
 * 読み上げに渡す BCP-47 のタグ。
 *
 * 学習言語と**同じとは限らない**。いまは一致しているが、名前を分けておく
 * ことで、英語版を足すときにここだけ見れば済む。
 */
export function speechLangOf(target: string = DEFAULT_TARGET_LANGUAGE): string {
  return normalizeTargetLanguage(target);
}

/**
 * 地図に地名を返してもらう言語。
 *
 * **学習言語ではない。** 台湾で撮った地名は、日本語の学習者にも
 * 台湾の人にも `zh-TW` で返ってくるのが正しい(「Shilin Night Market」より
 * 「士林夜市」のほうが、その場所の名前として通じる)。
 * 学習言語が英語になっても、ここは付いていかない。
 */
export const MAP_DISPLAY_LANGUAGE = "zh-TW";
