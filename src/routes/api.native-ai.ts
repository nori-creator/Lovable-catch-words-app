import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import {
  NATIVE_AI_ROUTING,
  NATIVE_AI_TIMEOUT_MS,
  NATIVE_AI_USAGE_KIND,
  NativeAiRequest,
  bearerToken,
  isDailyCapError,
  nativeAiEnabled,
} from "@/lib/native-ai";

/**
 * **iOS 版の AI 窓口**（`/api/native-ai`）。約束事と理由は `src/lib/native-ai.ts`。
 *
 * 返事は `{ "text": "AI の返事そのまま" }`。JSON の読み取りは iOS 側で行う
 * （Web 版と同じ寛容な読み取りを Swift に移植済み）。
 * 失敗時は `{ "error": "利用者に見せてよい日本語" }` と状態コード
 * （401 未ログイン / 400 形が違う / 429 上限 / 502 AI 側の失敗）。
 *
 * ## 既定では閉じてある（監査 2026-10-03）
 * ログインした人なら**誰でも好きな指示文を送れる** AI の中継になっていた（費用は
 * こちら持ち）。この repo の中で呼んでいる画面は無い（Web 版・`android/`・
 * `docs/ios-spec` を確認。iOS の設計は `/api/v1/*` の機能ごとの口で、指示文は
 * サーバが組む — `docs/ios-spec/00-architecture.md`）。なのでサーバの環境変数
 * `NATIVE_AI_ENABLED=1` が無い限り 404 を返す。iOS 版で使うことになったら、開ける前に
 * 自由な指示文をやめ、用途ごとにサーバで指示文を組む形にすること。
 */
export const Route = createFileRoute("/api/native-ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!nativeAiEnabled(process.env.NATIVE_AI_ENABLED)) {
          return new Response("Not Found", { status: 404 });
        }
        const token = bearerToken(request.headers.get("authorization"));
        if (!token) return fail(401, "ログインし直してください。");

        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) return fail(500, "サーバの設定が足りません。");
        const supabase = createClient(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: authError } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (authError || !userId) return fail(401, "ログインし直してください。");

        let input: NativeAiRequest;
        try {
          input = NativeAiRequest.parse(await request.json());
        } catch {
          return fail(400, "送った内容の形が違います。アプリを最新にしてください。");
        }

        const ai = await import("@/lib/ai-provider.server");
        const kind = NATIVE_AI_USAGE_KIND[input.feature];
        try {
          await ai.assertWithinDailyCap(userId, kind);
        } catch (e) {
          if (isDailyCapError(e)) return fail(429, (e as Error).message);
          throw e;
        }

        const route = NATIVE_AI_ROUTING[input.feature];
        const cfg = await ai.getAiFor(route.feature);
        const preferred = route.tier === "fast" ? cfg.modelFast : cfg.modelRich;
        const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
          { type: "text", text: input.prompt },
        ];
        if (input.imageBase64) content.push({ type: "image", image: input.imageBase64 });

        try {
          const text = await ai.withModelFallback(cfg, preferred, async (model) => {
            const r = await generateText({
              model: cfg.gateway(model),
              messages: [{ role: "user", content }],
              temperature: 0.2,
              abortSignal: AbortSignal.timeout(NATIVE_AI_TIMEOUT_MS[input.feature]),
            });
            return r.text;
          });
          // 上限の数え方は呼ぶ前に済ませてある（`assertWithinDailyCap` が1回ぶんを確保する）。
          return Response.json({ text });
        } catch (e) {
          console.warn(`[native-ai] ${input.feature} failed: ${(e as Error)?.message}`);
          return fail(502, "AIの解析に失敗しました。少し待ってからもう一度お試しください。");
        }
      },
    },
  },
});

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
