import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { adsTxtBody } from "@/lib/adsense";

/**
 * **`/app-ads.txt`**（オーナー報告 2026-10-21: AdMob の「アプリの確認」で
 * 「app-ads.txt の詳細が AdMob アカウントの情報と一致しません」）。
 *
 * AdMob は App Store の「デベロッパ Web サイト」（`catchwords.lovable.app`）の一番上にある
 * `app-ads.txt` を読んでアプリの持ち主を確かめる。`/ads.txt`（Web の AdSense 用）は在ったが
 * `/app-ads.txt` が無く、アプリの画面（HTML）の 404 が返っていた。
 *
 * AdMob と AdSense は同じ Google アカウントの同じ運営者 ID（`pub-…`）なので、中身は
 * `/ads.txt` と同じ1行（`AdConfig.adsensePublisherId` から作る）。ID が無い間は 404。
 */
export const Route = createFileRoute("/app-ads.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { loadAdConfig } = await import("@/lib/ad-config.server");
        const body = adsTxtBody(await loadAdConfig());
        if (!body) {
          return new Response("", {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
