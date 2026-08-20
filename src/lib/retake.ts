/**
 * 「この語は、もう一度撮ったほうがいい」の判定。
 *
 * オーナーの言葉:
 * > 「その単語のユーザーの記憶の段階に合わせて出題の形を変える。
 * >  また**どうしても覚えられないものは、もう一度写真を撮ってみようと
 * >  提案する**。」
 *
 * ## なぜこのアプリだけが出せる提案なのか
 *
 * ふつうの単語アプリが「覚えられない語」にできることは、出す回数を増やすか、
 * 例文を足すかしかない。このアプリの札には**撮った場所と物**が付いている
 * ので、「その記憶ごと入れ替える」という手が残っている。同じ物をもう一度
 * 撮れば、新しい写真・新しい場所・新しい一言が付き、思い出す手がかりが
 * 増える(再会は `capture` の再会フローがそのまま拾う)。
 *
 * ## どう決めるか — 「回数」と「連続正解」を混同しない
 *
 * `reviews.repetitions` は**連続で正解した回数**で、つまずくたびに 0 に戻る
 * (`srs.ts` の `nextSrs`)。だから苦戦している語ほど `repetitions` は小さい。
 * 「何度もやったのに覚えられない」を見るには、`review_history` の**行数**
 * (= 通算の復習回数)を使う。ここを取り違えると、判定が真逆になる。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** これ未満の回数で「どうしても覚えられない」とは言わない。 */
export const MIN_REVIEWS = 4;
/** 間隔がここまでしか伸びていなければ、足踏みしている。 */
export const STUCK_INTERVAL_DAYS = 3;
/** つまずいた割合がこれを超えたら、覚え方そのものが合っていない。 */
export const LAPSE_RATIO = 0.4;
/** 記憶率がこれを下回れば、間隔に関わらず苦戦とみなす。 */
export const WEAK_RETENTION = 50;
/** すでにこれだけ撮っている語に、次の1枚を勧めない。 */
export const MAX_PHOTOS = 3;

export type RetakeInput = {
  /** 通算の復習回数(`review_history` の行数)。連続正解の回数ではない。 */
  reviewCount: number;
  /** 思い出せなかった回数(score < 3 の行数)。 */
  lapses: number;
  /** いまの復習間隔(日)。 */
  intervalDays: number;
  /** 現在の推定記憶率 0〜100。 */
  retention: number;
  /** その語でこれまでに撮った写真の枚数。分からなければ 1。 */
  photoCount?: number;
};

/**
 * なぜ勧めるのか。文面を出し分けるために理由を返す。
 * - `lapsing`  : 何度もつまずいている
 * - `stuck`    : 回数は重ねているのに間隔が伸びない
 * - `null`     : 勧めない
 */
export type RetakeReason = "lapsing" | "stuck" | null;

export function retakeReason(input: RetakeInput): RetakeReason {
  const { reviewCount, lapses, intervalDays, retention, photoCount = 1 } = input;
  // 数えていない値や壊れた値で勧めない。
  if (!Number.isFinite(reviewCount) || reviewCount < MIN_REVIEWS) return null;
  if (photoCount >= MAX_PHOTOS) return null;

  const ratio = reviewCount > 0 ? lapses / reviewCount : 0;
  if (ratio >= LAPSE_RATIO) return "lapsing";
  // つまずきは少ないのに間隔が伸びない/記憶率が落ちている語も、
  // 「思い出せてはいるが定着していない」ので撮り直す価値がある。
  if (intervalDays <= STUCK_INTERVAL_DAYS && retention < WEAK_RETENTION) return "stuck";
  return null;
}

export function needsRetake(input: RetakeInput): boolean {
  return retakeReason(input) !== null;
}

/** 文面の翻訳キー。理由ごとに言うことを変える。 */
export function retakeMessageKey(reason: Exclude<RetakeReason, null>): string {
  return reason === "lapsing" ? "retake.lapsing" : "retake.stuck";
}
