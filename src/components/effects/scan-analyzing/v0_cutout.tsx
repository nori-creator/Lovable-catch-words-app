import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * いちばん古い「待ち」の画面(2026-07-01 / カメラ期・切り抜きあり)。
 *
 * まだ「スキャン」ではなく**カメラ**だった頃のもの。探査点(光の点)も、
 * 全画面の青染めも、段階表示もない。撮った写真の上を光の帯が一度なでて、
 * 下に「AIが切り抜き中...」と出るだけ。背景を本当に切り抜いていた時代の
 * 文言なので、ここは「分析中」ではなく**切り抜き中**のままにしてある。
 *
 * 呼び出し側が写真を敷く前提で、この層は帯と文言だけを描く。
 */

type Stage = "sensing" | "reading" | "matching";

export function ScanAnalyzing_v0cutout({ stage }: { stage: Stage }) {
  // ここは**既定の待ち画面**(effect-lab の scanAnalyzing 既定が v0cutout)。
  // 文言が日本語で直書きされていたので、英語のユーザーはアプリの見せ場で
  // 突然日本語を見ていた。過去の版だから訳さなくていい、とはならない。
  const t = useT();
  // 当時は候補出しと切り抜きが同時に走っていたので文言は1つだけだった。
  // いまは候補をタップしてから切り抜くので、そこだけ「切り抜き中」に分ける
  // — 見た目は当時のまま、言っていることは実際の処理と合わせる。
  const label = stage === "matching" ? t("scan.cuttingOut") : t("scan.analyzing");
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 shimmer-sweep" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-6 pb-16 pt-24 text-center text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 animate-pulse" />
          <span className="font-semibold">{label}</span>
        </div>
        <p className="text-body text-white/80">{t("scan.justAMoment")}</p>
      </div>
    </div>
  );
}
