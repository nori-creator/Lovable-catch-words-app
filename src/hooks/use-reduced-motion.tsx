import { useEffect, useState } from "react";
import { MOTION_ATTR } from "@/lib/motion-pref";

/**
 * いま動きを減らすことになっているか。
 *
 * ## 端末の設定を直接見ない（2026-09-15 に変えた）
 * 前はここで `matchMedia("(prefers-reduced-motion: reduce)")` を直に見ていた。
 * そのため**本人がアプリ側で「見せて」を選んでも、JS の動きだけは止まった
 * まま**になる — CSS は `html[data-motion]` を見ているので、同じ画面の中で
 * 「CSS の動きは出るが、捕獲演出とタブの印だけ出ない」という、いちばん
 * 説明の付かない見え方になる。
 *
 * **答えは1つでなければいけない。** `<html data-motion>` が唯一の正で、
 * 端末の設定と本人の選択を混ぜた結果がそこに入っている（`lib/motion-pref.ts`
 * が数、`__root.tsx` の描画前スクリプトが最初の1枚、設定画面がその後）。
 * ここはそれを読むだけ。
 *
 * SSR では属性がまだ無いので `false`（＝動かす）に倒す。描画前スクリプトが
 * 最初の描画より前に属性を入れるので、`reduce` の人が動く絵を一瞬見ることは
 * ない。
 */
/**
 * フックではない版。**演出のように、React の外で一度だけ聞く所**から使う。
 *
 * 見る所はフックと同じ `<html data-motion>` ひとつ。ここで `matchMedia` を
 * 直に見ると、本人が「見せて」を選んでいても演出だけ止まる。
 */
export function motionReducedNow(): boolean {
  return (
    typeof document !== "undefined" && document.documentElement.dataset[MOTION_ATTR] === "reduce"
  );
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const read = () => setReduced(root.dataset[MOTION_ATTR] === "reduce");
    read();
    // 設定画面で選び直したら、その場で全部の動きが切り替わること。
    // 再読み込みを要る形にすると「効いていない」と読まれる。
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: [`data-${MOTION_ATTR}`] });
    return () => mo.disconnect();
  }, []);
  return reduced;
}
