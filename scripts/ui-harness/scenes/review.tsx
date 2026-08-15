/**
 * 復習画面の場面。**ルートに書かれている本物のコンポーネントを描く。**
 *
 * 復習はこのアプリの中心(写真を見て、自分の言葉で言う)なのに、
 * 中身がルートのファイルに直書きされていたので**一度も機械で見ていなかった**。
 * ルート側でいくつか `export` を足して、ここからそのまま描く。
 * 似たHTMLをこちらに書き写すことはしない — それをやると
 * 「直しても画像が変わらない検査」に戻る。
 */
import {
  AnswerExplain,
  CardMemoryBadge,
  DoneState,
  EmptyState,
  LightModeCard,
  MemoryLevelSummary,
} from "@/routes/_authenticated/review";
import type { DueReviewCard } from "@/lib/reviews.functions";

const CARD: DueReviewCard = {
  review_id: "r1",
  sticker_id: "s1",
  word_id: "w1",
  headword: "珍珠奶茶",
  reading_zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ",
  pinyin: "zhēn zhū nǎi chá",
  meaning_ja: "タピオカミルクティー",
  example_sentence: "我想喝一杯珍珠奶茶。",
  example_translation: "タピオカミルクティーを一杯飲みたい。",
  top_chunk: { zh: "喝一杯", ja: "一杯飲む" },
  explain: null,
  category_key: "drink",
  entry_type: "word",
  cutout_url: null,
  placeholder_url: null,
  audio_url: null,
  caption: "夜市で",
  location_name: "士林夜市",
  taken_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  review_count: 3,
  prompt_pattern: { type: "V+O", zh: "喝珍珠奶茶", ja: "〜を飲む" },
  blur_seen: false,
  ease: 2.4,
  interval_days: 6,
  repetitions: 3,
  retention: 72,
  mode: "recognition",
  choices: ["タピオカミルクティー", "夜市の屋台", "地下鉄の駅", "傘立て"],
  headword_choices: ["珍珠奶茶", "夜市", "捷運", "雨傘"],
  headword_choice_infos: [
    { headword: "珍珠奶茶", zhuyin: "ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ", pinyin: "zhēn zhū nǎi chá" },
    { headword: "夜市", zhuyin: "ㄧㄝˋ ㄕˋ", pinyin: "yè shì" },
    { headword: "捷運", zhuyin: "ㄐㄧㄝˊ ㄩㄣˋ", pinyin: "jié yùn" },
    { headword: "雨傘", zhuyin: "ㄩˇ ㄙㄢˇ", pinyin: "yǔ sǎn" },
  ],
};

/** 記憶レベルの帯 + 1枚ぶんのバッジ。復習を開いた瞬間に見えるもの。 */
export function ReviewMemoryScene() {
  const words = [72, 44, 91, 12, 60, 33].map((retention, i) => ({
    sticker_id: `s${i}`,
    headword: ["珍珠奶茶", "夜市", "捷運", "雨傘", "蘋果", "咖啡"][i],
    retention,
    interval_days: [6, 2, 30, 1, 14, 45][i],
    repetitions: [3, 1, 8, 1, 5, 9][i],
    due_at: null,
    days_until_forgot: null,
    fresh: i === 3,
    long_term: i === 5,
    anchor_at: null,
    stability_days: 4,
    ease: 2.4,
  }));
  return (
    <div className="space-y-4">
      <MemoryLevelSummary words={words} />
      <CardMemoryBadge card={CARD} onOpen={() => {}} />
    </div>
  );
}

/** 4択のカード。**アプリでいちばん多く押される画面。** */
export function ReviewChoiceScene() {
  return <LightModeCard card={CARD} onNext={() => {}} onOpenMemory={() => {}} />;
}

/** 答え合わせの解説。 */
export function ReviewExplainScene() {
  return <AnswerExplain card={CARD} />;
}

/** 今日ぶんが無いとき・終わったとき。**普通の日にいちばんよく見る面**。 */
export function ReviewEndScene({ q }: { q: URLSearchParams }) {
  return q.get("variant") === "done" ? <DoneState onAgain={() => {}} /> : <EmptyState />;
}
