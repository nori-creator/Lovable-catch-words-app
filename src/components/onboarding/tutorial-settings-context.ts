import { createContext, useContext } from "react";

/**
 * 下のタブの「設定」から開く口（`FirstCatchShell` が読む）。
 *
 * 設定画面（`TutorialSettings.tsx`）とは別のファイルに置く — あちらは設定画面の部品を読むので、
 * ここから読めばホームのタブは設定画面を最初に読まずに済む（2026-10-03）。
 */
export const TutorialSettingsContext = createContext<(() => void) | null>(null);
export function useOpenTutorialSettings() {
  return useContext(TutorialSettingsContext);
}
