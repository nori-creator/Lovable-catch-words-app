/**
 * 単語帳の場面。**ルートに書かれている本物の部品を描く。**
 *
 * 単語帳は一度に何十語も入るので、崩れたときの被害が大きい割に、
 * 目で見る機会は「取り込んだ直後」しか無い。棚・問題・結果の3つを撮る。
 */
import { readySpeech } from "../speech";

/** 発音ボタンは鳴らせるようになってから出る。足場では支度が済んだことにする。 */
readySpeech(["珍珠奶茶", "捷運", "腳踏車", "雨傘", "面紙"]);

import { WordbookShelf } from "@/components/WordbookShelf";
import { WordbookReviewCard } from "@/components/WordbookReviewCard";
import type { WordbookSummary, WordbookCard } from "@/lib/wordbook.functions";

const BOOKS: WordbookSummary[] = [
  {
    id: "b1",
    title: "TOCFL 2級 第3課",
    created_at: "2026-08-18T09:00:00Z",
    total: 42,
    due: 12,
    learned: 18,
  },
  // **今日ぶんが終わった本**も並べる。「今日 0語」ではなく
  // 「今日はおしまい」と出ているかは、絵でしか分からない。
  {
    id: "b2",
    title: "夜市でよく見る語",
    created_at: "2026-08-12T09:00:00Z",
    total: 15,
    due: 0,
    learned: 15,
  },
  // 名前が長い本。棚の1行に収まらないと、数字の行まで押し出される。
  {
    id: "b3",
    title: "自作リスト・台北の地下鉄で見かけた表示ぜんぶ",
    created_at: "2026-08-01T09:00:00Z",
    total: 60,
    due: 60,
    learned: 0,
  },
];

/**
 * 単語帳の本棚(オーナー指摘 2026-08-21「リアルな本の本棚を作って、
 * 背表紙のタイトルが見えるように」)。
 *
 * **冊数を変えて2通り撮る。** 3冊では棚に見えても、10冊並べたときに
 * 横へあふれるか・題が潰れるかは、その絵でしか分からない。
 */
export function WordbookShelfScene({ q }: { q: URLSearchParams }) {
  const books =
    q.get("many") === "1"
      ? [
          ...BOOKS,
          ...Array.from({ length: 7 }, (_, i) => ({
            ...BOOKS[0],
            id: `m${i}`,
            title: MANY_TITLES[i],
          })),
        ]
      : BOOKS;
  return <WordbookShelf books={books} onOpen={() => {}} onDelete={() => {}} />;
}

/** 題の長さも文字種もばらばらにする — 幅と縦書きの両方を見たい。 */
const MANY_TITLES = [
  "旅",
  "料理の語",
  "新TOCFL必考詞彙1500",
  "看板と標識",
  "MRT",
  "ドラマで拾った言い回し",
  "仕事メール",
];

const CARD: WordbookCard = {
  id: "e1",
  headword: "捷運",
  reading_zhuyin: "ㄐㄧㄝˊ ㄩㄣˋ",
  pinyin: "jié yùn",
  meaning_ja: "地下鉄（MRT）",
  repetitions: 2,
  interval_days: 3,
  choices: ["公車", "捷運", "火車", "計程車"],
};

export function WordbookQuizScene() {
  return <WordbookReviewCard card={CARD} onAnswer={() => {}} />;
}

/** 意味が読み取れなかった語。**空欄のまま出さない**ことを確かめる。 */
export function WordbookQuizNoMeaningScene() {
  return <WordbookReviewCard card={{ ...CARD, meaning_ja: null }} onAnswer={() => {}} />;
}
