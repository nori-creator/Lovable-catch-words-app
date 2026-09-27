import { buildMemoryCurve, type CurveEvent, type MemoryCurve } from "@/lib/memory-curve";
import { stabilityOf } from "@/lib/srs";

/**
 * 履歴から曲線を作る**計算だけ**（グラフの部品から分けた。2026-09-27）。
 *
 * 部品（`ForgettingCurveChart.tsx`）は recharts を読み込む。計算だけ欲しい
 * 画面（復習）がそこから import すると、**グラフの部品ごと起動時の束に
 * 入って**いた（実測: 起動時の JS の約4割が recharts・lodash・d3）。
 */
export type HistoryPoint = {
  reviewed_at: string;
  score: number;
  interval_days_after: number;
  ease_after: number;
};

const DAY = 86_400_000;
/** まだ一度も復習していない語の ease（SM-2 の初期値）。 */
const FIRST_EASE = 2.5;

/**
 * 履歴の行から曲線を作る。**復習の画面と図鑑の詳細で同じ関数を使う** —
 * 以前は2か所に別々の計算があり、安定度の式まで違っていた。
 *
 * 線の始まりは**撮った日**（復習には数えない）。履歴が無い古い語で、
 * 最後に復習した時刻だけ分かるものは、それを1回の復習として置く。
 */
export function memoryCurveFrom(
  input: {
    history: HistoryPoint[];
    takenAt?: string | null;
    lastReviewedAt?: string | null;
    currentEase?: number;
    currentIntervalDays?: number;
    /** 安定度が分かっていればそれを使う（一覧の値と揃える）。 */
    stabilityDays?: number;
  },
  nowMs: number,
): MemoryCurve | null {
  const events: CurveEvent[] = input.history.map((h) => ({
    t: new Date(h.reviewed_at).getTime(),
    stability: stabilityOf(h.interval_days_after, h.ease_after),
  }));
  const ease = input.currentEase ?? FIRST_EASE;
  if (events.length === 0 && input.lastReviewedAt) {
    events.push({
      t: new Date(input.lastReviewedAt).getTime(),
      stability: input.stabilityDays || stabilityOf(input.currentIntervalDays ?? 0, ease),
    });
  }
  const encounter = input.takenAt
    ? {
        t: new Date(input.takenAt).getTime(),
        // 撮っただけで一度も復習していない間の安定度。復習前の間隔は 0。
        stability:
          events.length === 0 && input.stabilityDays
            ? input.stabilityDays
            : stabilityOf(0, FIRST_EASE),
      }
    : null;
  return buildMemoryCurve(events, nowMs, { encounter });
}
