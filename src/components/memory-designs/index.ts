/**
 * 復習画面の「記憶の状態」のデザイン案（オーナー指示 2026-10-02「記憶の状態のグラフの
 * デザイン案を複数提案して」）。**本番の画面はまだ使っていない** — 見比べは
 * `?scene=memory-designs`（`scripts/ui-harness/scenes/memory-designs.tsx`）。
 *
 * 選ばれた案は `ReviewSessionHeader`（`routes/_authenticated/review.tsx`）の
 * 記憶の帯・一覧・折れ線の位置へ、同じ props（`MemoryDesignProps`）で差し替える。
 * 選ばれなかった案はこのフォルダごと消す。
 */
export { MemoryDesignA } from "./DesignA";
export { MemoryDesignB } from "./DesignB";
export { MemoryDesignC } from "./DesignC";
export { MemoryDesignD } from "./DesignD";
export type { MemoryDesignProps } from "./shared";
