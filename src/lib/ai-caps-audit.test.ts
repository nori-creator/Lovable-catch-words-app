/**
 * 監査 2026-10-03 の AI の費用の乱用よけを、動かして確かめる。
 * - 絵の生成は枠を確保してから（`searchImagesWith`、H3）
 * - その人の回数は1回で数えて入れる（`reserveUsageRow`、M1）
 * - 外から取る画像の大きさの上限（`readCappedBytes`、L6）
 * - チュートリアルの上限の失敗を画面のコードに直す（`firstCatchCapError`、H4/M8）
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  },
}));

import { searchImagesWith } from "./images.functions";
import { dailyCapMessage, GLOBAL_CAP_MESSAGE } from "./ai-cap";
import { isMissingRpc, reserveUsageRow, type UsageReserveDb } from "./usage-reserve";
import { MAX_PROXY_IMAGE_BYTES, TOO_LARGE_MESSAGE, readCappedBytes } from "./byte-cap";
import { firstCatchCapError } from "./first-catch-ai.server";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("IMAGE_PROVIDER", "lovable");
  vi.stubEnv("LOVABLE_API_KEY", "test-only");
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const generated = () =>
  new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
    headers: { "content-type": "application/json" },
  });

describe("searchImagesWith — 絵の生成の枠（H3）", () => {
  it("text-catch: 枠を確保してから作る", async () => {
    const order: string[] = [];
    fetchMock.mockImplementation(async () => {
      order.push("generate");
      return generated();
    });
    const out = await searchImagesWith(
      { query: "柚子", language: "zh-TW", purpose: "text-catch" },
      async () => {
        order.push("reserve");
      },
    );
    expect(order).toEqual(["reserve", "generate"]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].source).toBe("ai");
  });

  it("text-catch: 枠に届いたら**作らずに**上限の理由を返す", async () => {
    await expect(
      searchImagesWith({ query: "柚子", language: "zh-TW", purpose: "text-catch" }, async () => {
        throw new Error(dailyCapMessage(20));
      }),
    ).rejects.toThrow("AI_DAILY_CAP");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("写真の候補: 枠に届いたら絵は作らず、写真の候補だけで続ける", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("commons")) return new Response(JSON.stringify({}));
      throw new Error("should not generate");
    });
    const out = await searchImagesWith(
      { query: "柚子", language: "zh-TW", purpose: "candidates" },
      async () => {
        throw new Error(GLOBAL_CAP_MESSAGE);
      },
    );
    expect(out.candidates).toEqual([]);
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes("commons"))).toBe(true);
  });

  it("写真の候補: AI への送信に同意していなければ、絵は作らず写真の候補だけで続ける", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("commons")) return new Response(JSON.stringify({}));
      throw new Error("should not generate");
    });
    const out = await searchImagesWith(
      { query: "柚子", language: "zh-TW", purpose: "candidates" },
      async () => {
        throw new Error("AI_CONSENT_REQUIRED: test");
      },
    );
    expect(out.candidates).toEqual([]);
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes("commons"))).toBe(true);
  });

  it("生成を切ってある（off）時は枠を使わない", async () => {
    vi.stubEnv("IMAGE_PROVIDER", "off");
    const reserve = vi.fn(async () => undefined);
    const out = await searchImagesWith(
      { query: "柚子", language: "zh-TW", purpose: "text-catch" },
      reserve,
    );
    expect(out.candidates).toEqual([]);
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe("reserveUsageRow — その人の回数を1回で確保する（M1）", () => {
  function db(rpc: { data: unknown; error: { code?: string; message?: string } | null }) {
    const calls: string[] = [];
    let count = 0;
    const d = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${fn}:${JSON.stringify(args)}`);
        return rpc;
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: async () => {
                calls.push("count");
                return { count, error: null };
              },
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => {
              calls.push("insert");
              count++;
              return { data: { id: 900 + count }, error: null };
            },
          }),
        }),
      }),
    } as unknown as UsageReserveDb;
    return { d, calls };
  }

  it("関数の返した番号を返す（数えると入れるは関数の中で1回）", async () => {
    const { d, calls } = db({ data: 42, error: null });
    expect(await reserveUsageRow(d, "u1", "card", 200, "2026-10-02T00:00:00Z")).toBe(42);
    expect(calls).toEqual([
      'rpc:reserve_usage_event:{"p_user_id":"u1","p_kind":"card","p_limit":200,"p_since":"2026-10-02T00:00:00Z"}',
    ]);
  });

  it("上限なら null", async () => {
    const { d } = db({ data: null, error: null });
    expect(await reserveUsageRow(d, "u1", "card", 200, "x")).toBeNull();
  });

  it("関数があるのに失敗したら投げる（閉じる側）", async () => {
    const { d, calls } = db({ data: null, error: { code: "57014", message: "timeout" } });
    await expect(reserveUsageRow(d, "u1", "card", 200, "x")).rejects.toThrow("timeout");
    expect(calls).toHaveLength(1);
  });

  it("移行を流す前（関数が無い）は前の数え方で動く", async () => {
    const { d, calls } = db({ data: null, error: { code: "PGRST202", message: "not found" } });
    expect(await reserveUsageRow(d, "u1", "card", 1, "x")).toBe(901);
    expect(await reserveUsageRow(d, "u1", "card", 1, "x")).toBeNull();
    expect(calls.filter((c) => c === "insert")).toHaveLength(1);
  });

  it("関数が無いことの見分け", () => {
    expect(isMissingRpc({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpc({ code: "42883" })).toBe(true);
    expect(
      isMissingRpc({ message: "Could not find the function public.reserve_usage_event" }),
    ).toBe(true);
    expect(isMissingRpc({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
  });
});

describe("readCappedBytes — 外から取る中身の上限（L6）", () => {
  it("上限の内側は全部読む", async () => {
    const bytes = await readCappedBytes(new Response(new Uint8Array([1, 2, 3])), 10);
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("content-length が上限を超えていたら読まずに断る", async () => {
    const res = new Response("x", {
      headers: { "content-length": String(MAX_PROXY_IMAGE_BYTES + 1) },
    });
    await expect(readCappedBytes(res, MAX_PROXY_IMAGE_BYTES)).rejects.toThrow(TOO_LARGE_MESSAGE);
  });

  it("content-length が無くても、流れてくる量が上限を超えたら止める", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(4));
      },
    });
    await expect(readCappedBytes(new Response(body), 10)).rejects.toThrow(TOO_LARGE_MESSAGE);
    expect(pulled).toBeLessThan(10);
  });
});

describe("firstCatchCapError — チュートリアルが読めるコードに直す", () => {
  it.each([
    [dailyCapMessage(24), "FIRST_CATCH_LIMIT"],
    [GLOBAL_CAP_MESSAGE, "FIRST_CATCH_TRIAL_FULL"],
    ["AI_USAGE_CHECK_FAILED x", "FIRST_CATCH_AI_UNAVAILABLE"],
    ["other", "other"],
  ])("%s → %s", (input, code) => {
    expect(firstCatchCapError(new Error(input)).message).toBe(code);
  });
});

describe("呼ぶ所の形（動かせない server fn は書き方で見張る）", () => {
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, rel), "utf8");

  it("スキャンの並べ替え（Jev）は上限に数え、届いたら並べ替えずに返す（M7）", () => {
    const jev = src("jev.functions.ts");
    const cap = jev.indexOf('assertWithinDailyCap(context.userId, "jev_rank")');
    expect(cap).toBeGreaterThan(-1);
    expect(cap).toBeLessThan(jev.indexOf("askJev("));
    expect(jev).toMatch(/if \(!isAiCapError\(e\)\) throw e;\s*return \{ order: null/);
  });

  it("スキャンの印（markScanTap / markScanCaught）の見出しは 100 字まで（M2）", () => {
    const scan = src("scan.functions.ts");
    for (const fn of ["markScanTap", "markScanCaught"]) {
      const at = scan.indexOf(`export const ${fn} =`);
      const body = scan.slice(at, scan.indexOf(".handler(", at));
      expect(body, fn).toMatch(/headword: z\.string\(\)\.min\(1\)\.max\(100\)/);
    }
  });
});
