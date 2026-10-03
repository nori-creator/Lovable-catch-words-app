import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { adsTxtBody } from "@/lib/web-ads";

/**
 * **`/ads.txt`**（Google AdSense の「この番号の人だけがこのサイトの広告を売ってよい」の表）。
 *
 * 番号（`ca-pub-…`）はオーナーの AdSense アカウントの物で、まだ決まっていない。偽の番号を
 * リポジトリに置かないよう、環境変数 `VITE_ADSENSE_CLIENT`（ブラウザの広告と同じ番号）から
 * その場で作る。サーバだけの `ADSENSE_CLIENT` でもよい。無ければ 404（AdSense は「見つからない」と
 * 出すだけで、広告の表示は止まらない）。手順は `docs/monetization.md` §5-2。
 */
export const Route = createFileRoute("/ads.txt")({
  server: {
    handlers: {
      GET: async () => {
        const fromServer = typeof process !== "undefined" ? process.env?.ADSENSE_CLIENT : undefined;
        const client = (fromServer || import.meta.env.VITE_ADSENSE_CLIENT || "").trim();
        const body = adsTxtBody(client || null);
        if (!body) {
          return new Response("Not found\n", {
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
