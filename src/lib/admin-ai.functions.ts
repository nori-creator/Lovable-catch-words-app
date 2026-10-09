/**
 * **開発者の「AI の設定」の口**（Web の設定画面と iOS の両方から呼ぶ）。
 *
 * iOS は `/api/native-fn` に `{ "fn": "adminGetAiSettings", "data": {} }` の形で送る
 * （一覧は `native-fn.ts`）。約束と JSON の例は `docs/admin-ai-api.md`、中身は
 * `admin-ai.server.ts`。どの口も管理者だけ — 管理者でない人の読み取りは
 * `{ isAdmin: false }`、書き込みは 403。鍵の値は返さない。
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function deps(context: { supabase: unknown; userId: string }) {
  const mod = await import("./admin-ai.server");
  await mod.loadAdminAiServerModules();
  return { mod, deps: mod.realAdminAiDeps(context) };
}

/** いまの設定の全部（機能ごとの AI・画像・発音の声）と、選べる会社・モデル。 */
export const adminGetAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { mod, deps: d } = await deps(context);
    return mod.getAdminAiSettings(d);
  });

/** 1つの機能の AI を変える。`value` は `"auto"` か `"会社:モデル"`。 */
export const adminSetAiFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as { feature: string; value: string })
  .handler(async ({ context, data }) => {
    const { mod, deps: d } = await deps(context);
    return mod.setAdminAiFeature(d, data);
  });

/** 文字検索の AI 画像を作る会社・モデル（`provider: "off"` で停止）。 */
export const adminSetImageConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as { provider: string; model?: string })
  .handler(async ({ context, data }) => {
    const { mod, deps: d } = await deps(context);
    return mod.setAdminImageConfig(d, data);
  });

/** 1つの学習言語の発音の声（`provider: "default"` で既定の声に戻す）。 */
export const adminSetTtsVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: unknown) =>
      input as {
        language: string;
        provider: string;
        voice?: string;
        model?: string;
        gender?: "female" | "male";
      },
  )
  .handler(async ({ context, data }) => {
    const { mod, deps: d } = await deps(context);
    return mod.setAdminTtsVoice(d, data);
  });
