/**
 * 日記の添削。**学習の中心機能のひとつ**なのに、ここまで一度も
 * 機械の目に映っていなかった。
 *
 * ルートが問い合わせを持つので、結果を描く2つの部品を直接描く。
 * どちらも問い合わせを持たない純粋な見た目。
 */
import { EntryBlock, NativePhrases } from "@/routes/_authenticated/journal";
import { JournalScaffold } from "@/components/JournalScaffold";

const PHRASES = [
  {
    zh: "今天我去了士林夜市,吃了珍珠奶茶。",
    ja: "今日は士林夜市に行って、タピオカミルクティーを飲んだ。",
    note: "「喝」ではなく「吃」を使うのは、タピオカを噛むものとして捉えているから。",
  },
  {
    zh: "半糖少冰,謝謝。",
    ja: "甘さ半分・氷少なめで、お願いします。",
    // 気づきが無い回。**空文字で来る**ので、そのときに行がどう詰まるかも見る。
    note: "",
  },
];

export function JournalResultScene({ q }: { q: URLSearchParams }) {
  const compact = q.get("variant") === "compact";
  return (
    <div className="space-y-3">
      <EntryBlock
        label="直した文"
        body="今天我去士林夜市,喝了一杯珍珠奶茶。天氣很熱,所以我點了少冰。"
        subtle="「去」の後ろに「了」を入れると、行った動作が完了したことがはっきりします。場所の前に「到」を足しても自然です。"
        subtleLabel="気づき"
      />
      <NativePhrases phrases={PHRASES} compact={compact} />
    </div>
  );
}

/**
 * 書く**前**の足場(要望 #88)。
 *
 * ここに何も無かった頃は、`placeholder` の一文だけを渡して空欄に向かわせて
 * いた。質問が「その人の今日」に結び付いているか、型が押せると分かるか —
 * 絵で確かめる所。
 */
export function JournalScaffoldScene() {
  return (
    <JournalScaffold
      data={{
        prompts: [
          {
            sticker_id: "s1",
            question_zh: "你今天為什麼想喝珍珠奶茶?",
            question_ja: "今日はどうしてタピオカミルクティーが飲みたくなったの?",
          },
          {
            sticker_id: "s2",
            question_zh: "在士林夜市看到什麼最讓你驚訝?",
            question_ja: "士林夜市でいちばん驚いたものは?",
          },
          {
            // **結び付けに失敗した質問も撮る。** 番号が範囲外のときは
            // 1枚を指さずに出す形にしてあるので、その姿も見ておく。
            sticker_id: null,
            question_zh: "今天的天氣讓你想起什麼?",
            question_ja: "今日の天気で思い出したことは?",
          },
        ],
        patterns: [
          { zh: "我今天在…", ja: "今日どこで何をしたか" },
          { zh: "因為…所以…", ja: "理由を言うとき" },
          { zh: "讓我想起…", ja: "思い出したことを言うとき" },
        ],
        captures: [
          { id: "s1", headword: "珍珠奶茶", caption: "夜市で", location_name: "士林夜市" },
          { id: "s2", headword: "臭豆腐", caption: null, location_name: "士林夜市" },
        ],
      }}
      onUsePattern={() => {}}
    />
  );
}
