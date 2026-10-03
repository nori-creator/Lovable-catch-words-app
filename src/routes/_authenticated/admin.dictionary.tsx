import { createFileRoute } from "@tanstack/react-router";
import { DictionaryAdminPage } from "@/components/screens/AdminDictionaryScreen";

/**
 * 画面の中身は `components/screens/AdminDictionaryScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/_authenticated/admin/dictionary")({
  head: () => ({ meta: [{ title: "辞書管理 — CatchWords" }] }),
  component: DictionaryAdminPage,
});
