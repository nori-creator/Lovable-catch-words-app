import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { planChangeFromEvent, verifyStripeSignature } from "@/lib/stripe-billing";

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
        const change = planChangeFromEvent(event);
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
