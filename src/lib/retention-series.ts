/**
 * 「全体の記憶率(前後2週間)」の折れ線を組み立てる。
 *
 * ## なぜ切り出したか — 直した不具合そのもの
 *
 * これは `reviews.functions.ts` の `getOverallMemoryStats` の中にあった。
 * そこでは **いまの `interval_days` / `ease` / `last_reviewed_at`** を
 * -14日から+14日まで**全部の日に**当てていた:
 *
 * ```ts
 * if (dt <= 0) return 100;   // ← 復習した瞬間、過去14日が全部 100%
 * ```
 *
 * 復習すると `last_reviewed_at` が今日になるので、過去側の `dt` が
 * 全部マイナスになり、**過去14日が一律 100%** に塗り替わる。
 * オーナーの報告「今日朝は48%で、復習したら70%になったけど、
 * 70%の1日前が75%とかで、48%から復習したことによってグラフが
 * 変化するようになっていない」は、これがそのまま出たもの。
 * 左半分は履歴ではなく、**今日の状態を過去へ投げ返した嘘**だった。
 *
 * ## 直した形
 *
 * - **過去は記録から作る。** `review_history` に1回ぶんずつ
 *   `reviewed_at / interval_days_after / ease_after` が残っている。
 *   ある日の状態は「その日までに終わっていた最後の1行」で決まる。
 * - **その日にまだ無かったカードは平均から外す。** 以前は今日キャッチした
 *   語が2週間前の平均にも混ざっていた(しかも 100% として)。
 *   数えられる語が1枚も無い日は `null` — 0% ではない。線を切る。
 * - **安定度は `stabilityOf` を使う。** 元の関数は
 *   `Math.max(0.5, interval_days * ease)` と自前で書いていて、
 *   未復習(`interval_days = 0`)の語の安定度が **0.5日** になっていた。
 *   単語ごとの曲線は `stabilityOf`(下限1日)を使っていたので、
 *   同じ語が画面によって違う速さで忘れられていた。
 *
 * 外の世界に触れるものをここに入れないこと。入れた瞬間にまた試せなくなる。
 */
import { stabilityOf } from "./srs";

const DAY_MS = 86400_000;

/** 初回の復習より前の期間に使う既定値(まだ1度も復習していない語)。 */
export const INITIAL_EASE = 2.5;
export const INITIAL_INTERVAL_DAYS = 1;

export type RetentionCard = {
  sticker_id: string;
  /** この語に出会った日。記憶の起点であり、**存在の起点**でもある。 */
  taken_at: string | null;
  /** いまの状態(未来側の予測に使う)。 */
  ease: number;
  interval_days: number;
  last_reviewed_at: string | null;
};

/** `review_history` の1行。 */
export type RetentionEvent = {
  sticker_id: string;
  reviewed_at: string;
  interval_days_after: number;
  ease_after: number;
};

export type RetentionPoint = {
  day_offset: number;
  /** その日に数えられる語が無ければ `null`(0% ではない)。 */
  avg_retention: number | null;
  /** その日の平均に入った語の数。 */
  counted: number;
};

/** 記憶の状態 — 起点と安定度の組。 */
export type MemoryState = { anchorMs: number | null; stabilityDays: number };

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * そのカードが**いつから存在するか**。
 * 出会った日が第一。無ければ最初の復習、それも無ければ最後の復習。
 * どれも無ければ `null` = いつからか分からないので数え続ける(古い行の保険)。
 */
export function existsFrom(card: RetentionCard, events: RetentionEvent[]): number | null {
  const taken = ms(card.taken_at);
  if (taken != null) return taken;
  const first = events.length ? ms(events[0].reviewed_at) : null;
  if (first != null) return first;
  return ms(card.last_reviewed_at);
}

/**
 * `atMs` の時点でのそのカードの記憶の状態。
 * まだ存在しない日は `null` を返す — **平均から外す**ため。
 *
 * `events` はこのカードのぶんだけ、`reviewed_at` の昇順で渡すこと。
 */
