import { createFileRoute } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";
import { StickerDetailPage } from "@/components/screens/StickerDetailScreen";

/**
 * 画面の中身は `components/screens/StickerDetailScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/_authenticated/dex/$stickerId")({
  head: ({ params }) => ({
    meta: [
      {
        title: tStatic("page.cardDetail", {
          id: String(params.stickerId)
            .replace(/[^a-zA-Z0-9-]/g, "")
            .slice(0, 8),
        }),
      },
      {
        name: "description",
        content:
          "あなたが街でキャッチした言葉のカード詳細。意味・例文・発音、撮影場所、記憶曲線をまとめて確認できます。",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StickerDetailPage,
});
