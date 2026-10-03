import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  MAX_MODEL_BYTES,
  capByteStream,
  declaredTooLarge,
  isAllowedModelUrl,
} from "@/lib/object3d";

/**
 * **3D の形（GLB）の中継**（`/api/object3d-model?url=…`）。Tripo の配信先は画面から直接
 * 読めない（CORS）ので、サーバが代わりに取って渡す。中継するのは Tripo の配信先だけ
 * （`isAllowedModelUrl`）— どこでも取りに行くと、このサーバが踏み台にされる。
 *
 * - **転送（redirect）は追わない**（監査 2026-10-03）。許した配信先が別の場所へ
 *   飛ばすと、`isAllowedModelUrl` を通らない場所を取りに行ってしまう。
 * - **大きさに上限**（`MAX_MODEL_BYTES`）。`content-length` で先に断り、流れてくる
 *   量も数えて超えたら止める。
 */
export const Route = createFileRoute("/api/object3d-model")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url") ?? "";
        if (!isAllowedModelUrl(url)) return new Response("not allowed", { status: 400 });
        try {
          const r = await fetch(url, {
            redirect: "error",
            signal: AbortSignal.timeout(60_000),
          });
          if (!r.ok || !r.body) return new Response("upstream error", { status: 502 });
          if (declaredTooLarge(r.headers.get("content-length"), MAX_MODEL_BYTES)) {
            await r.body.cancel().catch(() => undefined);
            return new Response("model too large", { status: 502 });
          }
          return new Response(capByteStream(r.body, MAX_MODEL_BYTES), {
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
