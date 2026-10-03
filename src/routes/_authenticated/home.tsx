import { createFileRoute } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";
import { HomePage } from "@/components/screens/HomeScreen";

/**
 * 画面の中身は `components/screens/HomeScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: tStatic("page.home") },
      { name: "description", content: "今日キャッチした言葉を一冊のスクラップアルバムに。" },
    ],
  }),
  /**
   * `?memorial=30`: 節目の通知から来た時、その記念アルバムを開く
   * （`lib/milestone-album.ts`、`lib/deep-link.ts`）。
   */
  validateSearch: (search: Record<string, unknown>): { memorial?: number } => {
    const m = Number(search.memorial);
    return Number.isInteger(m) && m > 0 && m < 100000 ? { memorial: m } : {};
  },
  component: HomePage,
});
