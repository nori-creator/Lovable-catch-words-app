/**
 * 解説が**学ぶ言語のほうで書かれて返ってきた**ときに落とす。
 *
 * オーナー報告 2026-08-21: 「量詞の説明が台湾華語になってる。」
 *
 * ## なぜ指示だけでは足りないのか
 * プロンプトには「解説・意味・訳・注記はすべて日本語で書く」と入れてある。
 * それでもモデルは、**中国語の語のすぐ隣にある短い注記**を中国語で返す
 * ことがある。指示は確率を下げるだけで、0 にはしない。この app は
 * 「書いてあることと返ってくる物は別」を何度も踏んでいる
 * (`scan.functions.ts` の品詞の絞り込みが同じ形)。
 *
 * ## 読めない注記より、無いほうがまし
 * 学習者が読めない言語の注記は、**画面を埋めるだけで1文字も助けない**。
 * しかも「解説は母語で」という約束が破れていること自体に気づきにくい。
 * 落として空にすれば、裏の生成がもう一度作り直す機会も残る。
 *
 * ## 短い語は落とさない
 * 日本語の注記でも「書類用」のように**かなが1文字も無い**ことはある。
 * 短いものまで落とすと、正しい注記が消える。長さの下限を置いて、
 * 「まとまった文が漢字だけで書かれている」ときにだけ落とす。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

/** かな。1文字でもあれば日本語。 */
const KANA = /[ぁ-ゟァ-ヺ]/;
/** ラテン文字・キリル文字・ハングル。 */
const NON_CJK_LETTER = /[A-Za-zЀ-ӿ가-힯]/;
/** 漢字。 */
const HAN = /[㐀-䶿一-鿿々]/;

/** これ以下の長さなら落とさない(「書類用」のような短い和文を守る)。 */
export const MIN_SUSPECT_CHARS = 5;

function core(text: string): string {
  return (text ?? "").replace(/\s+/g, "");
}

/**
 * その文字列は「解説の言語ではなく、学ぶ言語で書かれている」ように見えるか。
 *
 * いまは解説が日本語のときだけ判定する。英語の解説はラテン文字なので、
 * 中国語との取り違えようがない(判定の必要が無い)。
 */
export function looksLikeTargetNote(text: string | null | undefined, explanationLang: string) {
  if (explanationLang !== "ja") return false;
  const s = core(text ?? "");
  if (s.length < MIN_SUSPECT_CHARS) return false;
  if (KANA.test(s)) return false; // かながあれば日本語
  if (NON_CJK_LETTER.test(s)) return false; // 欧文が混じるなら判定しない
  return HAN.test(s); // 漢字だけのまとまった文 = 中国語とみなす
}

/** 学ぶ言語で書かれていた注記を空にする。**書き換えず、落とすだけ。** */
export function dropForeignNote(text: string | null | undefined, explanationLang: string): string {
  return looksLikeTargetNote(text, explanationLang) ? "" : (text ?? "");
}

/**
 * カードの中で「学ぶ言語で返ってきがちな注記」をまとめて落とす。
 *
 * **1箇所にまとめる理由**: 生成と作り直しの2経路があり、片方だけ直すと
 * もう片方から中国語の注記が入り続ける。この app が声・写真・演出で
 * 繰り返した「兄弟の取りこぼし」をここで先に潰しておく。
 *
 * 対象は「中国語の語のすぐ隣に置かれる短い注記」— そこだけがモデルの
 * つられやすい場所。意味・例文の訳のような長い文は対象にしない
 * (長い和文にかなが1文字も無いことは無いので、そもそも引っかからない)。
 */
export type NoteBearingExtras = {
  measure_words?: Array<{ note?: string }> | null;
  related_words?: Array<{ note?: string }> | null;
  usage_chunks?: Array<{ ja?: string }> | null;
};

export function scrubForeignNotes<T extends NoteBearingExtras>(
  extras: T,
  explanationLang: string,
): T {
  if (explanationLang !== "ja" || !extras || typeof extras !== "object") return extras;
  const out = { ...extras };
  if (Array.isArray(out.measure_words)) {
    out.measure_words = out.measure_words.map((m) =>
      m && looksLikeTargetNote(m.note, explanationLang) ? { ...m, note: "" } : m,
    );
  }
  if (Array.isArray(out.related_words)) {
    out.related_words = out.related_words.map((r) =>
      r && looksLikeTargetNote(r.note, explanationLang) ? { ...r, note: "" } : r,
    );
  }
  if (Array.isArray(out.usage_chunks)) {
    out.usage_chunks = out.usage_chunks.map((c) =>
      c && looksLikeTargetNote(c.ja, explanationLang) ? { ...c, ja: "" } : c,
    );
  }
  return out;
}
