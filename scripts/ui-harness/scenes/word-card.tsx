/**
 * 単語カードの場面。**本物の `WordCard` を描く。**
 *
 * ここは節ごとの淡い色が 13 種類ずつ直書きされている所で、
 * 「暗いテーマに追従しないと分かっているが、直す前に場面を足す」と
 * 決めてあった箇所。まず見えるようにする。
 */
import { readySpeech } from "../speech";

/**
 * 発音ボタンは**鳴らせるようになってから**出る(オーナー指示 2026-08-26)。
 * 足場にはサーバが無いので、ここで支度が済んだことにしないと
 * ボタンが1つも撮られない — 指の大きさも暗いテーマの見え方も
 * 機械の目から丸ごと消える。
 */
readySpeech(["珍珠奶茶", "腳踏車", "一杯", "一張", "奶茶", "飲料"]);
readySpeech(["umbrella", "bicycle"], "en");
import { WordCard, WordCardSectionsEditor } from "@/components/WordCard";
import { TocflLadder } from "@/components/TocflLadder";
import { CEFR_SCALE, TOCFL_SCALE } from "@/lib/level-scale";
import {
  BackToDexLink,
  StickerDetailBody,
  StickerDetailHero,
} from "@/routes/_authenticated/dex.$stickerId";
import { emptyExtras } from "@/lib/extras";

/**
 * 中身が一通り埋まった語。節を一度に全部出すため、なるべく多くを埋める。
 *
 * **外に出しているのは、2つ目を書かせないため。** スキャンの詳細でも
 * 同じ語を描くので、そちらで別の見本を書くと片方だけ古くなる
 * (設定の場面で実際にそれをやって、実在しない文言を撮り続けた)。
 */
