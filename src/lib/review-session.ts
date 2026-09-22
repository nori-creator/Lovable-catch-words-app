/**
 * **始めた復習を、別の画面へ行って戻っても続きから出す。**
 *
 * オーナー報告 2026-08-26:
 * > 「復習の問題が出るまでのラグが長い。また問題が出てきてから、
 * >  あのページに移ると問題が消え、また一から問題を表示するまでの
 * >  ラグが発生する。一度問題を表示したら別のページに移っても、
 * >  問題はそのままにして。」
 *
 * ## 消えていた理由は2つ
 * 1. 束の問い合わせが `staleTime: 0` だった。React Query は「古い」と
 *    見なした問い合わせを**画面に戻るたび投げ直す**。`getDueReviews` は
 *    その人の期限切れを全部読んで、写真の署名URLを作り、4択を組み、
 *    音を用意する — いちばん重い問い合わせが毎回走っていた。
 * 2. 何枚目まで進んだか(`idx`)が**画面の状態**だった。画面が外れた瞬間に
 *    0 に戻るので、戻ると1枚目からになる。
 *
 * ## ここが持つのは「何枚目か」だけ
 * 束そのものは React Query の持ち物（その仕組みに任せる）。ここは
 * **その束のどこまで進んだか**だけを憶える。束が入れ替わったら
 * （別の日・別の名指し・採点して読み直した後）位置は捨てる — 続きから
 * 出すつもりで、**別の束の3枚目**から始めてはいけない。
 *
 * ## 束が同じかを何で見るか
 * 先頭の `review_id` と枚数。IDが並ぶ順は server が決めていて、
 * 同じ束なら同じ順で返る。全部のIDを繋ぐと長くなるので、
 * **先頭と長さ**で足りる（違う束なら、ほぼ確実にどちらかが変わる）。
 */

import { REVIEW_CACHE_MAX_AGE_MS } from "./review-cache";

const KEY = "review-session-v1";

/**
 * ## 2026-09-18 の直し（同じ札を二度採点していた）
 * 束は `review-cache.ts` が `localStorage` に4時間書き留めるのに、続きの
 * 位置だけ `sessionStorage` だった。アプリを閉じて開くと、**同じ束が
 * 1枚目から**出て、答えた札がもう一度採点され、次に出す日が狂う。
 * 位置も束と同じ置き場所・同じ寿命にする。
 */
export type SessionMark = {
  /** その束の目印。 */
  batch: string;
  /** 何枚目まで進んだか。 */
  idx: number;
  /** その回の成績（戻ったときに数え直しにしない）。 */
  answered: number;
  correct: number;
  /** 書き留めた時刻。束の寿命(4時間)より古い位置は使わない。 */
  at?: number;
};

export const EMPTY_MARK: Omit<SessionMark, "batch"> = { idx: 0, answered: 0, correct: 0 };

/**
 * その束の目印を作る。
 *
 * **空の束は目印を持たない。** 空に目印を付けると、次に本物が届いた
 * ときに「同じ束だ」と誤って続きから出す。
 */
export function batchKey(
  cards: ReadonlyArray<{ review_id: string }> | null | undefined,
  wantedSticker?: string | null,
): string | null {
  if (!cards || cards.length === 0) return null;
  return `${wantedSticker ?? ""}:${cards[0].review_id}:${cards.length}`;
}

/** その束の続き。**別の束なら最初から。** */
export function readMark(
  batch: string | null,
  store?: Pick<Storage, "getItem"> | null,
): Omit<SessionMark, "batch"> {
  if (!batch) return EMPTY_MARK;
  const s = store ?? browserStore();
  if (!s) return EMPTY_MARK;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return EMPTY_MARK;
    const m = JSON.parse(raw) as Partial<SessionMark>;
    if (m?.batch !== batch) return EMPTY_MARK;
    // 束の寿命より古い位置は使わない（`at` が無い古い形はそのまま使う）。
    if (typeof m.at === "number" && Number.isFinite(m.at)) {
      const age = Date.now() - m.at;
      if (age < 0 || age > REVIEW_CACHE_MAX_AGE_MS) return EMPTY_MARK;
    }
    return {
      idx: numberOr(m.idx, 0),
      answered: numberOr(m.answered, 0),
      correct: numberOr(m.correct, 0),
    };
  } catch {
    return EMPTY_MARK;
  }
}

export function writeMark(
  batch: string | null,
  mark: Omit<SessionMark, "batch">,
  store?: Pick<Storage, "setItem" | "removeItem"> | null,
): void {
  const s = store ?? browserStore();
  if (!s) return;
  try {
    if (!batch) {
      s.removeItem(KEY);
      return;
    }
    s.setItem(KEY, JSON.stringify({ batch, ...mark, at: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/**
 * **`localStorage` を使う。** 束は `review-cache.ts` が `localStorage` に
 * 4時間書き留める。位置だけ `sessionStorage` にしていたので、アプリを
 * 閉じて開くと同じ束が1枚目から出て、**答えた札を二度採点**していた。
 * 置き場所と寿命を束に合わせる（古い位置は `readMark` が捨てる）。
 */
function browserStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
