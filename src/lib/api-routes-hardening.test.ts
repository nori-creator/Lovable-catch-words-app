/**
 * 公開の口（`/api/native-ai`）を、そのまま呼んで確かめる（監査 2026-10-03）。
 * （3D の中継 `/api/object3d-model` は 2026-10-03 のオーナー決定で機能ごと外した。）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route as NativeAi } from "@/routes/api.native-ai";

type Handler = (ctx: { request: Request }) => Promise<Response>;
const handler = (route: unknown, method: "GET" | "POST") =>
  (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[
    method
  ];

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  delete process.env.NATIVE_AI_ENABLED;
});

describe("/api/native-ai", () => {
  it("NATIVE_AI_ENABLED が無ければ、ログインしていても 404（AI にも Supabase にも行かない）", async () => {
    const res = await handler(
      NativeAi,
      "POST",
    )({
      request: new Request("https://app.example/api/native-ai", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify({ feature: "text", prompt: "anything" }),
      }),
    });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
