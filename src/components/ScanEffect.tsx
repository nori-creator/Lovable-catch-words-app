import { useEffect } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Scan overlay — "AIが分析中".
 *
 * Deliberately near-static (apple-design §16 restraint): the whole frame
 * simply washes with the app's colour while the AI reads it, with a quiet
 * label and a three-step progress read-out. No spinner, no particles, no
 * canvas — the scan reads the frame, it doesn't cut anything out.
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

  const idx = stage === "sensing" ? 0 : stage === "reading" ? 1 : 2;

  return (
    <div className="absolute inset-0 grid place-items-center">
      {/* Whole-frame colour wash — the world tints while it's being read. */}
      <div className="absolute inset-0 bg-primary/35 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15" />

      <div className="relative flex flex-col items-center gap-2.5">
        <p
          className="text-[15px] font-medium tracking-[-0.01em] text-white"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}
        >
          AIが分析中…
        </p>
        {/* The only thing that moves is a width — a calm progress read-out. */}
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
