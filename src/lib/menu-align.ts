/**
 * 開いた札を**画面の中に収める**ために、どちら側へ揃えるかを決める。
 *
 * ## なぜ要るか — 左端のボタンで札が画面の外へ出た
 * 図鑑の絞り込みの札を右揃え(`right-0`)で作ったら、**行の左端にある
 * 「カテゴリー」のボタンでは札が画面の左へはみ出して切れた**。
 * 検査(`ui:audit`)は横スクロールが出ないかは見るが、`position:absolute`
 * の札は横スクロールを作らずに**ただ切れる**ので、数では気づけない。
 * 絵で見つけた。
 *
 * 右端のボタンなら左揃えで同じことが起きる。**ボタンの位置で決める**
 * しかないので、その判断をここに置いてためす。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

export type MenuSide = "left" | "right";

/** 画面の縁に残す余白(px)。ぴったり端に着けない。 */
export const MENU_EDGE_MARGIN = 8;

/**
 * 札をボタンのどちら側に揃えるか。
 *
 * - 左揃え … 札は `[left, left + width]` を占める
 * - 右揃え … 札は `[right - width, right]` を占める
 *
 * **左を先に見る。** 読む向きと同じで、収まるならそのほうが素直。
 * どちらも収まらないときは左に倒す — そのときは札が画面より広いので、
 * 呼ぶ側の `max-width` が詰める仕事をする(切れる側を左右で選ぶより、
 * 常に同じ側から見えるほうが読み直しやすい)。
 */
export function pickMenuSide(box: {
  /** ボタンの左端(画面の座標)。 */
  left: number;
  /** ボタンの右端(画面の座標)。 */
  right: number;
  /** 札の幅。 */
  width: number;
  /** 画面の幅。 */
  viewport: number;
  margin?: number;
}): MenuSide {
  const margin = box.margin ?? MENU_EDGE_MARGIN;
  const fitsLeft = box.left + box.width <= box.viewport - margin;
  if (fitsLeft) return "left";
  const fitsRight = box.right - box.width >= margin;
  return fitsRight ? "right" : "left";
}
