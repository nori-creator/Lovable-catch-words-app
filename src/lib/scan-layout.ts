/**
 * スキャン結果の面の置き方（描画から切り離した計算だけ）。
 *
 * ## 写真と光の点の位置を一致させる
 * 撮った写真は**覗いていた映像と同じ見え方**（画面いっぱい・`object-cover`）
 * で止める。以前は写真を「下のシートの上端まで」の短い箱に `object-cover`
 * で押し込み、光の点は箱に**そのまま比例**させて置いていた。箱の縦横比が
 * 写真と違うと写真の上下が切り落とされるのに、点は切り落としを知らない —
 * **点が物からずれる**。しかも箱の下はカメラの黒い地がむき出しで、
 * 「候補の下に黒い余白」（オーナー指摘 2026-09-22）になっていた。
 */

/** 検出の座標は写真全体に対する 0〜1000。 */
export type NormPoint = [number, number];

/**
 * `object-cover` で箱いっぱいに置いた写真の上の、ある点の位置（px）。
 * 写真は縦横比を保ったまま拡大し、はみ出た分を左右（または上下）均等に切る。
 */
export function coverPoint(
  [x, y]: NormPoint,
  img: { w: number; h: number },
  box: { w: number; h: number },
): { left: number; top: number } {
  if (img.w <= 0 || img.h <= 0 || box.w <= 0 || box.h <= 0) {
    return { left: (x / 1000) * box.w, top: (y / 1000) * box.h };
  }
  const s = Math.max(box.w / img.w, box.h / img.h);
  const ox = (box.w - img.w * s) / 2;
  const oy = (box.h - img.h * s) / 2;
  return { left: ox + (x / 1000) * img.w * s, top: oy + (y / 1000) * img.h * s };
}

/**
 * 点を**押せる範囲**に収める。下は操作シートの上端より上（点の下に付く
 * 語の札の分も空ける）、左右と上は端から少し内側。
 *
 * シートの裏に入った点は押せないうえ、候補を選んだときに「光が大きく
 * なって揺れる」のも見えない。物からは少しずれるが、見えて押せる方を取る。
 */
export function clampToVisible(
  p: { left: number; top: number },
  area: { w: number; bottom: number },
  margin = { side: 24, top: 56, bottom: 48 },
): { left: number; top: number } {
  const maxTop = Math.max(margin.top, area.bottom - margin.bottom);
  return {
    left: Math.min(Math.max(p.left, margin.side), Math.max(margin.side, area.w - margin.side)),
    top: Math.min(Math.max(p.top, margin.top), maxTop),
  };
}

/**
 * 横に流れる候補の列で、**いま真ん中にある**のはどれか。
 * 端まで送ったときは端の1つ（真ん中まで来られない端の候補も選べるように）。
 */
export function focusedIndex(
  items: Array<{ left: number; width: number }>,
  view: { scrollLeft: number; width: number; scrollWidth: number },
): number {
  if (items.length === 0) return -1;
  if (view.scrollLeft <= 2) return 0;
  if (view.scrollLeft + view.width >= view.scrollWidth - 2) return items.length - 1;
  const center = view.scrollLeft + view.width / 2;
  let best = 0;
  let bestDist = Infinity;
  items.forEach((it, i) => {
    const d = Math.abs(it.left + it.width / 2 - center);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}
