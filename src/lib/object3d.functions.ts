import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isProUser, logUsage } from "./ai-provider.server";
import {
  TRIPO_BASE_URL,
  readTripoKey,
  object3dAllowed,
  pickGlbUrl,
  readObject3dConfig,
  readTripoTask,
  tripoTaskBody,
} from "./object3d";

/**
 * 撮った写真（切り抜き後の絵）から 3D の形を作る（Pro）。仕組みは `object3d.ts`。
 * こちらは **Tripo 以外の窓口**（自前の GPU・fal など）を使う時の1回で返す形。既定の Tripo は
 * 下の `startObject3d` / `checkObject3d`。
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

// ---- Tripo3D（既定）: 始める → 進み具合を聞く ---------------------------------------

/**
 * 写真から 3D を作り始める（Pro）。Tripo に写真を上げ、下書きと仕上げの2つを同時に頼む。
 * 生成は 30〜60 秒かかるので、ここは頼むだけですぐ返し、進み具合は `checkObject3d` で聞く
 * （サーバの1回の呼び出しを長く待たせない）。
 */
export const startObject3d = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        // data:image/png;base64,…（切り抜いた絵）。約 8MB まで。
        image: z.string().startsWith("data:image/").max(11_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!object3dAllowed({ isPro: await isProUser(userId) }))
      return { status: "pro_only" as const };
    const key = readTripoKey(process.env)?.key;
    if (!key) return { status: "unavailable" as const };
    try {
      const b64 = data.image.slice(data.image.indexOf(",") + 1);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "image/png" }), "image.png");
      const auth = { authorization: `Bearer ${key}` };
      const up = await fetch(`${TRIPO_BASE_URL}/upload/sts`, {
        method: "POST",
        headers: auth,
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      const upJson = (await up.json().catch(() => null)) as {
        code?: number;
        data?: { image_token?: string };
      } | null;
      const token = upJson?.code === 0 ? upJson.data?.image_token : undefined;
      if (!token) return { status: "failed" as const };
      const task = (kind: "preview" | "final") =>
        fetch(`${TRIPO_BASE_URL}/task`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(tripoTaskBody(token, kind)),
          signal: AbortSignal.timeout(30_000),
        })
          .then((r) => r.json())
          .then((j: { code?: number; data?: { task_id?: string } }) =>
            j?.code === 0 ? (j.data?.task_id ?? null) : null,
          )
          .catch(() => null);
      const [previewTaskId, finalTaskId] = await Promise.all([task("preview"), task("final")]);
      if (!finalTaskId) return { status: "failed" as const };
      await logUsage(supabase, userId, "object3d");
      return { status: "started" as const, previewTaskId, finalTaskId };
    } catch {
      return { status: "failed" as const };
    }
  });

/** 頼んだ仕事の進み具合（数秒ごとに呼ぶ）。出来たら GLB を画面へ中継する場所を返す。 */
export const checkObject3d = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taskId: z.string().regex(/^[A-Za-z0-9_-]{6,80}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = readTripoKey(process.env)?.key;
    if (!key) return { status: "failed" as const, progress: 0 };
    try {
      const r = await fetch(`${TRIPO_BASE_URL}/task/${data.taskId}`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      const st = readTripoTask(await r.json().catch(() => null));
      if (st.status !== "success") return st;
      // Tripo の配信先は画面から直接読めない（CORS）ので、自分のサーバを通して読む。
      return {
        ...st,
        modelUrl: `/api/object3d-model?url=${encodeURIComponent(st.modelUrl)}`,
      };
    } catch {
      return { status: "running" as const, progress: 0 };
    }
  });
