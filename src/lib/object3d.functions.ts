import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logUsage } from "./ai-provider.server";
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
    // 3D は開発者だけ（`object3dAllowed`）。
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!object3dAllowed({ isAdmin: Boolean(isAdmin) })) return { status: "pro_only" as const };
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
    // 3D は開発者だけ（`object3dAllowed`）。
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!object3dAllowed({ isAdmin: Boolean(isAdmin) })) return { status: "pro_only" as const };
    const key = readTripoKey(process.env)?.key;
    if (!key) return { status: "unavailable" as const };
    /**
     * **失敗の理由を返す**（オーナー報告 2026-09-29「3D のボタン押してもエラーと出て機能しない」）。
     * 前は理由を捨てて「作れませんでした」だけを返していたので、どこで止まったか（写真を上げる所・
     * 仕事を頼む所・鍵）が誰にも分からなかった。使うのは開発者だけなので、Tripo の返事の要点を
     * そのまま画面に出す（鍵の値は含まれない）。
     */
    const fail = (reason: string) => ({ status: "failed" as const, reason: reason.slice(0, 200) });
    try {
      const mime = data.image.slice(5, data.image.indexOf(";")) || "image/png";
      const ext =
        mime.includes("jpeg") || mime.includes("jpg")
          ? "jpg"
          : mime.includes("webp")
            ? "webp"
            : "png";
      const b64 = data.image.slice(data.image.indexOf(",") + 1);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), `image.${ext}`);
      const auth = { authorization: `Bearer ${key}` };
      const up = await fetch(`${TRIPO_BASE_URL}/upload/sts`, {
        method: "POST",
        headers: auth,
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      const upJson = (await up.json().catch(() => null)) as {
        code?: number;
        message?: string;
        data?: { image_token?: string };
      } | null;
      const token = upJson?.code === 0 ? upJson.data?.image_token : undefined;
      if (!token)
        return fail(
          `upload HTTP ${up.status} code ${upJson?.code ?? "-"} ${upJson?.message ?? ""}`,
        );
      const task = (kind: "preview" | "final") =>
        fetch(`${TRIPO_BASE_URL}/task`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(tripoTaskBody(token, kind, ext)),
          signal: AbortSignal.timeout(30_000),
        })
          .then(async (r) => {
            const j = (await r.json().catch(() => null)) as {
              code?: number;
              message?: string;
              data?: { task_id?: string };
            } | null;
            return j?.code === 0 && j.data?.task_id
              ? { id: j.data.task_id, error: null, code: 0 }
              : {
                  id: null,
                  code: j?.code ?? null,
                  error: `task HTTP ${r.status} code ${j?.code ?? "-"} ${j?.message ?? ""}`,
                };
          })
          .catch((e: unknown) => ({
            id: null,
            code: null,
            error: `task ${e instanceof Error ? e.message : e}`,
          }));
      /**
       * **頼むのは1件だけ**（オーナー報告 2026-09-29「3D がエラーが出て作れない」— Tripo の返事は
       * 「code 2010 You don't have enough credit」）。前は下書き（色なし 20 クレジット）と仕上げ
       * （色つき 30〜40）を**同時に**頼んでいたが、画面が使うのは仕上げだけで、下書きは毎回
       * 捨てていた。1回 50〜60 クレジット → 30〜40 に減る。
       * 残りが仕上げに足りない時（2010）だけ、色なしの形（20）で作り直す。
       */
      let made = await task("final");
      if (!made.id && made.code === TRIPO_NO_CREDIT) made = await task("preview");
      if (!made.id && made.code === TRIPO_NO_CREDIT) return { status: "no_credit" as const };
      if (!made.id) return fail(made.error ?? "task");
      await logUsage(supabase, userId, "object3d");
      return { status: "started" as const, finalTaskId: made.id };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  });

/** Tripo の「クレジットが足りない」の番号（返事の `code`）。 */
const TRIPO_NO_CREDIT = 2010;

/**
 * 頼んだ仕事の進み具合（数秒ごとに呼ぶ）。出来たら GLB を画面へ中継する場所を返す。
 *
 * **開発者だけ**（監査 2026-10-03 L6）。始める・作るの2つと同じく確かめる。前はログイン
 * した人なら誰でも、こちらの Tripo の鍵で好きな仕事の番号を問い合わせられた。
 */
export const checkObject3d = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taskId: z.string().regex(/^[A-Za-z0-9_-]{6,80}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!object3dAllowed({ isAdmin: Boolean(isAdmin) }))
      return { status: "failed" as const, progress: 0 };
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
