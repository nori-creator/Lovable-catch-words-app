import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isProUser, logUsage } from "./ai-provider.server";
import { object3dAllowed, pickGlbUrl, readObject3dConfig } from "./object3d";

/**
 * 撮った写真（切り抜き後の絵）から 3D の形を作る（Pro）。仕組みは `object3d.ts`。
 *
 * 返事:
 *   { status: "ready", glbUrl }   作れた
 *   { status: "pro_only" }        Pro ではない（作らない）
 *   { status: "unavailable" }     窓口が設定されていない（開発者が設定するまで準備中）
 *   { status: "failed" }          窓口が失敗した（何度でもやり直せる）
 *
 * 鍵（OBJECT3D_API_KEY）はサーバの中だけで読み、返事にも記録にも出さない。
 */
export const generateObject3d = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        // data:image/…;base64,… か https の画像の場所。大きすぎる物は受けない（約 8MB）。
        image: z.string().min(16).max(11_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!object3dAllowed({ isPro: await isProUser(userId) }))
      return { status: "pro_only" as const };
    const cfg = readObject3dConfig(process.env);
    if (!cfg.endpoint) return { status: "unavailable" as const };
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.hasKey ? { authorization: `Bearer ${process.env.OBJECT3D_API_KEY}` } : {}),
        },
        body: JSON.stringify({ image: data.image, format: "glb" }),
        // 3D の生成は数十秒かかる（TRELLIS.2 で 20〜60 秒ほど）。それ以上は待たない。
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) return { status: "failed" as const };
      const glbUrl = pickGlbUrl(await res.json());
      if (!glbUrl) return { status: "failed" as const };
      await logUsage(supabase, userId, "object3d");
      return { status: "ready" as const, glbUrl };
    } catch {
      return { status: "failed" as const };
    }
  });
