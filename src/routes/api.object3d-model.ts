import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { isAllowedModelUrl } from "@/lib/object3d";

/**
 * **3D の形（GLB）の中継**（`/api/object3d-model?url=…`）。Tripo の配信先は画面から直接
 * 読めない（CORS）ので、サーバが代わりに取って渡す。中継するのは Tripo の配信先だけ
 * （`isAllowedModelUrl`）— どこでも取りに行くと、このサーバが踏み台にされる。
 */
export const Route = createFileRoute("/api/object3d-model")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url") ?? "";
        if (!isAllowedModelUrl(url)) return new Response("not allowed", { status: 400 });
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
          if (!r.ok || !r.body) return new Response("upstream error", { status: 502 });
          return new Response(r.body, {
            headers: {
              "content-type": "model/gltf-binary",
              "cache-control": "private, max-age=3600",
            },
          });
        } catch {
          return new Response("upstream error", { status: 502 });
        }
      },
    },
  },
});
