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
  DoneState,
  EmptyState,
  LightModeCard,
  MemoryLevelSummary,
  ReviewHeader,
  ReviewPreparing,
  SayResult,
  SpeakingCard,
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
  object_url: null,
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

/**
 * 出題を組み立てている間。**この画面でいちばん先に見る面**。
 * 見出しは先に出ているので、その下に1枚だけ置かれた絵になる。
 */
export function ReviewLoadingScene() {
  return (
    <>
      <section className="mb-4">
        <ReviewHeader answered={null} total={null} progress={0} mode="choice" onMode={() => {}} />
      </section>
      <ReviewPreparing />
    </>
  );
}

/**
 * 復習を開いた瞬間の上半分。見出しと、記憶レベルの帯。
 *
 * 帯は実物では**押せる**(押すと語ごとの一覧が開く)。素の `div` として
 * 撮っていた間は、押せる大きさも焦点の輪も一度も測っていなかった。
 * 実物と同じく `<section className="mb-4">` の中に、見出しと一緒に置く。
 */
export function ReviewMemoryScene({ q }: { q: URLSearchParams }) {
  const open = q.get("variant") === "open";
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
    <section className="mb-4">
      {/* 続いている日数はここに出る。**0 のときは出ない**のが正しい姿なので、
          読み込み中の面(下)で「出ないこと」も一緒に見る。 */}
      <ReviewHeader
        answered={3}
        total={12}
        progress={25}
        mode="choice"
        onMode={() => {}}
        reviewStreak={7}
      />
      {/* 実物と同じく `<button>` で包む。開いた側も撮る — 印の向きが
          変わるだけの差だが、変わらなければ押しても何も起きないのと同じ。 */}
      <button className="w-full text-left" aria-expanded={open}>
        <MemoryLevelSummary words={words} expanded={open} />
      </button>
    </section>
  );
}

/** 4択のカード。**アプリでいちばん多く押される画面。** */
export function ReviewChoiceScene() {
  // **見出しも一緒に描く。** 札だけを描いていたせいで、独立監査が
  // 「クイズに進捗(3/12)が無い」と指摘した — 実物には最初からある。
  // 部品だけを切り出した絵は、その画面の絵ではない。
  return (
    <>
      <section className="mb-4">
        <ReviewHeader answered={3} total={12} progress={25} mode="choice" onMode={() => {}} />
      </section>
      <LightModeCard card={CARD} onNext={() => {}} onOpenMemory={() => {}} />
    </>
  );
}

/** 答え合わせの解説。 */
export function ReviewExplainScene() {
  return <AnswerExplain card={CARD} />;
}

/** 今日ぶんが無いとき・終わったとき。**普通の日にいちばんよく見る面**。 */
export function ReviewEndScene({ q }: { q: URLSearchParams }) {
  // 完了の面は**成績つき**で撮る。数えていない回(0問)は成績を出さない
  // 分岐なので、そちらも別の場面で見る。
  if (q.get("variant") === "done") {
    return <DoneState onAgain={() => {}} answered={12} correct={10} />;
  }
  if (q.get("variant") === "done-nocount") {
    return <DoneState onAgain={() => {}} />;
  }
  return <EmptyState />;
}

/**
 * 「言うだけ」の段の出題(要望 #32 の L2)。
 *
 * **型も足場も出ていない面**なので、何を求められているかが1行で
 * 伝わっているかを見る。ここに何も無いと、写真と録音ボタンだけが
 * 置かれた画面になり、人は「文を作るのか、単語だけか」を推測することになる。
 *
 * 本物の `SpeakingCard` をそのまま描く。足場の取得は
 * `format="say"` のとき止まっているので、通信は起きない。
 */
export function ReviewSayScene() {
  return (
    <>
      <section className="mb-4">
        <ReviewHeader answered={2} total={9} progress={22} mode="hybrid" onMode={() => {}} />
      </section>
      <SpeakingCard card={CARD} format="say" onNext={() => {}} onOpenMemory={() => {}} />
    </>
  );
}

/**
 * 「言うだけ」の答え合わせ。通じた面と通じなかった面の両方。
 *
 * カードごと描くと、この節に辿り着くまでに写真と録音欄で数千pxになる
 * (「出会う」の節で一度やった失敗)。判定の面だけを直に描く。
 */
export function ReviewSayResultScene({ q }: { q: URLSearchParams }) {
  const ok = q.get("variant") !== "ng";
  return (
    <SayResult
      card={CARD}
      ok={ok}
      heard={ok ? "珍珠奶茶" : "真豬奶茶"}
      onRetry={() => {}}
      onNext={() => {}}
    />
  );
}

/**
 * 見出しの3択そのもの。**滑る丸がどの札を覆っているか**を3通りとも見る。
 *
 * 2択のときの `w-1/2` を残したまま3つ目を足すと、丸が最後の札の
 * 半分しか覆わない — 押しているのに選ばれていないように見える。
 * 位置で意味を伝える部品は、位置が合っている絵で確かめる。
 */
export function ReviewModeTabsScene({ q }: { q: URLSearchParams }) {
  const raw = q.get("variant") ?? "hybrid";
  const mode = raw === "speaking" || raw === "choice" ? raw : "hybrid";
  return (
    <section className="mb-4">
      <ReviewHeader answered={3} total={12} progress={25} mode={mode} onMode={() => {}} />
    </section>
  );
}
