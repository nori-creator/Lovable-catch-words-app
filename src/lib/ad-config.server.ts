import { normalizeAdConfig, type AdConfig } from "@/lib/ad-policy";

/**
 * **広告の設定を読む（サーバだけ）**。`app_config` の `monetization` に置く。
 * `app_config` は管理者だけが読める表なので、サーバの管理者の鍵で読む。
 * 1分ためておく（画面を開くたび・`/ads.txt` を聞かれるたびに表を読まない）。
 * 読めない時は**出さない**側に倒す（広告の出しすぎは配信停止の理由になる）。
 */
let cache: { at: number; value: AdConfig } | null = null;

export async function loadAdConfig(): Promise<AdConfig> {
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
    return normalizeAdConfig(null);
  }
}

/** 保存した直後の値を、ためておく所にも入れる（1分待たずに効かせる）。 */
export function rememberAdConfig(value: AdConfig): void {
  cache = { at: Date.now(), value };
}
