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

  /**
   * **撮った写真から語を出すとき**の、その言語ならではの指示。
   *
   * ## なぜ表にするか
   * `ai.functions.ts` のプロンプトは
   * `data.targetLanguage === DEFAULT_TARGET_LANGUAGE ? 長い指示 : 1行`
   * という**2分岐**になっていた。台湾華語には40行の細かい指示（カテゴリの
   * 規則・「上位の分類語に逃げない」・使い分けを書く条件）が在るのに、
   * それ以外は「有用な名詞を5つ選んでください」の1行に落ちる。
   *
   * 撮る道を学習言語に繋いだ日(2026-08-25)から、英語の学習者が**実際に
   * その1行に当たる**。カテゴリは other だらけになり、`en` という
   * コードがそのままプロンプトに出る。
   *
   * カテゴリの規則も「写っている物そのものの名前を出す」も、
   * **写真の話であって言語の話ではない**ので両方に効く。
   * 言語で変わるのはここに並ぶ物だけ。
   */
  capture: {
    /** 字・綴りの決めごと。 */
    scriptRule: string;
    /** 級ごとの「どこまで細かい名前で呼ぶか」の例（易→難の3段）。 */
    specificity: readonly [string, string, string];
    /** 使い分けを書くべき語の例（母語では1語なのに分かれる物）。 */
    distinctionExamples: string;
    /** 品詞の書き方。 */
    posRule: string;
    /**
     * AI を待たずに札を置くときの**仮の品詞**。
     *
     * ここを `"名詞"` で決め打ちしていたので、英語を学ぶ人の札にも
     * 日本語の「名詞」が入って保存されていた(オーナー報告
     * 「項目に英語日本語台湾華語が混ざる」)。`posRule` が AI に出させる
     * 記号と**同じ体系**の値を置く — 後から本物のカードが上書きしても
     * 記号がちぐはぐにならない。
     */
    defaultPos: string;
    /** 一句(フレーズ)として保存するときの品詞。 */
    phrasePos: string;
    /**
     * JSON の見本に書く**見出し語の値の見本**。
     *
     * 指示の本文を言語ごとに直しても、**最後に貼る JSON の見本が
     * `"headword":"繁体字"` のまま**だと、AI はそちらに従う —
     * 見本は指示より強い。英語を選んでいるのに台湾華語の語しか
     * 出てこなかった原因の1つ(オーナー報告①)。
     */
    jsonHeadwordHint: string;
    /** JSON の見本に書く読みの欄の値の見本。英語には注音も拼音も無い。 */
    jsonReadingHint: string;
    /**
     * 「写っている物そのものの名前を出す」の**具体例**。
     * 料理名・服の形の名前を、その言語の実際の語で並べる。
     */
    namingExamples: string;
    /** 読みの欄の指示（注音・拼音 / 米式・英式の IPA）。 */
    readingRule: string;
    /**
     * 語源の書き方。**言語ごとに見る物が違う。**
     *
     * ここを分けていなかったので、英語のカードにも
     * 「漢字の語源・成り立ち」「部首と意味」を作らせていた
     * (オーナー指示「英単語の由来 — 古代・他言語からの派生、
     * **接頭語・接尾語** — を解説して」)。
     */
    etymologyRule: string;
    /**
     * 同じ語根・接頭辞・接尾辞を持つ仲間の語をどう出すか。
     * **空文字なら作らせない**(学習言語が英語のときだけ、というオーナー指示)。
     */
    relativesRule: string;
    /**
     * 語源に添える2行目(華語は部首)。**英語には無い**ので空にさせる。
     * 欄そのものは残す — 古い台湾華語の語が既に持っている。
     */
    radicalsRule: string;
    /**
     * その言語の「一言メモ」の項目名。
     *
     * 台湾華語は `taiwan_note`(台湾ならではの雑学)、英語は `culture_note`。
     * **生成の側もここを見る** — 前は生成の指示に `taiwan_note` が直に
     * 書いてあったので、英語のカードには**台湾の雑学を書けと言いながら
     * `culture_note` は一度も埋まらない**という形になっていた。
     */
    noteField: "taiwan_note" | "culture_note";
    /**
     * 4択の**受け皿の見出し語**。撮った語がまだ少ない人のための埋め草。
     *
     * オーナー報告 2026-08-26:
     * > 「復習の4択が学習言語英語なのに台湾華語の単語が混ざってる」
     *
     * ここは `quiz-choices.ts` に台湾の語で直書きされていた。英語を
     * 学んでいる人の4択に**中国語が3つ並ぶ**のはこれが最後の出どころ。
     * 誤答があからさまに場違いだと消去法で当てられてしまうので、
     * **その言語で日常的に見る語**を選ぶ。
     */
    quizFallbackHeadwords: readonly string[];
    /** 受け皿の語の読み(4択に注音/IPA を出すため)。 */
    quizFallbackReadings: Readonly<Record<string, { zhuyin: string; pinyin: string }>>;
    /** その一言メモに何を書くか。 */
    noteRule: string;
    /**
     * 部首の行を**画面に出してよい言語か**。
     *
     * 指示で空にさせても、古いデータや AI の勇み足で中身が入ることは在る。
     * 「指示」と「描いてよいか」は別の話なので、真偽値で別に持つ。
     */
    hasRadicals: boolean;
    /**
     * 発音のコツで**その言語のどこを見るか**。
     * 華語は声調、英語は強勢。**混ぜると意味が無い** —
     * 英語に「声調の型」と言っても書けることが無い。
     */
    pronunciationFocus: string;
  };
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
  capture: {
    scriptRule: "台湾教育部準拠の正式な繁体字（中国大陸の簡体字は不可）",
    specificity: [
      "**日常でその物を指すときの普通の名前**で呼ぶ(例: 「短袖」より「T恤」、「三杯雞」はそのまま「三杯雞」)。",
      "**店や献立で実際に使われる名前**まで細かく(例: 服なら「短袖」「洋裝」、料理なら「三杯雞」「滷肉飯」)。",
      "**その道の人が使う正確な名前**まで細かく(例: 「純棉短袖」「客家小炒」)。一般名詞は既に知っている。",
    ],
    distinctionExamples:
      "衛生紙→「トイレに置く方」/ 面紙→「持ち歩く箱・ポケット」、" +
      "湯→「スープ(お湯ではない)」のように、母語からの連想を外す必要があるとき",
    defaultPos: "N",
    phrasePos: "片語",
    jsonHeadwordHint: "繁体字",
    jsonReadingHint: '"reading_zhuyin":"注音","pinyin":"拼音"',
    namingExamples:
      "料理なら料理名（三杯雞・滷肉飯・珍珠奶茶）であって、材料名（雞肉・米）ではない。\n" +
      "  服なら形の名前（短袖・洋裝・外套）であって、上位の分類（衣服・服裝）ではない。\n" +
      "- **上位の分類語に逃げない。** 「衣服」「食物」「飲料」「動物」は、\n" +
      "  それ以上細かく呼べない写真のときだけ。",
    posRule:
      "台湾の詞類表の記号で: N/V/Vi/V-sep/Vs/Vst/Vs-attr/Vs-pred/Vs-sep/Vaux/Vp/Vpt/Vp-sep/Adv/Conj/Prep/M/Ptc/Det のどれか。\n" +
      "  V=及物動作動詞(買/做)、Vi=不及物(跑/坐)、Vs=状態動詞・形容詞(冷/漂亮)、Vst=及物状態(喜歡)、Vaux=助動詞(會/能)、Vp=変化動詞(破/感冒)、M=量詞、Ptc=助詞。",
    readingRule: "- reading_zhuyin: 注音（ㄅㄆㄇ）。台湾教育部準拠。\n- pinyin: 拼音",
    etymologyRule: "漢字の語源・成り立ち(1〜2文)",
    /**
     * **仲間の語はどの学習言語でも出す**(オーナー指示 2026-08-26
     * 「やっぱり全ての学習言語で語源の項目の欄で、同じ語源や由来がある
     * 関連単語は表示して」)。英語だけなのは**接頭辞・接尾辞の分解**のほう。
     *
     * 華語で「同じ由来」がいちばん役に立つのは**同じ字(語素)を共有する語**。
     * 「電」を覚えれば電腦・電視・停電がまとめて読めるようになる。
     */
    relativesRule:
      "同じ字(語素)を共有する**仲間の語を2〜4語**。\n" +
      "  各 {word, note}。note はその字がその語で持つ意味を**5〜12字**で。\n" +
      "  例: 電話 なら 電腦(電で動く機械) / 電視(電で見る) / 停電(電が止まる)。\n" +
      "  **その字が本当に同じ意味で働いているときだけ**並べる。\n" +
      "  たまたま同じ字が入っているだけの語は入れない — 覚え違いの種になる。\n" +
      "  仲間が無ければ**空配列**。無理に埋めない。",
    radicalsRule: "部首と意味(1文)",
    noteField: "taiwan_note",
    quizFallbackHeadwords: ["蘋果", "公車", "雨傘", "便當"],
    quizFallbackReadings: {
      蘋果: { zhuyin: "ㄆㄧㄥˊ ㄍㄨㄛˇ", pinyin: "píngguǒ" },
      公車: { zhuyin: "ㄍㄨㄥ ㄔㄜ", pinyin: "gōngchē" },
      雨傘: { zhuyin: "ㄩˇ ㄙㄢˇ", pinyin: "yǔsǎn" },
      便當: { zhuyin: "ㄅㄧㄢˋ ㄉㄤ", pinyin: "biàndāng" },
    },
    noteRule:
      "台湾ならではの一言雑学（文化・習慣・歴史・流行）を1〜2文。" +
      "誤用しやすい語法の注意があれば1文追加",
    hasRadicals: true,
    pronunciationFocus: "この語の声調の型",
  },
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
  capture: {
    scriptRule: "アメリカ英語の綴り（color / center。イギリス式の綴りは使わない）",
    specificity: [
      "**日常でその物を指すときの普通の名前**で呼ぶ(例: 「garment」より「T-shirt」、「beverage」より「coffee」)。",
      "**店や献立で実際に使われる名前**まで細かく(例: 服なら「hoodie」「blazer」、料理なら「fried rice」「clam chowder」)。",
      "**その道の人が使う正確な名前**まで細かく(例: 「raglan sleeve」「cold brew」)。一般名詞は既に知っている。",
    ],
    distinctionExamples:
      "shrimp→「小ぶり・アメリカでの普通の言い方」/ prawn→「大ぶり・英豪でよく使う」、" +
      "napkin→「食事のときの紙・布」/ tissue→「鼻をかむ方」のように、母語からの連想を外す必要があるとき",
    defaultPos: "noun",
    phrasePos: "phrase",
    jsonHeadwordHint: "English word",
    // 英語に注音・拼音は無い。**空文字を見本に置く** — ここに
    // `"注音"` と書いてあると、AI は何かを埋めようとして
    // ローマ字や IPA を注音の欄に入れてくる。
    jsonReadingHint: '"reading_zhuyin":"","pinyin":""',
    namingExamples:
      "料理なら料理名（beef noodle soup・bubble tea・eggs benedict）であって、材料名（beef・rice）ではない。\n" +
      "  服なら形の名前（hoodie・blazer・cardigan）であって、上位の分類（clothes・clothing）ではない。\n" +
      "- **上位の分類語に逃げない。** 「clothes」「food」「drink」「animal」は、\n" +
      "  それ以上細かく呼べない写真のときだけ。",
    posRule:
      "英語の品詞で: noun/verb/adjective/adverb/preposition/conjunction/pronoun/determiner/interjection のどれか。\n" +
      "  句動詞は verb、複合名詞は noun。",
    readingRule:
      "- reading_zhuyin: **空文字**（英語に注音は無い）\n" +
      "- pinyin: **空文字**（英語に拼音は無い）\n" +
      "- ipa_us: アメリカ英語の IPA（強勢記号 ˈ ˌ を必ず付ける。例: ʌmˈbrɛlə）\n" +
      "- ipa_uk: イギリス英語の IPA（違いが無ければアメリカ式と同じで良い）",
    etymologyRule:
      "語の由来(1〜2文)。ラテン語・ギリシャ語・古英語などの**出どころ**を書く。\n" +
      "  そのうえで**接頭辞・接尾辞・語根に分解**し、その部品が持つ意味を書く。\n" +
      "  例: re-(再び) + ject(投げる) → reject / bio-(生命) + -logy(学問) → biology。\n" +
      "  分解できない語(get, dog など)は無理に分けず、出どころだけを書く。",
    /**
     * **仲間の語**(オーナー指示「同じ語源や接頭辞、接尾辞を持つ関連語、
     * 派生語があれば紹介して」)。語根を1つ覚えると芋づるで増えるのが
     * 英語の語彙の性質なので、ここがいちばん効く。
     */
    relativesRule:
      "同じ語根・接頭辞・接尾辞を持つ**仲間の語を2〜4語**。\n" +
      "  各 {word, note}。note はその部品が何を意味するかを**5〜12字**で。\n" +
      "  例: reject なら inject(中へ投げる) / eject(外へ投げる) / project(前へ投げる)。\n" +
      "  **共通の部品が本当に同じ意味のときだけ**並べる。綴りが似ているだけの語\n" +
      "  (understand と stand など)は入れない — 覚え違いの種になる。\n" +
      "  仲間が無ければ**空配列**。無理に埋めない。",
    // 英語に部首は無い。**空にさせる** — 何か書けと言うと、AI は
    // 綴りの一部を「部首」と呼び始める。
    radicalsRule: "**空文字**(英語に部首は無い)",
    /**
     * オーナー指示 2026-08-26:
     * > 「台湾人が学習言語英語で勉強する時、単語の項目の台湾ノートは
     * >  要らない。そのかわりひと言単語に関する雑学や知識やを
     * >  コメントをかいて」
     *
     * 台湾の話ではなく、**その語そのものの雑学**を書く場所にする。
     */
    noteField: "culture_note",
    // 街で日常的に見る語。読みはアメリカ英語の IPA(既定の読み)。
    quizFallbackHeadwords: ["apple", "bus", "umbrella", "lunch box"],
    quizFallbackReadings: {
      apple: { zhuyin: "ˈæpəl", pinyin: "ˈæpl" },
      bus: { zhuyin: "bʌs", pinyin: "bʌs" },
      umbrella: { zhuyin: "ʌmˈbrelə", pinyin: "ʌmˈbrelə" },
      "lunch box": { zhuyin: "ˈlʌntʃ bɑks", pinyin: "ˈlʌntʃ bɒks" },
    },
    noteRule:
      "その語にまつわる**一言雑学**を1〜2文。" +
      "語源の面白い由来・商標や作品での使われ方・その語から来た言い回し・" +
      "英語圏の習慣など、**読んで記憶に引っかかること**を選ぶ。" +
      "米国と英国で言い方が違う語(elevator / lift)なら、その違いを1文足す。" +
      "**台湾の話は書かない**",
    hasRadicals: false,
    pronunciationFocus: "この語のどの音節を強く読むか",
  },
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
