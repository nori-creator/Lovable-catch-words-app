import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeAdConfig, type AdConfig } from "@/lib/ad-policy";

/**
 * **広告の設定（開発者がオン・オフ）**。`app_config` の `monetization` に置く。
 *
 * 読むのは全員（広告を出すかを画面が決めるため）。`app_config` は管理者だけが
 * 読める表なので、サーバの管理者の鍵で読み、**広告の設定だけ**を返す。
 * 書けるのは管理者だけ。1分ためておく（画面を開くたびに表を読まない）。
 */
let cache: { at: number; value: AdConfig } | null = null;

export const getAdConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AdConfig> => {
    if (cache && Date.now() - cache.at < 60_000) return cache.value;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabaseAdmin as any)
        .from("app_config")
        .select("value")
        .eq("key", "monetization")
        .maybeSingle();
      const value = normalizeAdConfig((data as { value?: { ads?: unknown } } | null)?.value?.ads);
      cache = { at: Date.now(), value };
      return value;
    } catch {
      // 読めない時は**出さない**側に倒す（広告の出しすぎは配信停止の理由になる）。
      return normalizeAdConfig(null);
    }
  });

export const setAdConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({
    ads: normalizeAdConfig((input as { ads?: unknown })?.ads),
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const { error } = await context.supabase.from("app_config").upsert({
      key: "monetization",
      value: { ads: data.ads } as never,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    cache = { at: Date.now(), value: data.ads };
    return { ok: true, ads: data.ads };
  });
