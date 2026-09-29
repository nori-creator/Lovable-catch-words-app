import { describe, expect, it } from "vitest";
import {
  billingSurface,
  checkoutForm,
  hmacHex,
  planChangeFromEvent,
  planFromSubscriptionStatus,
  verifyStripeSignature,
} from "./stripe-billing";

describe("Stripe のサブスク", () => {
  it("支払い済み・試用中だけが Pro", () => {
    expect(planFromSubscriptionStatus("active")).toBe("pro");
    expect(planFromSubscriptionStatus("trialing")).toBe("pro");
    for (const s of ["past_due", "canceled", "unpaid", "incomplete", null])
      expect(planFromSubscriptionStatus(s)).toBe("free");
  });

  it("払い終えた知らせで Pro、解約の知らせで無料に戻す", () => {
    expect(
      planChangeFromEvent({
        type: "checkout.session.completed",
        data: { object: { client_reference_id: "u1", payment_status: "paid", customer: "cus_1" } },
      }),
    ).toEqual({ userId: "u1", plan: "pro", customer: "cus_1" });
    expect(
      planChangeFromEvent({
        type: "checkout.session.completed",
        data: { object: { client_reference_id: "u1", payment_status: "unpaid" } },
      }),
    ).toBeNull();
    expect(
      planChangeFromEvent({
        type: "customer.subscription.deleted",
        data: { object: { metadata: { user_id: "u1" }, status: "canceled" } },
      }),
    ).toMatchObject({ userId: "u1", plan: "free" });
    expect(
      planChangeFromEvent({
        type: "customer.subscription.updated",
        data: { object: { metadata: { user_id: "u1" }, status: "past_due" } },
      }),
    ).toMatchObject({ plan: "free" });
    expect(planChangeFromEvent({ type: "invoice.paid", data: { object: {} } })).toBeNull();
  });

  it("署名が合う知らせだけを信じる（古すぎる・書き換えた物は断る）", async () => {
    const secret = "whsec_test";
    const body = '{"id":"evt_1"}';
    const t = 1_800_000_000;
    const sig = await hmacHex(secret, `${t}.${body}`);
    const header = `t=${t},v1=${sig}`;
    expect(await verifyStripeSignature(body, header, secret, t + 10)).toBe(true);
    expect(await verifyStripeSignature(body + " ", header, secret, t + 10)).toBe(false);
    expect(await verifyStripeSignature(body, header, "other", t + 10)).toBe(false);
    expect(await verifyStripeSignature(body, header, secret, t + 3600)).toBe(false);
    expect(await verifyStripeSignature(body, null, secret, t)).toBe(false);
  });

  it("支払い画面には、誰の支払いかを2か所に書く", () => {
    const f = checkoutForm({
      priceId: "price_1",
      userId: "u1",
      successUrl: "https://x/settings?pro=ok",
      cancelUrl: "https://x/settings",
      trialDays: 7,
    });
    expect(f.get("mode")).toBe("subscription");
    expect(f.get("client_reference_id")).toBe("u1");
    expect(f.get("subscription_data[metadata][user_id]")).toBe("u1");
    expect(f.get("subscription_data[trial_period_days]")).toBe("7");
  });

  it("アプリ版では Stripe の購入口を出さない（ストアの決まり）", () => {
    expect(billingSurface(true)).toBe("none");
    expect(billingSurface(false)).toBe("stripe");
  });
});
