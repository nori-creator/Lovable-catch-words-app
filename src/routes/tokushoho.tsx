import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * 古い URL `/tokushoho` → `/legal/tokushoho`。iPhone アプリの初期のビルドがこの URL を開く
 * （iOS の `AppConfig.tokushohoURL`。新しいビルドは `/legal/tokushoho` を開く）。
 */
export const Route = createFileRoute("/tokushoho")({
  beforeLoad: () => {
    throw redirect({ to: "/legal/tokushoho", statusCode: 301 });
  },
});
