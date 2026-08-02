import { useEffect } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { useT } from "@/lib/i18n";

/**
 * スキャン中の演出(2026-07-27 NORI指定で「1つ前」に戻した版)。
 *
 * 画面全体がアプリの青に染まり、中央に「AIが分析中…」だけ。
 * 走査線・グリッド・粒子といった装飾はやめ、静かで上質な待ち時間にする。
 * 進行が分かるよう、動くのは細い3本のバーの幅だけ。
 */

type Stage = "sensing" | "reading" | "matching";

export function ScanAnalyzing_v8current({ stage }: { stage: Stage }) {
  const t = useT();

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

  const idx = stage === "sensing" ? 0 : stage === "reading" ? 1 : 2;

  return (
    <div className="absolute inset-0 grid place-items-center">
      {/* 画面全体がアプリの青に染まる — 世界が読み取られている合図。 */}
      <div className="absolute inset-0 bg-primary/35 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15" />

      <div className="relative flex flex-col items-center gap-2.5">
        <p
          className="text-[15px] font-medium tracking-[-0.01em] text-white"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}
        >
          {t("scan.analyzing")}
        </p>
        {/* 動くのは幅だけ — 静かな進行の読み取り。 */}
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[2px] rounded-full transition-all duration-500"
              style={{
                width: i === idx ? 24 : 8,
                background: i <= idx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
