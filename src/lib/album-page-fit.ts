/**
 * **本棚の本の左ページに、その日の写真を収め直す計算**（オーナー指示 2026-10-02「本棚の
 * アルバムの画像のバランスがホーム画面のアルバムの配置に合わせられていて、縦に長になっていて
 * 変だから、大きさやバランスを自動的に調整して」）。
 *
 * ホームのアルバムはスマホの幅で2列に積むので、写真が多い日は台紙が縦に長くなる
 * （幅の 2〜3 倍）。本のページは幅 : 高さ ≒ 3 : 4 なので、それをそのまま縮めると
 * **真ん中に細い1本の列**が立ち、左右が空く。
 *
 * そこで、ホームの置き方がページに無理なく収まらない日だけ、**列の数（1〜4）と写真の幅を
 * ページに合わせて選び直す**。並ぶ順はホームと同じ（撮った順）。
 *
 * 入るのは数だけ（canvas にも DOM にも触らない）ので、試験から直接呼べる。
 */

export type PageFitItem = {
  /** 写真の枠の縦横比（高さ / 幅）。字だけの札は 0（高さは `below` だけで決まる）。 */
  ratio: number;
  /** 写真の下に付く字（語・一言）の高さ。写真の幅 `w` によって変わる（字が折り返すため）。 */
  below: (w: number) => number;
};

export type PageFitBox = {
  /** 左上の位置と、写真の幅・写真の枠の高さ（字は含まない）。単位はページの px。 */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PageFit = {
  cols: number;
  boxes: PageFitBox[];
  /** 全体の高さ（字まで含む）。 */
  height: number;
};

/** 写真1枚の幅の上限（ページの幅に対する割合）。1〜2枚の日に1枚が紙いっぱいにならないように。 */
export const PAGE_FIT_MAX_W = 0.62;
/** 列の数の上限。これより細いと語が読めない。 */
export const PAGE_FIT_MAX_COLS = 4;
/** 隣の列を少しずらす量（写真の幅に対する割合）。升目のように揃うと「貼った」感じが消える。 */
export const PAGE_FIT_STAGGER = 0.12;

/**
 * ホームの置き方のまま貼って良いか。
 *
 * - `fit` … ホームの台紙をページに収めるのに要る縮み（1 = 縮めずに入る）。0.8 より縮めると
 *   写真が細い列になり、左右が目立って空く。
 * - `fill` … 収めた台紙がページの高さの何割を使うか。写真が少ない日は台紙が低く、
 *   ページの下半分が白いまま残る（6割に届かなければ、写真を大きくして並べ直す）。
 */
export function keepHomeLayout(fit: number, fill: number): boolean {
  return fit >= 0.8 && fill >= 0.6;
}

/** その列の数・写真の幅で積んだときの置き場所。 */
function stack(
  items: readonly PageFitItem[],
  cols: number,
  w: number,
  gap: number,
): { boxes: PageFitBox[]; height: number } {
  const bottom = Array.from({ length: cols }, (_, c) => (c % 2 === 1 ? w * PAGE_FIT_STAGGER : 0));
  const boxes = items.map((it) => {
    // いちばん上が空いている列へ（同じなら左）。
    let c = 0;
    for (let i = 1; i < cols; i++) if (bottom[i] < bottom[c] - 0.5) c = i;
    const h = w * Math.max(0, it.ratio);
    const box = { x: c * (w + gap), y: bottom[c], w, h };
    bottom[c] += h + it.below(w) + gap;
    return box;
  });
  return { boxes, height: Math.max(0, ...bottom) - gap };
}

/**
 * ページ（幅 `page.w`・高さ `page.h`）に収まる、**写真がいちばん大きくなる列の数と幅**を選ぶ。
 *
 * 列の数ごとに「収まる最大の幅」を二分探索で求め、幅の大きい方を採る。差が 4% 以内なら
 * 列の少ない方（1枚ずつが見やすい）。全体は横に真ん中へ寄せ、縦も余りを上下に分ける。
 */
export function fitAlbumPage(
  items: readonly PageFitItem[],
  page: { w: number; h: number },
  gap: number,
): PageFit {
  if (items.length === 0) return { cols: 1, boxes: [], height: 0 };
  let best: { cols: number; w: number } | null = null;
  const maxCols = Math.min(PAGE_FIT_MAX_COLS, items.length);
  for (let cols = 1; cols <= maxCols; cols++) {
    const colW = Math.min((page.w - gap * (cols - 1)) / cols, page.w * PAGE_FIT_MAX_W);
    if (colW <= 0) continue;
    let lo = 0;
    let hi = colW;
    if (stack(items, cols, hi, gap).height <= page.h) lo = hi;
    else {
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        if (stack(items, cols, mid, gap).height <= page.h) lo = mid;
        else hi = mid;
      }
    }
    if (lo <= 0) continue;
    if (!best || lo > best.w * 1.04) best = { cols, w: lo };
  }
  // どの列の数でも入らない（字だけで溢れる）時は、いちばん細い列で積む。
  const pick = best ?? { cols: maxCols, w: (page.w - gap * (maxCols - 1)) / maxCols };
  const { boxes, height } = stack(items, pick.cols, pick.w, gap);
  const used = Math.max(...boxes.map((b) => b.x + b.w));
  const dx = (page.w - used) / 2;
  const dy = Math.max(0, (page.h - height) / 2);
  return {
    cols: pick.cols,
    boxes: boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })),
    height,
  };
}
