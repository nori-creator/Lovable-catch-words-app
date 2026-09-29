/**
 * **いま画面を巻き取っているのは誰か**（窓そのもの か アプリの殻 か）。
 *
 * オーナー報告 2026-09-28「アプリをしたにスクロールすると下のバーが隠れる」。
 * iOS 26 の Safari には、ページ全体を巻き取って道具バーが縮む間、下端に固定した
 * 物が**正しい位置に描かれない**不具合がある（Apple Developer Forums 801028 /
 * mastodon#36144。Web Inspector 上の位置は正しいのに絵がずれる。Apple 側の修正は
 * 未確認）。そこで指で触る端末では**ページ全体を巻き取らない**: 殻
 * （`[data-app-shell]`）だけを巻き取らせる。道具バーが縮まないので、下のバーは
 * ずれようがない（`styles.css` の `html[data-scroll-root="shell"]`）。
 *
 * 印は `__root.tsx` の頭の小さな script が最初の描画の前に立てる。
 */
export const SCROLL_ROOT_ATTR = "scrollRoot";

/** 殻が巻き取り役か（指の端末で、殻がいまある時）。 */
export function shellScrolls(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.dataset[SCROLL_ROOT_ATTR] === "shell" &&
    !!document.querySelector("[data-app-shell]")
  );
}

/** 巻き取っている要素（殻、でなければ文書）。 */
export function scrollRoot(): Element | null {
  if (typeof document === "undefined") return null;
  if (shellScrolls()) return document.querySelector("[data-app-shell]");
  return document.scrollingElement ?? document.documentElement;
}

/** 今どれだけ巻き取ったか（縦）。 */
export function scrollTopNow(): number {
  if (typeof window === "undefined") return 0;
  const root = scrollRoot();
  return Math.max(window.scrollY || 0, root?.scrollTop ?? 0);
}

/** 巻き取りを少し動かす（`window.scrollBy` の代わり）。 */
export function scrollByY(dy: number): void {
  const root = scrollRoot();
  if (root && shellScrolls()) root.scrollBy(0, dy);
  else if (typeof window !== "undefined") window.scrollBy(0, dy);
}

/**
 * 印を立て直す（頭の script が立てた印が、描画の作り直しで消えても戻す）。
 * 殻が現れた時に呼ぶ。指の端末でなければ何もしない。
 */
export function ensureScrollRootMark(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.matchMedia("(pointer: coarse)").matches)
      document.documentElement.dataset[SCROLL_ROOT_ATTR] = "shell";
  } catch {
    // matchMedia が無い環境は今まで通り（ページ全体を巻き取る）。
  }
}
