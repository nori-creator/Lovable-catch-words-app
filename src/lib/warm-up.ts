/**
 * **選ぶ前の下ごしらえをしてよいか**（PRODUCT.md › Catch「Start low-cost background
 * preparation for the most likely candidate after capture, before the user taps」、
 * ROADMAP Phase 3.5、2026-10-03）。
 *
 * 下ごしらえは「いちばん確からしい候補」の発音（作り置き・共有の置き場に在れば落とすだけ）と、
 * 「もう持っている語か」の確認（DB を1回引くだけ、AI は呼ばない）。どちらも押せば
 * どうせ取りに行く物なので、余分な AI の費用は増えない。
 *
 * それでも**通信を節約したい人と圏外では先に取らない**:
 * - `navigator.onLine === false`（圏外。取りに行っても失敗するだけ）
 * - `navigator.connection.saveData`（端末・ブラウザの「データセーバー」）
 * - `effectiveType` が `slow-2g` / `2g`（遅い回線で本番の通信の邪魔をしない）
 */
export type WarmUpNavigator = {
  onLine?: boolean;
  connection?: { saveData?: boolean; effectiveType?: string } | null;
};

export function canWarmUp(nav: WarmUpNavigator | null | undefined = globalNavigator()): boolean {
  if (!nav) return false;
  if (nav.onLine === false) return false;
  const c = nav.connection;
  if (c?.saveData) return false;
  if (c?.effectiveType === "slow-2g" || c?.effectiveType === "2g") return false;
  return true;
}

function globalNavigator(): WarmUpNavigator | null {
  return typeof navigator === "undefined" ? null : (navigator as unknown as WarmUpNavigator);
}

/**
 * 候補の一覧の中で、下ごしらえする1語（いちばん確からしい物）。並びは画面の1段目と
 * 同じ（`groupCandidates` の最初の束の代表）を渡してもらう。空なら null。
 */
export function warmUpTarget<T extends { headword: string }>(candidates: readonly T[]): T | null {
  const top = candidates.find((c) => c.headword.trim());
  return top ?? null;
}
