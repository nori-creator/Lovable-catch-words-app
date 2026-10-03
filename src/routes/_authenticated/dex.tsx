import { createFileRoute } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";
import { DexPage } from "@/components/screens/DexScreen";

/**
 * 画面の中身は `components/screens/DexScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/_authenticated/dex")({
  validateSearch: (search: Record<string, unknown>): { justCaught?: string } => {
    // キャッチ演出v2: /dex?justCaught=<stickerId> で該当セルがバンと着弾する
    return typeof search.justCaught === "string" && search.justCaught
      ? { justCaught: search.justCaught }
      : {};
  },
  head: () => ({
    meta: [
      { title: tStatic("page.dex") },
      {
        name: "description",
        content: "あなたがキャッチした言葉だけの図鑑。撮ったものから自動でカテゴリーが生まれます。",
      },
    ],
  }),
  component: DexPage,
});
