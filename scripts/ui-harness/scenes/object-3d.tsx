import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import { createObjectViewer, demoBubbleTea } from "@/components/three/object-viewer";

/**
 * **Pro: 撮った物を 360 度回せる 3D で手に入れる**（オーナー指示 2026-09-28 R13）。
 *
 * 流れ: いつものステッカー → 「3Dで手に入れる」（Pro）→ **点の雲が集まって形になり、
 * 線の骨組みが光って、本物の面が現れる**（オーナー添付の動画と GitHub「Camera to 3D」の
 * 見せ方）→ 指で横に払うと 360 度回る（離すと勢いで回って止まり、しばらくすると自分で
 * ゆっくり回る）。本番の生成は Tripo3D（`object3d.functions.ts` の start / check）。
 *
 * ここの 3D は**見本の形**（本番では写真から AI が作った GLB を読む）。
 * `?pro=0` で無料の人の見え方（Pro の案内）。`?step=ready` で出来上がった所から。
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
  const [pct, setPct] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = step !== "sticker";
  useEffect(() => {
    if (!started || !canvas.current) return;
    const v = createObjectViewer(
      canvas.current,
      { demo: demoBubbleTea },
      { materialize: step === "making" },
    );
    // 本番は Tripo の進み具合。見本では組み上がる演出の長さ（3.8 秒）に合わせて進める。
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const p = Math.min(100, ((performance.now() - t0) / 3800) * 100);
      setPct(p);
      if (p >= 100) window.clearInterval(id);
    }, 100);
    return () => {
      window.clearInterval(id);
      v?.dispose();
    };
    // 作り始めた時に1回だけ（ready に移っても同じ 3D を使い続ける）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);
  useEffect(() => {
    if (step === "making" && pct >= 100) setStep("ready");
  }, [step, pct]);

  const dark = started;
  return (
    <div
      className="fixed inset-0 flex flex-col items-center"
      style={{
        background: dark
          ? "radial-gradient(ellipse at 50% 40%, #1c1f26, #07080b 75%)"
          : "radial-gradient(ellipse at 50% 35%, #ffffff, #e9edf3 70%)",
        color: dark ? "#fff" : undefined,
      }}
    >
      <div className="mt-16 text-center">
        <div lang="zh-Hant" className="text-title1 font-bold">
          珍珠奶茶
        </div>
        <div className={`text-footnote ${dark ? "text-white/70" : "text-muted-foreground"}`}>
          ㄓㄣ ㄓㄨ ㄋㄞˇ ㄔㄚˊ · タピオカミルクティー
        </div>
      </div>
      <div className="relative mt-4 w-full flex-1">
        {started ? (
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full"
            aria-label="3D（横に払うと回る）"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <img src={STICKER} alt="" className="h-56 w-56 drop-shadow-xl" />
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
        {step === "making" && (
          <div aria-live="polite">
            {/* 区切りの入った進み具合（参考動画と同じ形）。 */}
            <div className="flex gap-1" role="progressbar" aria-valuenow={Math.round(pct)}>
              {Array.from({ length: 20 }, (_, i) => (
                <span
                  key={i}
                  className="h-3 flex-1 rounded-[2px]"
                  style={{
                    background: i < (pct / 100) * 20 ? "#fff" : "rgba(255,255,255,0.18)",
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-center text-footnote tabular-nums text-white/70">
              3Dにしています… {Math.round(pct)}%
            </p>
          </div>
        )}
        {step === "ready" && (
          <p className="text-center text-footnote text-white/70">横に払うと 360 度回ります</p>
        )}
      </div>
    </div>
  );
}
