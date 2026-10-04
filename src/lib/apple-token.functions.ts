import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * **Apple でサインインした直後に、Apple の token をサーバに預ける**（退会のときに取り消すため。
 * `apple-revoke.ts`）。Supabase は Apple の `provider_refresh_token` をサインインの直後に**1回だけ**
 * ブラウザへ渡すので、画面がそれを拾ってここへ送る（`apple-token-capture.ts`）。
 *
 * - 本人の分しか置けない（ログインの token の人の行）。Apple でサインインしたことの無い人の
 *   送った物は置かない。
 * - 置き場所（`apple_tokens`）はサーバの鍵だけが触る。返事に token は出さない。
 */
export const saveAppleToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(10).max(4096),
        kind: z.enum(["refresh_token", "access_token"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (error || !u?.user) return { stored: false };
    const providers = new Set<string>([
      ...((u.user.app_metadata?.providers as string[] | undefined) ?? []),
      ...(u.user.identities ?? []).map((i) => i.provider),
    ]);
    if (!providers.has("apple")) return { stored: false };
    const { storeAppleToken } = await import("./apple-revoke.server");
    return storeAppleToken(context.userId, { token: data.token, kind: data.kind });
  });
