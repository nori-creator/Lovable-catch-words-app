import { packBatch, readBatch, REVIEW_CACHE_USER_KEY } from "./review-cache";

/**
 * **ホームの写真の一覧を端末に書き留める**（R17「アプリのアイコンをタップしてから、ホーム画面の
 * 画像…が起動するまでが極端に遅くなった。タップしたら瞬間的に起動し、すべての画像を表示する
 * ように」）。
 *
 * ホームは開くたびに `listMyStickers`（全部の札と写真の署名URL）の返事を待ってから描いて
 * いた。前に届いた一覧をここに置き、次に開いた時は**最初の描画でそれを出す**。写真そのものは
 * 保存場所の道で端末から引く（`image-cache.tsx`）ので、署名URLが切れていても出る。
 * 新しい一覧は裏で届き次第差し替わる（React Query の `initialDataUpdatedAt`）。
 *
 * 誰の物か・古すぎないか・壊れていないかの判断は復習の束と同じ物（`review-cache.ts`）を使う。
 */
export const HOME_CACHE_KEY = "home-stickers-v1";
/** 大きすぎる一覧は書かない（端末の置き場所は 5MB ほど。復習の束と分け合う）。 */
const MAX_BYTES = 1_500_000;

export function readHomeSnapshot<T>(): { data: T; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const uid = localStorage.getItem(REVIEW_CACHE_USER_KEY) ?? "";
    if (!uid) return null;
    const got = readBatch<T>(localStorage.getItem(HOME_CACHE_KEY), uid, null, Date.now());
    return got ? { data: got.cards[0], at: got.at } : null;
  } catch {
    return null;
  }
}

export function writeHomeSnapshot<T>(data: T | undefined | null): void {
  if (typeof window === "undefined" || !data) return;
  try {
    const uid = localStorage.getItem(REVIEW_CACHE_USER_KEY);
    if (!uid) return;
    const packed = packBatch([data], uid, null, Date.now());
    if (!packed) return;
    const raw = JSON.stringify(packed);
    if (raw.length > MAX_BYTES) {
      localStorage.removeItem(HOME_CACHE_KEY);
      return;
    }
    localStorage.setItem(HOME_CACHE_KEY, raw);
  } catch {
    // 書けない端末では、毎回読み込むだけ（前と同じ）。
  }
}
