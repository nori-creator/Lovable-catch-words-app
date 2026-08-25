/**
 * 学習言語ごとの**違いを1つの表に集める**。
 *
 * オーナー指示 2026-08-24:
 * > 「アプリ内の**すべての項目**について学習言語、英語と台湾華語で変更すべき
 * >  ことを変更して。例えば単語の詳細の項目や解説は英語と台湾華語で違うよね。
 * >  **他にあるはず。**」
 *
 * ## なぜ表にするのか
 * `zh-TW` 前提の決め打ちが**約90ファイル**に散っている。数えたら、
 * 「注音」「量詞」「台湾」「TOCFL」のどれかに触れているファイルがそれだけある。
 * 言語をもう1つ増やすとき、その90箇所を1つずつ見つけて直すことになる。
 * **見落としても型でもビルドでも落ちない** — 落ちるのは、英語版の利用者の
 * 画面に量詞の欄が出たときだけ。
 *
 * `target-lang.ts` で「どの言語か」は1箇所に寄せた。ここはその次の段で、
 * **「その言語では何がどう違うか」**を寄せる。
 *
 * ## 項目を**データ**にする
 * いちばん効くのがこれ。`sections` に並んでいる物だけがカードに出る。
 *
 *   - 量詞(`measure_words`)は英語に**存在しない**
 *   - 活用(`forms`)は中国語に**存在しない**
 *
 * これを「学習言語を直に比べる `if`」で書くと、画面と生成の2箇所に同じ条件が
 * 生えて必ず片方だけ直す(この app が声・写真・演出で繰り返した形)。
 * 並びを1つ置いて、画面も生成もそれを回す。
 *
 * ## この段では見た目を変えない
 * `zh-TW` の値は**いまと1つも変えていない**。英語の定義は書いてあるが、
 * `TARGET_LANGUAGES` にまだ `"en"` が無いので画面には出ない。
 * 検査で同じ絵が出ることが、この段の合格条件。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import { CEFR_SCALE, TOCFL_SCALE, type LevelScale } from "./level-scale";
import { DEFAULT_TARGET_LANGUAGE, normalizeTargetLanguage, speechLangOf } from "./target-lang";

/**
 * カードに並びうる項目。
 *
 * `card-sections.ts` の `SECTION_IDS` は**いま作っている物**の並びで、
 * こちらは**言語ごとに存在しうる物**の全体。英語だけの項目もここに居る。
 */
export type ProfileSection =
  // 両方にある
  | "meaning"
  | "web_images"
  | "usage_context"
  | "encounter"
  | "example"
  | "examples_extra"
  | "usage_chunks"
  | "related_words"
  | "pronunciation_tips"
  | "etymology"
  | "mnemonic"
  | "real_usage"
  // 台湾華語だけ
  | "measure_words"
  | "taiwan_note"
  // 英語だけ
  | "forms"
  | "countability"
  | "stress"
  | "phrasal_verbs"
  | "culture_note";

/** 読みの種類。設定で「どちらか一方だけ」を出す。 */
export type ReadingKind = "zhuyin" | "pinyin" | "ipa-us" | "ipa-uk";

export type TargetProfile = {
  code: string;
  /** 読み上げに渡す BCP-47。**学習言語と同じとは限らない。** */
  speechLang: string;
  /**
   * `lang` 属性に入れる値。
   *
   * 漢字は同じ文字コードでも言語で字形が違う(直/直、每/毎)ので、
   * 繁体字は `zh-Hant` を必ず付ける。英語は付けなくても字形が変わらないので
   * `en` でよい(付けて困ることも無い)。
   */
  scriptLang: string;
  /**
   * 読みの表記。**先頭が既定**。
   * 設定の切替(`phonetic.tsx`)はこの並びから選ぶ。
   */
  readings: readonly ReadingKind[];
  /** その言語のカードに出る項目(上から順)。 */
  sections: readonly ProfileSection[];
  /**
   * **プロンプトの中でこの言語を何と呼ぶか。**
   *
   * 生成の指示文は日本語で書いてあり、その中に
   * 「台湾華語(繁体字)の単語「~」について」と**直に書かれていた**。
   * 英語のカードをそこへ流すと、AI は英語の語を渡されながら
   * 「台湾華語の単語だ」と言われる。呼び名は言語ごとに違うので、
   * 言語の表が持つ。
   *
   * アメリカ英語を既定にする決定(オーナー 2026-08-24)も、
   * ここに書いてあることで生成まで届く。
   */
  promptName: string;
  /** 級の目盛り。 */
  levels: LevelScale;
  /**
   * チャンク(型)の役割の記号。
   * 中国語は量詞(M)と助詞(Ptc)が要るが、英語は冠詞(Det)と前置詞(Prep)が要る。
   */
  chunkRoles: readonly string[];
  /** 見出し語として通してよいか。 */
  headwordOk: (raw: string) => boolean;
};

/**
 * かな(ひらがな・カタカナ)。長音符 ー は含めない — 単体では判定に使えない。
 *
 * **この3つと `core` は `target-language.ts` から動かしてきた物。**
 * あちらに置いたまま同じ判定をここにも書くと、`NON_CJK_LETTER` に
 * キリル文字が入っているのはあちらだけ、という食い違いが生まれる
 * (実際、最初の版のここは `[A-Za-z]` だけだった)。**正は1つ。**
 */
const KANA = /[ぁ-ゟァ-ヺヽヾ]/;
/** 漢字(CJK統合漢字 + 拡張A + 繰り返し記号 々)。 */
const HAN = /[㐀-䶿一-鿿々]/;
/** ラテン文字とキリル文字、ハングル。 */
const NON_CJK_LETTER = /[A-Za-zЀ-ӿ가-힯]/;

