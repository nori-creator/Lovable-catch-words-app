import { warmCachedImages } from "@/lib/image-cache";
import { wordBelongsToTarget } from "@/lib/language-filter";
import {
  packBatch,
  readBatch,
  REVIEW_CACHE_USER_KEY,
  REVIEW_TARGET_CACHE_KEY,
} from "@/lib/review-cache";
import type { DueReviewCard } from "@/lib/reviews.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { getTargetLang } from "@/lib/target-lang-pref";

/**
 * **その1語から始まる復習を、押される前に用意しておく**（オーナー指示 2026-10-07
 * 「通知をタップしたらすぐに問題出るようにして。今日の問題を準備中と言う待ち時間無しで。
 * 通知を出すときは復習の画面を用意してからにして」）。
 *
 * `getDueReviews({ sticker_id })`（その語が先頭、続きは普通の復習）を読み、写真を端末へ落とし、
 * 名指しの束として書き留める（`REVIEW_TARGET_CACHE_KEY`）。`/review?sticker=…` を開いた
 * 最初の描画でこれが出る（`ReviewScreen.tsx` の `composeWantedBatch`）。
 *
 * 使う所:
 * - 復習の通知（`ReviewReminderWatcher`）: **予約する前に**呼び、用意できた時だけその語の
 *   通知にする。端末の予約通知は鳴る時に何もできないので、「出す前に用意」＝「予約する時に
 *   用意」。`until` に最後の通知の時刻＋猶予を渡し、鳴った後も束が生きているようにする。
 * - ホームの「〇か月前に撮ったこの単語、覚えてる？」（`ResurfaceCard`）: 札を出した時。
 *
 * 返り値は用意できたか。できなければ呼ぶ側は「その語から」を約束しない。
 */

/** 用意してからこれより新しければ、読み直さずに使い回す（いちばん重い問い合わせなので）。 */
export const PREPARED_REUSE_MS = 60 * 60_000;
/** 写真を落とすのを待つ上限。遅い回線で予約そのものが遅れないように。 */
const WARM_TIMEOUT_MS = 15_000;

export async function prepareTargetedReview(
  fetchDue: (opts: { data: { sticker_id: string } }) => Promise<DueReviewCard[]>,
  stickerId: string,
  opts: { until?: number; now?: number } = {},
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let uid: string | null = null;
  try {
    uid = localStorage.getItem(REVIEW_CACHE_USER_KEY);
  } catch {
    return false;
  }
  if (!uid) return false;
  const now = opts.now ?? Date.now();
  try {
    const have = readBatch<DueReviewCard>(
      localStorage.getItem(REVIEW_TARGET_CACHE_KEY),
      uid,
      stickerId,
      now,
    );
    if (have && now - have.at < PREPARED_REUSE_MS) {
      // 中身は新しいので、使ってよい期限だけ延ばす。
      if (opts.until && opts.until > (have.until ?? 0)) {
        localStorage.setItem(
          REVIEW_TARGET_CACHE_KEY,
          JSON.stringify({ ...have, until: opts.until }),
        );
      }
      return true;
    }
  } catch {
    /* 読めなければ用意し直す */
  }
  try {
    const cards = await fetchDue({ data: { sticker_id: stickerId } });
    // その語が先頭に来なかった（復習の記録が無い・消えた）なら、その語からは始められない。
    if (!cards?.length || cards[0].sticker_id !== stickerId) return false;
    // 画面は学習言語でない札の混じった束を出さない（`ReviewScreen.tsx`）。同じ規則で弾く。
    const target = getTargetLang();
    if (!cards.every((c) => wordBelongsToTarget(c, target))) return false;
    await Promise.race([
      warmCachedImages(
        cards.flatMap((c) => [
          stickerPhotoUrl(c, { prefer: "cutout" }),
          stickerPhotoUrl(c, { prefer: "photo" }),
        ]),
      ).catch(() => undefined),
      new Promise((r) => setTimeout(r, WARM_TIMEOUT_MS)),
    ]);
    const packed = packBatch(cards, uid, stickerId, Date.now(), opts.until);
    if (!packed) return false;
    localStorage.setItem(REVIEW_TARGET_CACHE_KEY, JSON.stringify(packed));
    return true;
  } catch {
    return false;
  }
}

/** 名指しの束を捨てる（その束を出し切った後。同じ並びをもう一度出さない）。 */
export function dropTargetedReview(stickerId: string): void {
  try {
    const raw = localStorage.getItem(REVIEW_TARGET_CACHE_KEY);
    if (!raw) return;
    const b = JSON.parse(raw) as { wanted?: unknown };
    if (b?.wanted === stickerId) localStorage.removeItem(REVIEW_TARGET_CACHE_KEY);
  } catch {
    /* 消せなくても、`until` を過ぎれば使われない */
  }
}
