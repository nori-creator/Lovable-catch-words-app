/**
 * 公開の口（`/api/native-ai`・`/api/object3d-model`）を、そのまま呼んで確かめる（監査 2026-10-03）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as NativeAi } from "@/routes/api.native-ai";
import { Route as Object3dModel } from "@/routes/api.object3d-model";

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

describe("/api/object3d-model", () => {
  const url = (target: string) =>
    new Request(`https://app.example/api/object3d-model?url=${encodeURIComponent(target)}`);
  const allowed = "https://tripo-data.rg1.data.tripo3d.com/model/abc.glb";

  it("転送を追わない設定で取りに行く", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(10)));
    const res = await handler(Object3dModel, "GET")({ request: url(allowed) });
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    expect(res.status).toBe(200);
  });

  it("content-length が上限を超える物は流さない", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(10), { headers: { "content-length": String(1024 ** 3) } }),
    );
    const res = await handler(Object3dModel, "GET")({ request: url(allowed) });
    expect(res.status).toBe(502);
  });
});
