import { useEffect, useState } from "react";

/**
 * **いま実際に見えている範囲**（キーボードを除いた高さと、その上端の位置）。
 *
 * iPhone の Safari はキーボードを出しても画面の高さ（`100dvh` / `inset: 0`）を縮めない。
 * 下に寄せた入力欄はキーボードの裏へ回り、Safari が打っている所を見せようと画面を
 * 押し上げるので、**入力欄の上の方（いま打っている行）が画面の外に出る**
 * （βテスト 2026-09-30「日記を書くときにキーボードで打つと書いている文字が見えなくなる」）。
 * 見えている範囲に合わせて置けば、欄はキーボードの上に収まる。
 *
 * `active` の間だけ見張る。取れないブラウザでは null（今までどおりの置き方）。
 */
export function useVisualViewport(active: boolean): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!active || !vv) {
      setBox(null);
      return;
    }
    const update = () => setBox({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return box;
}
