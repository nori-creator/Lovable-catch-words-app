import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Scan overlay — "AIが分析中…".
 *
 * 2026-07-25: NORI指定で旧デザインに復元。カメラの映像はそのまま見せ、
 * 画面下に「✨ AIが分析中… / 少しだけ待ってね」。全画面を青く塗る演出は
 * やめ、シマー(光の帯)が走るだけにする。
 */

type Stage = "sensing" | "reading" | "matching";

export function ScanEffect({ stage }: { stage: Stage }) {
  useEffect(() => {
    Sound.scanStart();
    haptic("light");
  }, []);

  useEffect(() => {
    if (stage === "reading") {
      Sound.scanReading();
      haptic("selection");
    }
    if (stage === "matching") haptic("light");
  }, [stage]);

  return (
    <div className="absolute inset-0">
      {/* 光の帯(styles.css の shimmer-sweep)— 映像は見せたまま */}
      <div className="absolute inset-0 shimmer-sweep" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-6 pb-10 pt-20 text-center text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 animate-pulse" />
          <span className="font-semibold">AIが分析中...</span>
        </div>
        <p className="text-sm text-white/80">少しだけ待ってね</p>
      </div>
    </div>
  );
}
