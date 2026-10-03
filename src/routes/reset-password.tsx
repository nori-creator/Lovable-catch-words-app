import { createFileRoute } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";
import { ResetPasswordPage } from "@/components/screens/ResetPasswordScreen";

/**
 * 画面の中身は `components/screens/ResetPasswordScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: tStatic("page.reset") },
      { name: "description", content: "CatchWordsのパスワードを再設定します。" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});
