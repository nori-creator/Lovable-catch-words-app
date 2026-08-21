/**
 * 単語帳の場面。**ルートに書かれている本物の部品を描く。**
 *
 * 単語帳は一度に何十語も入るので、崩れたときの被害が大きい割に、
 * 目で見る機会は「取り込んだ直後」しか無い。棚・問題・結果の3つを撮る。
 */
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

export function WordbookShelfScene() {
  return <WordbookShelf books={BOOKS} onOpen={() => {}} onDelete={() => {}} />;
}

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
  return <WordbookReviewCard card={CARD} onAnswer={() => {}} onSpeak={() => {}} />;
}

/** 意味が読み取れなかった語。**空欄のまま出さない**ことを確かめる。 */
export function WordbookQuizNoMeaningScene() {
  return (
    <WordbookReviewCard
      card={{ ...CARD, meaning_ja: null }}
      onAnswer={() => {}}
      onSpeak={() => {}}
    />
  );
}
