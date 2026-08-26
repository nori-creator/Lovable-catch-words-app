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

const KEY = "review-session-v1";

export type SessionMark = {
  /** その束の目印。 */
  batch: string;
  /** 何枚目まで進んだか。 */
  idx: number;
  /** その回の成績（戻ったときに数え直しにしない）。 */
  answered: number;
  correct: number;
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
    s.setItem(KEY, JSON.stringify({ batch, ...mark }));
  } catch {
    /* storage unavailable */
  }
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/**
 * **`sessionStorage` を使う。** 続きから出すのはその日そのタブの話で、
 * 明日まで持ち越す物ではない（明日はもう別の束）。
 */
function browserStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
