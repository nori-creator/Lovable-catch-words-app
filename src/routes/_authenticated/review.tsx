import { createFileRoute } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";
import { ReviewPage } from "@/components/screens/ReviewScreen";

/**
 * 画面の中身は `components/screens/ReviewScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/_authenticated/review")({
  /**
   * `?sticker=<id>` — その1枚を先頭に置いて始める。
   * 場所の知らせを押したときの行き先。押した人は**その言葉**を思い出したくて
   * 押しているので、今日の順番の先頭に割り込ませる。
   */
  validateSearch: (search: Record<string, unknown>): { sticker?: string } => {
    return typeof search.sticker === "string" && search.sticker ? { sticker: search.sticker } : {};
  },
  head: () => ({
    meta: [
      { title: tStatic("page.review") },
      {
        name: "description",
        content: "自分の写真を見て、4択でその単語を思い出します。",
      },
    ],
  }),
  component: ReviewPage,
});
