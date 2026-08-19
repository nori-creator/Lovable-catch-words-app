/**
 * 単語カードの場面。**本物の `WordCard` を描く。**
 *
 * ここは節ごとの淡い色が 13 種類ずつ直書きされている所で、
 * 「暗いテーマに追従しないと分かっているが、直す前に場面を足す」と
 * 決めてあった箇所。まず見えるようにする。
 */
import { WordCard } from "@/components/WordCard";
import { StickerDetailHero } from "@/routes/_authenticated/dex.$stickerId";
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
    // 一目で分かる要点の表。**片側だけの行と長すぎる行も混ぜる** —
    // 生成物は必ずそれを出すので、落ちていることを絵で確かめる。
    quick_facts: [
      { label: "使う場面", value: "店で注文するとき" },
      { label: "丁寧さ", value: "ふつう" },
      { label: "よく一緒に", value: "一杯・大杯・半糖" },
      { label: "注意", value: "「奶茶」だけだとタピオカ無し" },
      { label: "言い換え", value: "" },
      { label: "", value: "見出しが無い行" },
      {
        label: "長い",
        value:
          "これは表の中身としては長すぎるので落とされるはずの一行です。40字を超えると表から外れます",
      },
    ],
    // **実物に近い長さで置く。** 短い1文だけを入れていたので、
    // 「4文つながった和文が壁になる」という実際の見え方が撮れていなかった
    // (オーナーのスクリーンショットの「発音のコツ」はこの長さ)。
    pronunciation_tips:
      "「珍珠奶茶」の「珍(zhēn)」は一声で、平らに高く保ちます。" +
      "日本語の「ちん」より息を強く前に出してください。" +
      "「奶(nǎi)」は三声なので、一度下げてから軽く上げます。" +
      "つなげて言うときは「奶」を下げきらないほうが自然に聞こえます。",
    etymology: "「珍珠」= 真珠。丸いタピオカを真珠に見立てた呼び名。",
    radicals: "珍(王+㐱)、珠(王+朱)",
    mnemonic: "真珠が沈んだお茶、と覚える。",
    taiwan_note:
      "台湾では注文のときに甘さと氷の量を必ず聞かれます。" +
      "甘さは「半糖(bàntáng)」、氷は「少冰(shǎobīng)」が定番の頼み方です。" +
      "店によっては「微糖」「去冰」も選べます。",
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

/**
 * 語の詳細の**既定の見え方**。
 *
 * これまで撮っていたのは `WordCard` を裸で描いた絵だったが、実物では
 * それは `<details>`「すべて見る」の中で閉じている。つまり
 * **この画面は一度も機械の目に映っていなかった**。
 * 独立監査3体はここを「一番長く見られる画面」として採点していたので、
 * 採点の前提そのものが実物と違っていた。
 */
export function StickerDetailScene() {
  const shot = (w: number, h: number, c: string) =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`,
    );
  return (
    <StickerDetailHero
      dateLocale="ja-JP"
      sticker={
        {
          id: "s1",
          word_id: "w1",
          created_at: "2026-08-01T12:30:00Z",
          taken_at: "2026-08-01T12:30:00Z",
          caption: "士林夜市で並んでいるときに",
          location_name: "士林夜市",
          lat: 25.088,
          lng: 121.524,
          object_url: shot(600, 600, "#b07a4a"),
          cutout_url: null,
          selfie_url: shot(600, 600, "#4a90d9"),
          placeholder_url: null,
          placeholder_credit: null,
          branch_plan: null,
          review_count: 2,
          word: FULL,
        } as never
      }
    />
  );
}
