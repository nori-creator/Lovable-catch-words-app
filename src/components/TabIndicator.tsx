import { SlidingIndicator } from "@/components/SlidingIndicator";

/**
 * 下のタブで、いま居る所を示す印。
 *
 * 中身は `SlidingIndicator` そのもの。**同じ物を設定の選択肢でも使う**ので
 * （オーナー指示 2026-09-15「全ての切り替え機能…必ず残像感、滑らか感を出して」）、
 * 動きと形の理由は全部あちらに書いてある。ここは下のタブぶんの寸法だけ:
 *
 *   ・幅  … タブ1つぶん（本物の `<li>` を測って決まる）
 *   ・高さ … 帯の内側の8割ほど（`inset-y-*`）
 *   ・丸み … 高さの3割（App Store と同じ角丸の長方形。真円ではない）
 */
export function TabIndicator({
  /** 指の位置(小数)。`tabIndex + progress`。タブの外に居るときは負。 */
  cursor,
  /** タブの数。**位置は本物の `<li>` から測るので、ここでは使わない。** */
  count,
}: {
  cursor: number;
  count: number;
}) {
  void count;
  return <SlidingIndicator index={cursor} className="bottom-2.5 top-2.5 left-0 bg-primary/12" />;
}
