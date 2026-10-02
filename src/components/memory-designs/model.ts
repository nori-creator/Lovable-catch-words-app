/**
 * 記憶の状態の**デザイン案**（A〜D）が使う数の組み立て。描画からは切り離す。
 *
 * > オーナー指示 2026-10-02「記憶の状態のグラフのデザイン案を複数提案して。」
 *
 * どの案も、いまの本番と**同じデータ**だけを受け取る（`getMemoryOverview` の語の列と
 * `getOverallMemoryStats` の前後2週間）。新しい問い合わせを足すと、案を選んだあとに
 * サーバ側の作業が増え、本番へつなぐのが遅れる。「いつ復習が来るか」も、語ごとの
 * `due_at` を数えれば出るので、`getUpcomingDueTimes`（通知用・24時間ぶん）は使わない。
 *
 * ## 数の約束（`ARCHITECTURE.md`「Displayed number」）
 * - 語に出す % は1つだけ — いま思い出せる確率（`memoryOf`）。
 * - 「どれだけもつか」は2つ目の % にしない。**次の復習の日**として出す。
 * - 「今日」は台湾時間で数える（`taipei-day.ts`）。
 */
import { MEMORY_LEVELS, memoryOf } from "@/lib/memory";
import { TARGET_RETENTION } from "@/lib/srs";
import { taipeiDay } from "@/lib/taipei-day";
import type { MemoryWord } from "@/lib/reviews.functions";

const DAY_MS = 86_400_000;

/** 台湾時間の暦の日を通し番号にする（日の差を引き算で出すため）。 */
function dayIndex(ms: number): number {
  return Math.round(Date.parse(taipeiDay(new Date(ms))) / DAY_MS);
}

/** 台湾時間で、`ms` の日が今日から何日先か（過去ならマイナス）。 */
export function calendarDaysFrom(nowMs: number, ms: number): number {
  return dayIndex(ms) - dayIndex(nowMs);
}

export type NextReview = {
  /** 今日から何日後の暦の日か。**0 以下は「今日」**（過ぎている語も今日の復習に入る）。 */
  days: number;
  /**
   * `due_at` が無い語の、曲線からの**目安**か。予定ではないので、画面では
   * 「目安」と書き分ける（予測を予定のように見せない）。
   */
  estimated: boolean;
};

/**
 * 次の復習の日。
 *
 * 予定（`due_at`）があればそれを使う — アプリが実際に出題する日そのもので、
 * 画面の言う日と出題の日が食い違わない。無い語（取り込み直後など）だけ、
 * 忘却曲線が狙いの定着度（90%）まで下がる日を目安にする。
 */
export function nextReviewOf(w: MemoryWord, nowMs: number): NextReview | null {
  if (w.due_at) {
    const due = Date.parse(w.due_at);
    if (Number.isFinite(due)) return { days: calendarDaysFrom(nowMs, due), estimated: false };
  }
  if (!w.anchor_at) return null;
  const anchor = Date.parse(w.anchor_at);
  if (!Number.isFinite(anchor)) return null;
  const at = anchor + w.stability_days * Math.log(1 / TARGET_RETENTION) * DAY_MS;
  return { days: calendarDaysFrom(nowMs, at), estimated: true };
}

/** 次の復習の時期の4つの箱。 */
export type DueBucket = "today" | "tomorrow" | "week" | "later";
export const DUE_BUCKETS: readonly DueBucket[] = ["today", "tomorrow", "week", "later"];

/** 何日後かを箱に入れる。「2〜7日後」の箱に明日は入れない（明日は別の箱）。 */
export function bucketOf(days: number): DueBucket {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

export type DueGroup = {
  bucket: DueBucket;
  /** 急ぐ順（日の早い順 → 思い出せる確率の低い順 → 見出し語）。 */
  words: Array<{ word: MemoryWord; next: NextReview | null; percent: number }>;
};

/**
 * 語を「今日・明日・2〜7日後・それ以降」に分け、各箱の中は急ぐ順に並べる。
 * 予定も目安も無い語は「それ以降」の末尾（並びから落とさない — 上の数と
 * 一覧の数が食い違うと、オーナー報告 2026-08-26 と同じ事故になる）。
 */
export function groupByDue(words: readonly MemoryWord[], nowMs: number): DueGroup[] {
  const rows = words.map((word) => ({
    word,
    next: nextReviewOf(word, nowMs),
    percent: memoryOf(word).percent,
  }));
  rows.sort((a, b) => {
    const da = a.next ? Math.max(0, a.next.days) : Number.POSITIVE_INFINITY;
    const db = b.next ? Math.max(0, b.next.days) : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    if (a.percent !== b.percent) return a.percent - b.percent;
    return a.word.headword.localeCompare(b.word.headword);
  });
  return DUE_BUCKETS.map((bucket) => ({
    bucket,
    words: rows.filter((r) => (r.next ? bucketOf(r.next.days) : "later") === bucket),
  }));
}

/**
 * これから `days` 日の、日ごとの「復習どきが来る語の数」。先頭は今日で、
 * **過ぎている語も今日に入れる**（今日やる物の数として正しい）。
 * 範囲より先の語は数えない（棒の外）。
 */
export function dueCountsByDay(words: readonly MemoryWord[], nowMs: number, days = 14): number[] {
  const out = Array.from({ length: days }, () => 0);
  for (const w of words) {
    const next = nextReviewOf(w, nowMs);
    if (!next) continue;
    const i = Math.max(0, next.days);
    if (i < days) out[i] += 1;
  }
  return out;
}

/** 段ごとの語数（段の並びは `MEMORY_LEVELS` と同じ — 忘れかけ → はっきり）。 */
export function levelCounts(words: readonly MemoryWord[]): Array<{
  level: (typeof MEMORY_LEVELS)[number];
  count: number;
}> {
  const counts = MEMORY_LEVELS.map(() => 0);
  for (const w of words) counts[memoryOf(w).level.level] += 1;
  return MEMORY_LEVELS.map((level, i) => ({ level, count: counts[i] }));
}

export type SeriesPoint = { day_offset: number; avg_retention: number | null };

/** 前後2週間の線から、`day` 日目（今日 = 0）の値。無ければ null。 */
export function seriesAt(series: readonly SeriesPoint[], day: number): number | null {
  return series.find((p) => p.day_offset === day)?.avg_retention ?? null;
}

/**
 * いちばん先の予測の点（復習しなかった場合）。未来が描けない時は null。
 * 「1週間後」と言い切らず、**線が届く最後の日**を返す — 予測の幅は
 * サーバが決める（いまは +14日）。
 */
export function lastForecast(
  series: readonly SeriesPoint[],
): { day: number; value: number } | null {
  let best: { day: number; value: number } | null = null;
  for (const p of series) {
    if (p.day_offset > 0 && p.avg_retention != null && (!best || p.day_offset > best.day))
      best = { day: p.day_offset, value: p.avg_retention };
  }
  return best;
}
