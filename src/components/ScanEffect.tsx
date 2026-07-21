import { useEffect } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Scan overlay — "AIが分析中".
 *
 * Restored to the earlier calm design: the whole frame simply washes with
 * the app's primary colour while the AI reads it, with a single quiet label.
 * No spinner, no progress bar, no particles.
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
    <div className="absolute inset-0 grid place-items-center">
      {/* Whole-frame colour wash — the world tints while it's being read. */}
      <div className="absolute inset-0 bg-primary/45 backdrop-blur-[2px]" />

      <p
        className="relative text-[15px] font-medium tracking-[-0.01em] text-white"
        style={{ textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}
      >
        AIが分析中…
      </p>
    </div>
  );
}
