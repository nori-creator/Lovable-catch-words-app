import { useEffect, useRef, useState } from "react";
import { Box, Sparkles } from "lucide-react";
import { createObjectViewer, demoBubbleTea } from "@/components/three/object-viewer";

/**
 * **Pro: 撮った物を 360 度回せる 3D で手に入れる**（オーナー指示 2026-09-28 R13）。
 *
 * 流れ: いつものステッカー → 「3Dで手に入れる」（Pro）→ 作っている間の待ち →
 * 台の上に 3D の物が置かれる → 指で横に払うと 360 度回る（離すと勢いで回って止まり、
 * しばらくすると自分でゆっくり回る）。
 *
 * ここの 3D は**見本の形**（本番では写真から AI が作った GLB を読む。`object3d.functions.ts`）。
 * `?pro=0` で無料の人の見え方（Pro の案内）。
 */
type Step = "sticker" | "making" | "ready";

const STICKER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><rect x="20" y="20" width="280" height="280" rx="40" fill="#fff"/><rect x="118" y="80" width="84" height="170" rx="16" fill="#d9b58c"/><rect x="152" y="40" width="14" height="60" fill="#0a84ff"/><g fill="#3a2716"><circle cx="138" cy="225" r="9"/><circle cx="160" cy="232" r="9"/><circle cx="182" cy="225" r="9"/></g></svg>`,
  );

export function Object3DScene({ q }: { q: URLSearchParams }) {
  const pro = q.get("pro") !== "0";
  const [step, setStep] = useState<Step>(q.get("step") === "ready" ? "ready" : "sticker");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (step !== "making") return;
    const id = window.setTimeout(() => setStep("ready"), 2400);
    return () => window.clearTimeout(id);
  }, [step]);
  useEffect(() => {
    if (step !== "ready" || !canvas.current) return;
    const v = createObjectViewer(canvas.current, { demo: demoBubbleTea });
    return () => v?.dispose();
  }, [step]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center"
      style={{ background: "radial-gradient(ellipse at 50% 35%, #ffffff, #e9edf3 70%)" }}
    >
      <div className="mt-16 text-center">
        <div lang="zh-Hant" className="text-title1 font-bold">
          珍珠奶茶
        </div>
        <div className="text-footnote text-muted-foreground">
          ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ · タピオカミルクティー
        </div>
      </div>
      <div className="relative mt-4 w-full flex-1">
        {step === "ready" ? (
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full"
            aria-label="3D（横に払うと回る）"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <img
              src={STICKER}
              alt=""
              className="h-56 w-56 drop-shadow-xl"
              style={
                step === "making"
                  ? { animation: "obj3d-lift 2.4s cubic-bezier(.3,.7,.2,1) forwards" }
                  : undefined
              }
            />
            {step === "making" && (
              <div className="absolute bottom-10 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-footnote font-semibold text-white">
                <Sparkles className="h-4 w-4 animate-pulse" aria-hidden />
                3Dにしています…
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mb-[calc(24px+env(safe-area-inset-bottom))] w-full px-6">
        {step === "sticker" &&
          (pro ? (
            <button
              type="button"
              onClick={() => setStep("making")}
              className="press-in flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/30"
            >
              <Box className="h-5 w-5" aria-hidden />
              3Dで手に入れる
            </button>
          ) : (
            <div className="rounded-2xl bg-white p-4 text-center shadow">
              <p className="font-semibold">撮った物を 3D で手に入れる</p>
              <p className="mt-1 text-footnote text-muted-foreground">
                Pro にすると、ステッカーの代わりに 360 度回せる 3D で図鑑に入ります。
              </p>
              <button className="mt-3 h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground">
                Pro を見る
              </button>
            </div>
          ))}
        {step === "ready" && (
          <p className="text-center text-footnote text-muted-foreground">
            横に払うと 360 度回ります
          </p>
        )}
      </div>
      <style>{`@keyframes obj3d-lift{0%{transform:none;filter:none}60%{transform:translateY(-18px) rotateY(160deg) scale(.9);filter:blur(0)}100%{transform:translateY(-10px) rotateY(360deg) scale(.6);filter:blur(6px);opacity:.2}}`}</style>
    </div>
  );
}
