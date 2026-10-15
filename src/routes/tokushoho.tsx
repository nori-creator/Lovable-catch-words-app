import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * 古い URL `/tokushoho` → `/legal/tokushoho`。iPhone アプリの初期のビルドがこの URL を開く
 * （iOS の `AppConfig.tokushohoURL`。新しいビルドは `/legal/tokushoho` を開く）。
 * `?lang=` は持ち越す（表示言語。`legal-lang.ts`）。
 */
export const Route = createFileRoute("/tokushoho")({
  validateSearch: (search: Record<string, unknown>) => ({
    lang: typeof search.lang === "string" ? search.lang : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/legal/tokushoho",
      search: { lang: search.lang },
      statusCode: 301,
    });
  },
});