/** 見た目だけの飾り(空白・約物・記号)を落とす。 */
export function headwordCore(text: string): string {
  return (text ?? "")
    .replace(/\s+/g, "")
    .replace(/[，、。．・…！？!?,.:;：；「」『』（）()【】〔〕[\]{}"'’”—–\-~〜]/g, "");
}

const core = headwordCore;

/**
 * 台湾華語(繁体字)。
 *
 * **この定義はいまの動きをそのまま写した物。** 1つも変えていない。
 */
export const ZH_TW_PROFILE: TargetProfile = {
  // **決め打ちの文字列をここに書かない。** 学習言語そのものの値は
  // `target-lang.ts` が唯一の正で、そこを見る門が `target-lang.test.ts` に
  // 立っている(実際この門が、最初の版の決め打ちを捕まえた)。
  code: DEFAULT_TARGET_LANGUAGE,
  speechLang: speechLangOf(DEFAULT_TARGET_LANGUAGE),
  scriptLang: "zh-Hant",
  readings: ["zhuyin", "pinyin"],
  sections: [
    "meaning",
    "web_images",
    "usage_context",
    "encounter",
    "example",
    "examples_extra",
    "usage_chunks",
    "measure_words",
    "related_words",
    "pronunciation_tips",
    "etymology",
    "mnemonic",
    "taiwan_note",
    "real_usage",
  ],
  levels: TOCFL_SCALE,
  promptName: "台湾華語(繁体字)",
  // S(主語)/V(動詞)/O(目的語)/M(修飾・量詞)/C(接続・介詞)/Ptc(助詞)
  chunkRoles: ["S", "V", "O", "M", "C", "Ptc"],
  headwordOk: (raw) => {
    const s = core(raw);
    if (!s) return false;
    // かなを含む(「シャーペン」)、欧文を含む(「pencil」)は通さない。
    // 通すと**自分の母語を台湾華語の単語として覚える**ことになる。
    if (KANA.test(s)) return false;
    if (NON_CJK_LETTER.test(s)) return false;
    return HAN.test(s);
  },
};

/**
 * 英語(アメリカ英語を既定)。
 *
 * オーナー決定 2026-08-24: 「**アメリカ英語を既定**」
 * (台湾の学習者の多数派で、TOEFL もアメリカ英語。UK 式は第二の読みとして併記)
 *
 * ## 台湾華語と項目が違う所
 * - `measure_words` **無し** … 英語に量詞は無い
 * - `forms` **有り** … 複数形・過去・過去分詞・比較級。ECDICT の
 *   `exchange` 欄から**AI呼び出しゼロ**で入る
 * - `countability` **有り** … 可算/不可算と冠詞。中国語話者の最大の誤り
 *   (中国語に冠詞が無い)
 * - `stress` **有り** … どの音節を強く読むか。通じるかどうかを最も左右する
 * - `phrasal_verbs` **有り** … 動詞のカードで量詞の枠が空く所に入る
 * - `taiwan_note` → `culture_note` … 米/英の違い(elevator / lift)
 */
export const EN_PROFILE: TargetProfile = {
  code: "en",
  speechLang: "en-US",
  scriptLang: "en",
  readings: ["ipa-us", "ipa-uk"],
  sections: [
    "meaning",
    "web_images",
    "usage_context",
    "encounter",
    "example",
    "examples_extra",
    "usage_chunks",
    "forms",
    "countability",
    "phrasal_verbs",
    "related_words",
    "stress",
    "pronunciation_tips",
    "etymology",
    "mnemonic",
    "culture_note",
    "real_usage",
  ],
  levels: CEFR_SCALE,
  // オーナー決定 2026-08-24「アメリカ英語を既定」。生成にもそう言う。
  promptName: "英語(アメリカ英語)",
  // S/V/O/Adv(副詞)/Prep(前置詞)/Det(冠詞・限定詞)
  chunkRoles: ["S", "V", "O", "Adv", "Prep", "Det"],
  headwordOk: (raw) => {
    const s = core(raw);
    if (!s) return false;
    // 漢字・かなを含む物は英語の見出し語ではない(母語のまま入るのを止める)。
    if (KANA.test(s) || HAN.test(s)) return false;
    // ラテン文字を**含む**ではなく、ラテン文字**だけ**でできていること。
    // 「안녕」も「Привет」も英語の見出し語ではない。飾り(空白・約物・
    // アポストロフィ・ハイフン)は `core` が既に落としているので、
    // "night market" は "nightmarket"、"don't" は "dont" になって通る。
    return /^[A-Za-z]+$/.test(s);
  },
};

const PROFILES: Record<string, TargetProfile> = {
  [ZH_TW_PROFILE.code]: ZH_TW_PROFILE,
  [EN_PROFILE.code]: EN_PROFILE,
};

/**
 * その学習言語のプロフィール。
 *
 * **知らない値は既定に落とす。** 未知の言語のまま動かすと、項目が1つも
 * 無いカードや、読み上げの言語が空のまま喋る画面ができる。
 */
export function targetProfile(code: string | null | undefined): TargetProfile {
  const normalized = normalizeTargetLanguage(code);
  return PROFILES[normalized] ?? PROFILES[DEFAULT_TARGET_LANGUAGE] ?? ZH_TW_PROFILE;
}

/**
 * その項目はこの言語のカードに出るか。
 *
 * **学習言語を直に比べる `if` を書かないための口。** 条件を画面と生成の
 * 2箇所に書くと、必ず片方だけ直して食い違う。
 */
export function hasSection(profile: TargetProfile, section: ProfileSection): boolean {
  return profile.sections.includes(section);
}

/** その言語で使う読みの既定(設定がまだ無いとき)。 */
export function defaultReading(profile: TargetProfile): ReadingKind {
  return profile.readings[0];
}
