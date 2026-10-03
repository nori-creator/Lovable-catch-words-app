import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { adsTxtBody } from "@/lib/adsense";

/**
 * **`/ads.txt`**（オーナー指示 2026-10-03「アプリ内の広告が動く 機能するようにしたい。」）。
 *
 * Google AdSense は、サイトの一番上（`https://catchwords.lovable.app/ads.txt`）に
 * 「この運営者の広告を売ってよい」という1行を置くことを強く勧めている。`ads.txt` が
 * 在るのに運営者 ID が載っていないと、広告の注文が断られる。
 *
 * 中身は開発者の設定（`AdConfig.adsensePublisherId`）から作るので、設定に ID を
 * 貼るだけで出る。ID が無い間は 404（空の `ads.txt` を置くと「載っていない」扱いになる）。
 * 広告のオン・オフとは関係なく出す — 審査はオンにする前に受けるため。
 */
export const Route = createFileRoute("/ads.txt")({
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
