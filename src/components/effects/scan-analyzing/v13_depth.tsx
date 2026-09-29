import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import { ScanAnalyzing_v0cutout } from "./v0_cutout";

/**
 * **F 立体で測る**（2026-09-28。オーナー指示「AIの分析中のアニメーション…three.js など
 * 最新の3Dモデルを使用し、リアルで現実的なアニメーション」）。
 *
 * 写真の上に点の面を 3D で張り、光の帯が通るたびに点が手前へ浮いて光る（LiDAR で物の
 * 形を測っている見え方）。ガラスの輪（AI のレンズ）が写真の上を漂う。中身は
 * `components/three/analyze3d.ts`。three.js は**この画面が出た時にだけ読み込む**
 * （アプリの最初の読み込みを重くしない）。
 *
 * WebGL が使えない端末・動きを減らす設定では、今までの待ち画面（v0）をそのまま出す。
 */
type Stage = "sensing" | "reading" | "matching";

export function ScanAnalyzing_v13depth(props: { stage: Stage; cutout?: boolean }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(() => motionReducedNow());
  useEffect(() => {
    if (fallback) return;
    const el = canvas.current;
    if (!el) return;
    let stop: (() => void) | null = null;
    let gone = false;
    void import("@/components/three/analyze3d")
      .then(({ runAnalyze3d }) => {
        if (gone) return;
        stop = runAnalyze3d(el);
        if (!stop) setFallback(true);
      })
      .catch(() => {
        if (!gone) setFallback(true);
      });
    return () => {
      gone = true;
      stop?.();
    };
  }, [fallback]);
  if (fallback) return <ScanAnalyzing_v0cutout {...props} />;
  return (
    <div className="absolute inset-0">
      {/* 写真を少しだけ沈めて、光る点が浮いて見えるようにする。 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,12,30,0.15),rgba(0,8,20,0.55))]" />
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-6 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-24 text-center text-white">
        <div className="flex items-center gap-2" role="status">
          <Sparkles className="h-5 w-5 animate-pulse motion-reduce:animate-none" />
          <span className="font-semibold">{t("scan.analyzing")}</span>
        </div>
      </div>
    </div>
  );
}
