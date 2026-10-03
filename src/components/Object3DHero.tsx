import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Box, Loader2, X } from "lucide-react";
import { checkObject3d, startObject3d } from "@/lib/object3d.functions";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import type { ObjectViewer } from "@/components/three/object-viewer";

/**
 * **単語の詳細の写真を 3D にする**（Pro。オーナー指示 R17「課金ユーザーは単語の詳細に３D
 * モデル化する専用のボタンを表示し、タップしたら単語の詳細の画像が 3D モデル化する」）。
 *
 * 押すと、その語の切り抜いた絵を Tripo に送り（`startObject3d`）、数秒ごとに進み具合を聞く
 * （`checkObject3d`）。出来た形は写真の枠の中でそのまま 360 度回せる（`object-viewer.ts`、
 * 点の雲 → 骨組み → 面と組み上がる）。**作った形は端末に置く**（Cache Storage）— 同じ語を
 * 開くたびに作り直すと、そのたびに生成の料金がかかる。
 *
 * Pro でない人にはボタンを出さない（呼ぶ側の `isPro`）。サーバ側でも Pro か確かめる。
 */
const CACHE = "cw-object3d-v1";
const cacheKey = (stickerId: string) => `/object3d/${stickerId}.glb`;

type State =
  | { k: "idle" }
  | { k: "making"; progress: number }
  | { k: "ready"; url: string }
  | { k: "error"; reason: "unavailable" | "failed" | "pro_only" | "no_credit"; detail?: string };

export function Object3DButton({
  stickerId,
  imageUrl,
  onOpen,
}: {
  stickerId: string;
  /** 3D にする絵（切り抜きがあれば切り抜き）。 */
  imageUrl: string | null;
  onOpen: () => void;
}) {
  const t = useT();
  if (!imageUrl) return null;
  return (
    <button
      type="button"
      data-object3d-button={stickerId}
      aria-label={t("object3d.open")}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="object3d-btn press-in"
    >
      <Box className="h-4 w-4" aria-hidden />
      <span>3D</span>
    </button>
  );
}

export function Object3DLayer({
  stickerId,
  imageUrl,
  onClose,
}: {
  stickerId: string;
  imageUrl: string;
  onClose: () => void;
}) {
  const t = useT();
  const start = useServerFn(startObject3d);
  const check = useServerFn(checkObject3d);
  const [state, setState] = useState<State>({ k: "idle" });
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ObjectViewer | null>(null);

  // 端末に置いた形があればそれを出す。無ければ作る。
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const run = async () => {
      const cached = await readCached(stickerId);
      if (!alive) return;
      if (cached) {
        setState({ k: "ready", url: cached });
        return;
      }
      setState({ k: "making", progress: 0 });
      const image = await toPngDataUrl(imageUrl).catch(() => null);
      if (!alive) return;
      if (!image) {
        setState({ k: "error", reason: "failed", detail: "image" });
        return;
      }
      const res = await start({ data: { image } }).catch((e: unknown) => ({
        status: "failed" as const,
        reason: e instanceof Error ? e.message : String(e),
      }));
      if (!alive) return;
      if (res.status !== "started") {
        setState({
          k: "error",
          reason:
            res.status === "pro_only"
              ? "pro_only"
              : res.status === "unavailable"
                ? "unavailable"
                : res.status === "no_credit"
                  ? "no_credit"
                  : "failed",
          detail: "reason" in res ? res.reason : undefined,
        });
        return;
      }
      const taskId = res.finalTaskId;
      const poll = async () => {
        const st = await check({ data: { taskId } }).catch(() => ({
          status: "running" as const,
          progress: 0,
        }));
        if (!alive) return;
        if (st.status === "success" && "modelUrl" in st && st.modelUrl) {
          // 中継はログインした開発者だけが読める（トークンを付けて取る）。読めなければ
          // 失敗として出す（トークンの無い URL を描く道に渡しても読めない）。
          const url = await storeModel(stickerId, st.modelUrl).catch(() => null);
          if (!alive) return;
          setState(url ? { k: "ready", url } : { k: "error", reason: "failed", detail: "model" });
          return;
        }
        if (st.status === "failed") {
          setState({
            k: "error",
            reason: "failed",
            detail: "reason" in st ? (st as { reason?: string }).reason : undefined,
          });
          return;
        }
        setState({ k: "making", progress: Number((st as { progress?: number }).progress ?? 0) });
        timer = window.setTimeout(poll, 3000);
      };
      timer = window.setTimeout(poll, 2500);
    };
    void run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [stickerId, imageUrl, start, check]);

  // 出来た形を枠の中で回せるようにする（組み上がる見せ方で出す）。
  useEffect(() => {
    if (state.k !== "ready" || !canvas.current) return;
    let alive = true;
    void import("@/components/three/object-viewer").then(({ createObjectViewer }) => {
      if (!alive || !canvas.current) return;
      viewer.current = createObjectViewer(
        canvas.current,
        { glbUrl: state.url },
        { materialize: !motionReducedNow() },
      );
    });
    return () => {
      alive = false;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [state]);

  const message =
    state.k === "error"
      ? state.reason === "unavailable"
        ? t("object3d.unavailable")
        : state.reason === "pro_only"
          ? t("object3d.proOnly")
          : state.reason === "no_credit"
            ? t("object3d.noCredit")
            : `${t("object3d.failed")}${state.detail ? `（${state.detail}）` : ""}`
      : null;

  return (
    <div
      className="object3d-layer"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <canvas ref={canvas} className="object3d-layer__canvas" />
      {state.k === "making" && (
        <div className="object3d-layer__status" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span>
            {t("object3d.making")}
            {state.progress > 0 ? ` ${Math.round(state.progress)}%` : ""}
          </span>
        </div>
      )}
      {message && (
        <div className="object3d-layer__status" role="alert">
          <span>{message}</span>
        </div>
      )}
      <button
        type="button"
        aria-label={t("object3d.close")}
        onClick={onClose}
        className="object3d-layer__close press-in"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

async function readCached(stickerId: string): Promise<string | null> {
  try {
    if (typeof caches === "undefined") return null;
    const c = await caches.open(CACHE);
    const r = await c.match(cacheKey(stickerId));
    if (!r) return null;
    return URL.createObjectURL(await r.blob());
  } catch {
    return null;
  }
}

/** 出来た形を端末に置き、その場所（blob URL）を返す。 */
async function storeModel(stickerId: string, modelUrl: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch(modelUrl, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!r.ok) throw new Error("model fetch failed");
  const blob = await r.blob();
  try {
    if (typeof caches !== "undefined") {
      const c = await caches.open(CACHE);
      await c.put(
        cacheKey(stickerId),
        new Response(blob, { headers: { "content-type": "model/gltf-binary" } }),
      );
    }
  } catch {
    // 置けなくても今回は見られる（次に開いた時にまた作ることになる）。
  }
  return URL.createObjectURL(blob);
}

/**
 * 絵を **本物の PNG の** data URL にする（サーバへ送る形）。
 *
 * 切り抜きの絵は端末や保管庫では WebP / JPEG のことがある。前は中身をそのまま送り、
 * Tripo には「PNG」と名乗っていた — 中身と名乗りが違うと Tripo は受け取らない
 * （オーナー報告 2026-09-29「3D のボタン押してもエラー」の疑い）。ここで描き直して PNG にそろえ、
 * 大きすぎる絵は長い辺 1024px に縮める（送る量を抑える。3D の形には十分）。
 */
async function toPngDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`image HTTP ${r.status}`);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/png");
}
