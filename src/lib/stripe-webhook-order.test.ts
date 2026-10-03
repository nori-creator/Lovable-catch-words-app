/**
 * Stripe の知らせが**順番どおりに来なくても**、今の状態で Pro / 無料を決める（監査 2026-10-03）。
 * 偽の Stripe（定期購入の今の状態を持つ）と、受け口（`/api/stripe-webhook`）そのものを動かす。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ writes: [] as Array<{ id: string; plan: string }> }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      update: (row: { plan: string }) => ({
        eq: async (_: string, id: string) => {
          db.writes.push({ id, plan: row.plan });
          return { error: null };
        },
      }),
    }),
  },
}));

import { hmacHex, resolvePlanChange, type StripeGet } from "./stripe-billing";
import { Route } from "@/routes/api.stripe-webhook";

type Sub = { id: string; status: string; customer: string; metadata: { user_id: string } };

/** 定期購入の今の状態を持つ偽の Stripe。 */
function stripe(subs: Sub[], opts: { searchFails?: boolean } = {}) {
  const calls: string[] = [];
  const get: StripeGet = async (path) => {
    calls.push(path);
    if (path.startsWith("/v1/subscriptions/search")) {
      if (opts.searchFails) throw new Error("stripe 400");
      const q = decodeURIComponent(path.split("query=")[1].split("&")[0]);
      const uid = /'([^']+)'$/.exec(q)?.[1];
      return { data: subs.filter((s) => s.metadata.user_id === uid) };
    }
    const id = decodeURIComponent(path.split("/").pop() ?? "");
    const s = subs.find((x) => x.id === id);
    if (!s) throw new Error("stripe 404");
    return s;
  };
  return { get, calls };
}

const subEvent = (type: string, sub: Partial<Sub> & { id: string }) => ({
  type,
  data: { object: { ...sub, metadata: { user_id: "u1" } } },
});

describe("resolvePlanChange", () => {
  it("古い「更新（active）」が解約の後に届いても、今の状態（解約済み）で無料にする", async () => {
    const s = stripe([
      { id: "sub_1", status: "canceled", customer: "cus_1", metadata: { user_id: "u1" } },
    ]);
    const late = subEvent("customer.subscription.updated", { id: "sub_1", status: "active" });
    expect(await resolvePlanChange(late, s.get)).toEqual({
      userId: "u1",
      plan: "free",
      customer: "cus_1",
    });
  });

  it("古い「解約」が後から届いても、今 active なら Pro のまま", async () => {
    const s = stripe([
      { id: "sub_1", status: "active", customer: "cus_1", metadata: { user_id: "u1" } },
    ]);
    const late = subEvent("customer.subscription.deleted", { id: "sub_1", status: "canceled" });
    expect((await resolvePlanChange(late, s.get))?.plan).toBe("pro");
  });

  it("買い終えた知らせは、その定期購入を読み直して決める", async () => {
    const s = stripe([
      { id: "sub_9", status: "trialing", customer: "cus_9", metadata: { user_id: "u1" } },
    ]);
    const done = {
      type: "checkout.session.completed",
      data: {
        object: { client_reference_id: "u1", subscription: "sub_9", payment_status: "unpaid" },
      },
    };
    expect(await resolvePlanChange(done, s.get)).toEqual({
      userId: "u1",
      plan: "pro",
      customer: "cus_9",
    });
    expect(s.calls[0]).toBe("/v1/subscriptions/sub_9");
  });

  it("片方を解約しても、同じ人のほかの定期購入が有効なら Pro", async () => {
    const s = stripe([
      { id: "sub_old", status: "canceled", customer: "cus_a", metadata: { user_id: "u1" } },
      { id: "sub_new", status: "active", customer: "cus_b", metadata: { user_id: "u1" } },
    ]);
    const ev = subEvent("customer.subscription.deleted", { id: "sub_old" });
    expect((await resolvePlanChange(ev, s.get))?.plan).toBe("pro");
    // 検索が使えないときは、読み直したその定期購入の状態で決める。
    const s2 = stripe(
      [{ id: "sub_old", status: "canceled", customer: "cus_a", metadata: { user_id: "u1" } }],
      { searchFails: true },
    );
    expect((await resolvePlanChange(ev, s2.get))?.plan).toBe("free");
  });

  it("定期購入の持ち主が知らせの人と違えば何も書かない", async () => {
    const s = stripe([
      { id: "sub_1", status: "active", customer: "cus_1", metadata: { user_id: "u2" } },
    ]);
    expect(
      await resolvePlanChange(subEvent("customer.subscription.updated", { id: "sub_1" }), s.get),
    ).toBeNull();
  });

  it("関係ない知らせ・人の分からない知らせは Stripe を呼ばない", async () => {
    const s = stripe([]);
    expect(
      await resolvePlanChange({ type: "invoice.paid", data: { object: {} } }, s.get),
    ).toBeNull();
    expect(
      await resolvePlanChange(
        { type: "customer.subscription.updated", data: { object: { id: "sub_1" } } },
        s.get,
      ),
    ).toBeNull();
    expect(s.calls).toEqual([]);
  });

  it("読み直せなければ投げる（受け口が 500 を返し、Stripe が送り直す）", async () => {
    const s = stripe([]);
    await expect(
      resolvePlanChange(subEvent("customer.subscription.updated", { id: "sub_x" }), s.get),
    ).rejects.toThrow();
  });
});

describe("/api/stripe-webhook", () => {
  const SECRET = "whsec_test";
  const post = (
    Route as unknown as {
      options: {
        server: { handlers: Record<string, (ctx: { request: Request }) => Promise<Response>> };
      };
    }
  ).options.server.handlers.POST;
  const signed = async (body: string) => {
    const t = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(SECRET, `${t}.${body}`);
    return new Request("https://app.example/api/stripe-webhook", {
      method: "POST",
      body,
      headers: { "stripe-signature": `t=${t},v1=${sig}` },
    });
  };
  const fetchMock = vi.fn();

  beforeEach(() => {
    db.writes.length = 0;
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test";
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  const body = JSON.stringify(
    subEvent("customer.subscription.updated", { id: "sub_1", status: "active" }),
  );

  it("署名が合わなければ 400（何も読まない・書かない）", async () => {
    const req = new Request("https://app.example/api/stripe-webhook", {
      method: "POST",
      body,
      headers: { "stripe-signature": "t=1,v1=bad" },
    });
    expect((await post({ request: req })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("知らせが active と言っても、Stripe が今 canceled と言えば無料を書く", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        id: "sub_1",
        status: "canceled",
        customer: "c",
        metadata: { user_id: "u1" },
      }),
    );
    // 検索（2回目の呼び出し）も同じ返事 → ほかの有効な定期購入は無い。
    const res = await post({ request: await signed(body) });
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.stripe.com/v1/subscriptions/sub_1",
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer sk_test");
    expect(db.writes).toEqual([{ id: "u1", plan: "free" }]);
  });

  it("Stripe を読めなければ 500 で、何も書かない", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    expect((await post({ request: await signed(body) })).status).toBe(500);
    expect(db.writes).toEqual([]);
  });
});
