import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { NATIVE_FNS, publicMessage, statusForError } from "@/lib/native-fn";

/**
 * **iOS 版の入口: Web 版のサーバ関数をそのまま呼ぶ**（`/api/native-fn`）。
 * 一覧と理由は `src/lib/native-fn.ts`。
 *
 * 送る物: `POST { "fn": "generateCard", "data": { ... } }` と
 * `Authorization: Bearer <Supabase のアクセストークン>`。
 * 返す物: 成功 `{ "result": … }`（Web 版の関数の返り値そのまま）/
 * 失敗 `{ "error": "…" }` と 400 / 401 / 404 / 429 / 500。
 */
export const Route = createFileRoute("/api/native-fn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { fn?: unknown; data?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "送った内容の形が違います。" }, { status: 400 });
        }
        const name = typeof body.fn === "string" ? body.fn : "";
        const load = Object.prototype.hasOwnProperty.call(NATIVE_FNS, name)
          ? NATIVE_FNS[name]
          : undefined;
        if (!load) return Response.json({ error: "その機能はありません。" }, { status: 404 });
        try {
          const fn = await load();
          const result = await fn({ data: body.data });
          return Response.json({ result: result ?? null });
        } catch (e) {
          const status = statusForError(e);
          if (status >= 500) console.warn(`[native-fn] ${name} failed: ${(e as Error)?.message}`);
          return Response.json({ error: publicMessage(e) }, { status });
        }
      },
    },
  },
});
