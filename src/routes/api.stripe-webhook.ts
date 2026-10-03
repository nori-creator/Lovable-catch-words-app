import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { resolvePlanChange, stripeGetWith, verifyStripeSignature } from "@/lib/stripe-billing";

/**
 * **Stripe からの知らせの受け口**（`/api/stripe-webhook`）。
 *
 * Stripe の管理画面 → 開発者 → Webhook で、この住所を登録し、送る知らせに
 * `checkout.session.completed` と `customer.subscription.created / updated / deleted`
 * を選ぶ。表示された署名の鍵（`whsec_…`）を Lovable の Secrets に
 * `STRIPE_WEBHOOK_SECRET` として入れる。
 *
 * 署名が合わない知らせは 400 で断る（誰でもこの住所に「Pro にして」と送れてしまうため）。
 * `profiles.plan` を書けるのはサーバの管理者の鍵だけ（利用者の画面からは書けない）。
 *
 * **知らせの順番を信じない**（監査 2026-10-03）。Stripe は順番どおりに届けないので、
 * 状態は知らせの中身ではなく、その場で Stripe から読み直した定期購入から決める
 * （`resolvePlanChange`。秘密鍵 `STRIPE_SECRET_KEY` は購入口と同じ物）。
 * 読み直せないときは 500 を返す — Stripe が時間を置いて送り直す。
 */
export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
        const body = await request.text();
        const ok = await verifyStripeSignature(
          body,
          request.headers.get("stripe-signature"),
          secret,
        );
        if (!ok) return new Response("bad signature", { status: 400 });
        let event: unknown;
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const key = process.env.STRIPE_SECRET_KEY ?? "";
        if (!key) {
          console.error("[stripe-webhook] STRIPE_SECRET_KEY is not set");
          return new Response("billing not configured", { status: 500 });
        }
        let change: Awaited<ReturnType<typeof resolvePlanChange>>;
        try {
          change = await resolvePlanChange(event, stripeGetWith(key));
        } catch (e) {
          console.error("[stripe-webhook] could not re-read the subscription", {
            message: (e as Error)?.message,
          });
          return new Response("stripe read failed", { status: 500 });
        }
        if (change) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ plan: change.plan } as never)
            .eq("id", change.userId);
          // 書けなかったら 500 を返す — Stripe は時間を置いて送り直してくれる。
          if (error) return new Response("db error", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
