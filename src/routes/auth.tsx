import { createFileRoute } from "@tanstack/react-router";
import { tStatic } from "@/lib/i18n";
import { siteUrlFor } from "@/lib/site-url";
import { AuthPage } from "@/components/screens/AuthScreen";

/**
 * 画面の中身は `components/screens/AuthScreen.tsx`。**このファイルからは `Route` 以外を出さない** —
 * 出すと TanStack の分割が効かず、画面の部品が最初に読む塊（entry）に入る（2026-10-03
 * 最初の読み込みの監査。`admin.users.tsx` と同じ形）。
 */
export const Route = createFileRoute("/auth")({
  // Preserve a same-origin `next` path so OAuth consent (or any protected
  // deep-link) can round-trip through sign-in and return to the original URL.
  validateSearch: (s: Record<string, unknown>): { next: string; mode?: "signin" | "signup" } => ({
    next: typeof s.next === "string" ? s.next : "",
    mode: s.mode === "signin" || s.mode === "signup" ? s.mode : undefined,
  }),
  head: () => ({
    meta: [
      { title: tStatic("page.auth") },
      {
        name: "description",
        content:
          "CatchWordsにサインインして、街で出会う言葉をステッカーに変えて自分だけの台湾華語の図鑑を作りましょう。",
      },
      { property: "og:title", content: "ログイン — CatchWords" },
      {
        property: "og:description",
        content:
          "CatchWordsにサインインして、街で出会う言葉をステッカーに変えて自分だけの台湾華語の図鑑を作りましょう。",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: siteUrlFor("/auth") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/auth") }],
  }),
  component: AuthPage,
});
