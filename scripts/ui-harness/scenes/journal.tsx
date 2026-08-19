/**
 * 日記の添削。**学習の中心機能のひとつ**なのに、ここまで一度も
 * 機械の目に映っていなかった。
 *
 * ルートが問い合わせを持つので、結果を描く2つの部品を直接描く。
 * どちらも問い合わせを持たない純粋な見た目。
 */
import { EntryBlock, NativePhrases } from "@/routes/_authenticated/journal";

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