export const FULL = {
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
    // 目盛りも入れて、**実物のカードの中**でメーターを測る。
    // 部品だけを並べた絵は、その画面の絵ではない。
    register_scale: -1,
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
    // **実物に近い長さで置く。** 短い1文だけを入れていたので、
    // 「4文つながった和文が壁になる」という実際の見え方が撮れていなかった
    // (オーナーのスクリーンショットの「発音のコツ」はこの長さ)。
    pronunciation_tips:
      "「珍珠奶茶」の「珍(zhēn)」は一声で、平らに高く保ちます。" +
      "日本語の「ちん」より息を強く前に出してください。" +
      "「奶(nǎi)」は三声なので、一度下げてから軽く上げます。" +
      "つなげて言うときは「奶」を下げきらないほうが自然に聞こえます。",
    etymology: "「珍珠」= 真珠。丸いタピオカを真珠に見立てた呼び名。",
    // **仲間の語はどの学習言語でも出す**(オーナー指示 2026-08-26)。
    // 華語では「同じ字を共有する語」がいちばん芋づるになる。
    etymology_relatives: [
      { word: "奶油", note: "奶 = 乳" },
      { word: "牛奶", note: "奶 = 乳" },
      { word: "茶葉", note: "茶 = お茶" },
    ],
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
export function WordCardScene({ q }: { q: URLSearchParams }) {
  /**
   * **候補を選んだ直後の面**(オーナー指示 2026-08-25
   * 「絶対に母語での訳と発音、感想の入力以外の項目は表示しないで」)。
   *
   * ここに場面が無かったので、`minimal` が実際に何を伏せているかを
   * 誰も見ていなかった。実物では**級の段々も「まだ作られていません」の
   * 空箱も並んだまま**で、それでも検査は合格していた。
   */
  if (q.get("variant") === "minimal") {
    return <WordCard word={FULL} autoplay={false} minimal />;
  }
  return <WordCard word={FULL} autoplay={false} />;
}

/**
 * **英語のカード**(第4段 / 指摘⑬「英語を学ぶ台湾人向けの版」)。
 *
 * 台湾華語のカードには無い5つの節がここに出る:
 * 活用・数え方と冠詞・強く読む所・句動詞・文化の一言。
 * 逆に量詞と台湾メモは出ない(`target-profile.ts` の `sections` が決める)。
 *
 * **この場面を作らないと、新しい5節は一度も機械の目に映らない。**
 * 節を足したのに絵を撮らないのは、この app が何度もやった形
 * (「合格したが実物は見ていない」)。
 */
export const FULL_EN = {
  headword: "umbrella",
  // 英語の読みは IPA。**拼音の欄に入れない** — 名前と中身が食い違うと、
  // 拼音として読む所が静かに壊れる(20260825140000 で列を足した)。
  reading_primary: "ʌmˈbrɛlə",
  reading_alt: "ʌmˈbrelə",
  pinyin: null,
  reading_zhuyin: null,
  language: "en",
  meaning_ja: "傘",
  part_of_speech: "名詞",
  level: "A2",
  example_sentence: "Take an umbrella — it looks like rain.",
  example_translation: "傘を持っていって。雨が降りそう。",
  extras: {
    ...emptyExtras(),
    usage_context: "日常でも天気予報でもよく出る。口語でも書面でも同じ形。",
    frequency_level: 4,
    register_tag: "口語・書面",
    register_scale: 0,
    example_chunks: [
      { text: "Take", pos: "V" },
      { text: "an umbrella", pos: "O" },
      { text: "it looks like rain", pos: "S" },
    ],
    usage_chunks: [
      {
        parts: [
          { text: "take", pos: "V" },
          { text: "an umbrella", pos: "O" },
        ],
        ja: "傘を持っていく",
      },
      {
        parts: [
          { text: "under", pos: "Prep" },
          { text: "the umbrella", pos: "O" },
        ],
        ja: "傘の下で",
      },
    ],
    examples_extra: [
      {
        zh: "She left her umbrella on the train.",
        ja: "彼女は電車に傘を忘れた。",
        scene: "落とし物の話をするとき",
        chunks: [
          { text: "left", pos: "V" },
          { text: "on the train", pos: "Prep" },
        ],
      },
    ],
    // **辞書から入る節。** AI を1回も呼ばない(ECDICT の exchange 欄)。
    forms: {
      plural: "umbrellas",
      past: "",
      pastParticiple: "",
      ing: "",
      third: "",
      comparative: "",
      superlative: "",
      lemma: "umbrella",
    },
    countability: {
      kind: "countable" as const,
      article: "an",
      // 母音の前は a ではなく an。中国語に冠詞が無いので、ここは
      // 「なぜ間違えるか」ではなく「どう言えば正しいか」を書く。
      note: "母音で始まるので a ではなく an。数えられるので複数形は umbrellas。",
    },
    stress: {
      syllables: ["um", "brel", "la"],
      primary: 1,
      secondary: null,
      note: "真ん中を強く。最初と最後は軽く落とす。",
    },
    phrasal_verbs: [
      { phrase: "put up an umbrella", meaning: "傘をさす", example: "She put up her umbrella." },
      {
        phrase: "under the umbrella of",
        meaning: "〜の傘下で",
        example: "Under the umbrella of the UN.",
      },
    ],
    culture_note:
      "アメリカでは umbrella、イギリスでは brolly と呼ぶこともあります。" +
      "「傘下」という比喩の使い方も英語にあり、an umbrella organization は「統括団体」の意味です。",
    pronunciation_tips:
      "最初の um は弱く曖昧に(ə に近い音)、真ん中の brel を強くはっきり出します。" +
      "語末の la は軽く落として構いません。強い所を1つ決めるのが、通じるかどうかを一番左右します。",
    etymology: "ラテン語 umbra(影)+ -ella(小さい)。もとは日除けの道具。",
    // **同じ部品を持つ仲間の語**(オーナー指示 2026-08-26)。
    // 英語のカードにだけ出るので、英語の場面で撮らないと一度も映らない。
    etymology_relatives: [
      { word: "umbrage", note: "影 → 不快感" },
      { word: "umbrella term", note: "全体を覆う言い方" },
      { word: "novella", note: "-ella は「小さい」" },
    ],
    // 母語(日本語)に定着している物へ引っ掛ける(オーナー指示の形)。
    mnemonic: "「アンブレラ」はそのままカタカナで通じる。umbra(影)を作る道具、と覚える。",
  },
};

/** 英語のカード。**5つの新しい節が並ぶ所。** */
export function WordCardEnScene() {
  return <WordCard word={FULL_EN} autoplay={false} />;
}

/**
 * まだ生成されていない節がある状態（撮った直後）。
 *
 * **枠だけの節はもう並ばない**（オーナー報告 2026-08-26、3度目
 * 「回答が生成されるまで項目が表示しないで」）。以前この場面は
 * 「まだ作られていません」の点線が13個並ぶ絵で、それを撮ることで
 * 「並んでいてよい」ことにしてしまっていた。
 *
 * いま撮るのは**その逆** — 中身のある節だけが並び、残りは静かに
 * 空いている面。生成が進むにつれて上から現れる。
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
const shot = (w: number, h: number, c: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`,
  );

const STICKER = {
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
} as never;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 19, 3, 0, 0);

/**
 * 語の詳細の**既定の見え方そのもの**。
 *
 * 今までここは `StickerDetailHero`(上半分)だけを撮っていた。
 * さらにその前は `WordCard` を裸で撮っていて、**実物では
 * `<details>`「すべて見る」の中で閉じている面**を
 * 「一番長く見られる画面」として採点していた。
 *
 * ここでは実物の並びをそのまま描く:
 *   戻る → 写真(表裏) → 見出し語・意味 → 語の木 → 出会った記録 →
 *   「すべて見る」(**閉じたまま**) → 記憶の曲線 → 地図
 *
 * **開いた側は撮らない。** 開いた中身は `word-card` の場面が受け持つ。
 * ここで開くと、また「既定では見えない面」を既定として採点することになる。
 */
export function StickerDetailScene() {
  return (
    <>
      <BackToDexLink />
      <StickerDetailBody
        sticker={STICKER}
        dateLocale="ja-JP"
        photos={[
          {
            url: shot(160, 160, "#d0483c"),
            taken_at: "2026-05-02T09:00:00Z",
            place: "台北駅",
            first: true,
          },
          {
            url: shot(160, 160, "#f5a623"),
            taken_at: "2026-08-01T18:00:00Z",
            place: "士林夜市",
            first: false,
          },
        ]}
        memory={
          {
            history: [
              {
                reviewed_at: new Date(NOW - 21 * DAY).toISOString(),
                score: 4,
                interval_days_after: 3,
                ease_after: 2.5,
              },
              {
                reviewed_at: new Date(NOW - 12 * DAY).toISOString(),
                score: 3,
                interval_days_after: 6,
                ease_after: 2.3,
              },
              {
                reviewed_at: new Date(NOW - 4 * DAY).toISOString(),
                score: 5,
                interval_days_after: 12,
                ease_after: 2.4,
              },
            ],
            current: {
              ease: 2.3,
              interval_days: 6,
              last_reviewed_at: new Date(NOW - 4 * DAY).toISOString(),
              due_at: new Date(NOW + 2 * DAY).toISOString(),
            },
          } as never
        }
      />
    </>
  );
}

/** 上半分だけ。写真の裏表と「いつ・どこで」を大きく見るための場面。 */
export function StickerHeroScene() {
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

/**
 * TOCFL の段々。**6級ぶんと級外**を並べて、どの段が立っているかを見る。
 *
 * 級だけを変えた同じ図を並べるのは、**段の高さと色が級ごとに違う**こと
 * そのものが情報だから。1枚だけ撮ると「立っている段が正しいか」しか
 * 分からず、順番が壊れていても気づけない。
 */
export function TocflLadderScene({ q }: { q: URLSearchParams }) {
  /**
   * 体系を切り替えて撮る(2026-08-24 の二言語化)。
   *
   * TOCFL も CEFR も「6段 + 3帯」で形が同じなので、**同じ部品**で描ける。
   * ただし「同じ形のはず」は思い込みかもしれないので、**両方撮って
   * 並べて確かめる**。CEFR 側には TOEFL / IELTS の目盛りが添う。
   */
  const cefr = q.get("scale") === "cefr";
  const scale = cefr ? CEFR_SCALE : TOCFL_SCALE;
  // 最後の2つは**級外**。`Z9` / `TOCFL-9` は古い形、`scale.outStored` は
  // いまキャッチが実際に書く形(オーナー指示 2026-08-26「CEFR-J に無い語は
  // 級外にして」)。**実際に保存する形が級外として描かれること**を絵で
  // 確かめる — ここが「分からない」に落ちると段々ごと消える。
  const levels = (
    cefr
      ? ["A1", "A2", "B1", "B2", "C1", "C2", "Z9"]
      : ["TOCFL-1", "TOCFL-2", "TOCFL-3", "TOCFL-4", "TOCFL-5", "TOCFL-6", "TOCFL-9"]
  ).concat(scale.outStored);
  return (
    <div className="space-y-3">
      {levels.map((l) => (
        <div key={l} className="rounded-2xl border border-border bg-card p-3">
          <TocflLadder level={l} scale={scale} />
        </div>
      ))}
      {/* 分からない語は**何も描かない**のが正しい(空の枠だけが残る)。 */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <TocflLadder level={null} scale={scale} />
      </div>
    </div>
  );
}

/**
 * 単語の項目の並べ替え。
 *
 * **今まで一度も撮っていなかった。** 掴んで並べ替えられるようにしたのに、
 * この部品には場面が無く、検査は合格したまま**1枚も絵が残らなかった**
 * (この作業場で3度目の「雛形が実物を追えていない」形)。
 *
 * `?hold=` を使うと、検査が指を置いたまま撮る。掴んでいる見た目は
 * **押し続けている間**にしか出ないので、`click` では永遠に写らない。
 */
export function SectionsEditorScene() {
  return (
    <div style={{ padding: 16 }}>
      <WordCardSectionsEditor />
    </div>
  );
}