export function cardStateAt(
  card: RetentionCard,
  events: RetentionEvent[],
  atMs: number,
): MemoryState | null {
  const from = existsFrom(card, events);
  if (from != null && atMs < from) return null;

  // その日までに**終わっていた**最後の復習を探す(後ろから)。
  for (let i = events.length - 1; i >= 0; i--) {
    const at = ms(events[i].reviewed_at);
    if (at != null && at <= atMs) {
      return {
        anchorMs: at,
        stabilityDays: stabilityOf(events[i].interval_days_after, events[i].ease_after),
      };
    }
  }

  // 記録が残っていないのに復習済みになっている古い行の保険。
  // (`review_history` はあとから足した表なので、それ以前の復習は残っていない)
  // 「最後の復習がその日より前なのに、その日以前の記録が1行も無い」ときだけ
  // ここに来る — 本当にまだ1度も復習していない期間は下の枝に落ちる。
  const last = ms(card.last_reviewed_at);
  if (last != null && last <= atMs) {
    return { anchorMs: last, stabilityDays: stabilityOf(card.interval_days, card.ease) };
  }

  // まだ1度も復習していない期間 — 起点は出会った日、安定度は初期値。
  return {
    anchorMs: from,
    stabilityDays: stabilityOf(INITIAL_INTERVAL_DAYS, INITIAL_EASE),
  };
}

/** 状態と時刻から定着度(0〜100)。起点が無ければ、まだ忘れる時間が経っていない。 */
export function retentionOf(state: MemoryState, atMs: number): number {
  if (state.anchorMs == null) return 100;
  const dt = (atMs - state.anchorMs) / DAY_MS;
  if (dt <= 0) return 100;
  return Math.max(0, Math.min(100, 100 * Math.exp(-dt / state.stabilityDays)));
}

export function groupEvents(events: RetentionEvent[]): Map<string, RetentionEvent[]> {
  const by = new Map<string, RetentionEvent[]>();
  for (const e of events) {
    const list = by.get(e.sticker_id);
    if (list) list.push(e);
    else by.set(e.sticker_id, [e]);
  }
  for (const list of by.values()) {
    list.sort((a, b) => new Date(a.reviewed_at).getTime() - new Date(b.reviewed_at).getTime());
  }
  return by;
}

export type RetentionSeries = {
  series: RetentionPoint[];
  /** 今この瞬間の平均(数えられる語が無ければ `null`)。 */
  avg_retention: number | null;
};

/**
 * 前後2週間の平均記憶率。
 *
 * 過去(`day_offset < 0`)は `events` から復元した**その日の状態**、
 * 未来(`day_offset >= 0`)は最後の復習=いまの状態からの予測になる
 * (同じ規則で自然にそうなる — 未来の日から見れば「最後の復習」は今日の復習)。
 */
export function buildRetentionSeries(input: {
  cards: RetentionCard[];
  events: RetentionEvent[];
  nowMs: number;
  back?: number;
  forward?: number;
}): RetentionSeries {
  const { cards, events, nowMs, back = 14, forward = 14 } = input;
  const byCard = groupEvents(events);

  function averageAt(atMs: number): { avg: number | null; counted: number } {
    let sum = 0;
    let n = 0;
    for (const card of cards) {
      const state = cardStateAt(card, byCard.get(card.sticker_id) ?? [], atMs);
      if (!state) continue;
      sum += retentionOf(state, atMs);
      n += 1;
    }
    return { avg: n ? Math.round(sum / n) : null, counted: n };
  }

  const series: RetentionPoint[] = [];
  for (let d = -back; d <= forward; d++) {
    const { avg, counted } = averageAt(nowMs + d * DAY_MS);
    series.push({ day_offset: d, avg_retention: avg, counted });
  }
  return { series, avg_retention: averageAt(nowMs).avg };
}
