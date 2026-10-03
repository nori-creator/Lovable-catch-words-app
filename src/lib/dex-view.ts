import { DEX_SHELF_ENABLED } from "@/lib/features";

/** 図鑑の見せ方。 */
export type ViewMode = "shelf" | "gallery" | "cards" | "list" | "map" | "calendar";

/**
 * 捕まえた直後に図鑑をどの見せ方で開くか。**本物の撮影とチュートリアルが同じ値を使う**
 * （チュートリアルが自分で決めると、図鑑の既定を変えたときに食い違う）。
 *
 * 図鑑の画面（`DexScreen.tsx`）とは別に置く — チュートリアルの最初の画面がこの値のために
 * 図鑑の画面まで読まないように（2026-10-03 最初の読み込みの監査）。
 */
export const JUST_CAUGHT_VIEW: ViewMode = DEX_SHELF_ENABLED ? "shelf" : "gallery";
