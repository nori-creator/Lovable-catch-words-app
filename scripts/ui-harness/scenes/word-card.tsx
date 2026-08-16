/**
 * 単語カードの場面。**本物の `WordCard` を描く。**
 *
 * ここは節ごとの淡い色が 13 種類ずつ直書きされている所で、
 * 「暗いテーマに追従しないと分かっているが、直す前に場面を足す」と
 * 決めてあった箇所。まず見えるようにする。
 */
import { WordCard } from "@/components/WordCard";
import { emptyExtras } from "@/lib/extras";

/** 中身が一通り埋まった語。節を一度に全部出すため、なるべく多くを埋める。 */
const FULL = {
  headword: "珍珠奶茶",
  reading_zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
  pinyin: "zhēn zhū nǎi chá",
  meaning_ja: "タピオカミルクティー",
  part_of_speech: "名詞",
  level: "TOCFL-2",
  example_sentence: "我想喝一杯珍珠奶茶。",
  example_translation: "タピオカミルクティーを一杯飲みたい。",
  extras: {
    ...emptyExtras(),
    usage_context: "夜市でも店でも毎日使う。口語でも書面でも同じ形で通じる。",
    frequency_level: 5,
    register_tag: "口語",
    example_chunks: [
      { text: "我", pos: "S" },
      { text: "想喝", pos: "V" },
      { text: "一杯珍珠奶茶", pos: "O" },
    ],
    usage_chunks: [
      {
        parts: [
          { text: "喝", pos: "V" },
          { text: "珍珠奶茶", pos: "O" },
        ],
        ja: "タピオカミルクティーを飲む",
      },
      {
        parts: [
          { text: "點", pos: "V" },
          { text: "一杯", pos: "O" },
        ],
        ja: "一杯注文する",
      },
    ],
    examples_extra: [
      {
        zh: "老闆，珍珠奶茶半糖少冰。",
        ja: "すみません、タピオカミルクティーを甘さ半分・氷少なめで。",
        scene: "夜市の屋台で注文するとき",
        chunks: [
          { text: "半糖", pos: "M" },
          { text: "少冰", pos: "M" },
        ],
      },
    ],
    measure_words: [{ word: "杯", zhuyin: "ㄅㄟ", pinyin: "bēi", note: "飲み物を数えるとき" }],
    related_words: [
      { word: "奶茶", kind: "rel" as const, note: "タピオカ無しのミルクティー" },
      { word: "手搖飲", kind: "rel" as const, note: "その場で作る飲み物の総称" },
    ],
    pronunciation_tips: "「珍」は一声。日本語の「ちん」より息を強く前に出す。",
    etymology: "「珍珠」= 真珠。丸いタピオカを真珠に見立てた呼び名。",
    radicals: "珍(王+㐱)、珠(王+朱)",
    mnemonic: "真珠が沈んだお茶、と覚える。",
    taiwan_note: "台湾では甘さと氷の量を必ず聞かれる。半糖・少冰が定番。",
    trivia: "1980年代の台中発祥という説が有力。",
  },
};

/** 全部の節が埋まったカード。**節ごとの色が13種類並ぶ所。** */
export function WordCardScene() {
  return <WordCard word={FULL} autoplay={false} />;
}

/**
 * まだ生成されていない節がある状態。
 * 空の節も枠は出す作りなので、**枠だけが13個並ぶ**面になる。
 */
export function WordCardEmptyScene() {
  return (
    <WordCard
      word={{
        headword: "腳踏車",
        reading_zhuyin: "ㄐㄧㄠˇ ㄊㄚˋ ㄔㄜ",
        pinyin: "jiǎo tà chē",
        meaning_ja: "自転車",
        part_of_speech: "名詞",
        extras: null,
      }}
      autoplay={false}
      wordId="w1"
    />
  );
}

// ネットの画像の節は**自分で取りに行く**(extras には入っていない)。
// ハーネスでは通信が返ってこないので、上の2つの場面の中で
// 「読み込み中の節」として写る。それも見たい面なので、別の場面は作らない。
