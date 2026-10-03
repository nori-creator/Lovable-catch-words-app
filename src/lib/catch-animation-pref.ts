/**
 * **キャッチの演出の大きさ**（PRODUCT「Catch」・ROADMAP Phase 4 の 1〜3）。
 *
 * > Catch animation is user-configurable ON/OFF. Pronunciation remains a core learning
 * > behavior and should not be degraded merely because decorative animation is off.
 * > Normal repeated Catch animation should be short; reserve richer celebration for
 * > meaningful milestones.
 *
 * 画面全体の「動き」（`motion-pref.ts`。前庭障害のための設定）とは**別の設定**。
 * あちらは「動くものを全部減らすか」、こちらは「キャッチを毎回どれだけ祝うか」。
 *
 * | 選択 | 普段のキャッチ | 節目（1・10・50・100・250… 匹目 / 新しいカテゴリー） |
 * |---|---|---|
 * | `full`  | しっかり（今までの演出と BGM） | しっかり |
 * | `short`（既定） | 短く（飛んで・読んで・収まる。BGM と紙吹雪なし） | しっかり |
 * | `off`   | 飛ばさない（発音と軽い振動だけ） | 飛ばさない |
 *
 * どの選択でも**語は必ず読む**（発音はこのアプリの学びの芯）。
 *
 * ここには外の世界に触れるものを入れない（`localStorage` を触るのは下の
 * 読み書きの2つだけで、どちらも失敗を飲み込む）。
 */

export type CatchAnimationChoice = "full" | "short" | "off";

/** 実際に走らせる演出。 */
export type CatchAnimationPlan = "full" | "short" | "off";

export const CATCH_ANIMATION_STORAGE_KEY = "catch-animation-v1";
export const CATCH_ANIMATION_EVENT = "catch-animation-changed";

/** 既定は「短く」（毎回の長い祝福は、2回目から待ち時間になる）。 */
export const DEFAULT_CATCH_ANIMATION: CatchAnimationChoice = "short";

/**
 * 節目の数。**この匹目を捕まえた回**だけ大きく祝う。
 * 1 は最初の1匹（チュートリアルの1枚目もここに入る）。
 */
export const CATCH_MILESTONES: readonly number[] = [1, 10, 50, 100, 250, 500, 1000];

export function parseCatchAnimation(value: unknown): CatchAnimationChoice {
  return value === "full" || value === "short" || value === "off" ? value : DEFAULT_CATCH_ANIMATION;
}

/**
 * 今回のキャッチは節目か。
 *
 * @param previousCount 今回の前に持っていた札の数。**分からなければ null**
 *   （一覧をまだ読めていない）— その時は「最初の1匹かもしれない」側へ倒して祝う。
 *   祝い過ぎは1回の長い演出で済むが、最初の1匹を素っ気なく流すと取り戻せない。
 * @param newCategory この語で初めてのカテゴリー（棚）が増えたか。
 * @param reencounter 既に持っている語の再会か（数は増えないので節目にしない）。
 */
export function isCatchMilestone({
  previousCount,
  newCategory = false,
  reencounter = false,
}: {
  previousCount: number | null | undefined;
  newCategory?: boolean;
  reencounter?: boolean;
}): boolean {
  if (reencounter) return false;
  if (newCategory) return true;
  if (previousCount == null || !Number.isFinite(previousCount)) return true;
  return CATCH_MILESTONES.includes(Math.max(0, Math.floor(previousCount)) + 1);
}

/**
 * 選択と節目から、走らせる演出を決める。
 * 画面全体の「動きを減らす」は呼ぶ側（`runCatchLanding`）が先に見る — そちらは
 * 健康のための設定なので、ここでの選択より優先する。
 */
export function planCatchAnimation(
  choice: CatchAnimationChoice,
  milestone: boolean,
): CatchAnimationPlan {
  if (choice === "off") return "off";
  if (choice === "full") return "full";
  return milestone ? "full" : "short";
}

export function readCatchAnimation(): CatchAnimationChoice {
  try {
    return parseCatchAnimation(globalThis.localStorage?.getItem(CATCH_ANIMATION_STORAGE_KEY));
  } catch {
    return DEFAULT_CATCH_ANIMATION;
  }
}

export function writeCatchAnimation(choice: CatchAnimationChoice): void {
  try {
    globalThis.localStorage?.setItem(CATCH_ANIMATION_STORAGE_KEY, choice);
    globalThis.dispatchEvent?.(new Event(CATCH_ANIMATION_EVENT));
  } catch {
    /* 使えない環境では既定のまま */
  }
}

/**
 * 「今回の前に何枚持っていたか」を教える口。
 *
 * 演出（`runCatchLanding`）は React の外で走るので、一覧のキャッシュを直接は見られない。
 * キャッシュを持つ所（`router.tsx` の QueryClient）がここに読み方を登録する。
 * 撮る画面（`CaptureScreen`）を書き換えずに節目を判定するための継ぎ目。
 */
type CollectionReader = () => {
  count: number | null;
  has: (stickerId: string) => boolean;
} | null;

let reader: CollectionReader = () => null;

export function registerCollectionReader(next: CollectionReader): void {
  reader = next;
}

export function readCollection(): ReturnType<CollectionReader> {
  try {
    return reader();
  } catch {
    return null;
  }
}
