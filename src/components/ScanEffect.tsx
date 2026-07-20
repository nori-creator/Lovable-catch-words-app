import { useEffect } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Scan overlay — "AIが分析中".
 *
 * Deliberately quiet (apple-design §16 restraint / §4 behavior-over-animation):
 * a calm frosted veil over the frozen frame with a familiar analyzing spinner
 * and a three-step progress read-out — no liquid-metal theatrics. The scan
 * only reads the frame; it doesn't cut anything out, so the copy is "分析中",
 * not "切り抜き中". Fully static under prefers-reduced-motion (§14).
 */

type Stage = "sensing" | "reading" | "matching";

export function ScanEffect({ stage }: { stage: Stage }) {
  const reduced = usePrefersReducedMotion();

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
      {/* Frosted veil — signals "the AI is thinking" without stealing focus. */}
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[3px]" />

      <div className="relative flex flex-col items-center gap-3 px-6">
        {/* Familiar indeterminate ring (static under reduced motion). */}
        <span
          className={`h-9 w-9 rounded-full border-2 border-white/25 border-t-white/90 ${reduced ? "" : "animate-spin"}`}
          style={{ animationDuration: "0.9s" }}
        />
        <p
          className="text-[15px] font-medium tracking-[-0.01em] text-white/95"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.4)" }}
        >
          AIが分析中…
        </p>
        {/* Three calm progress ticks — the only thing that moves is a width. */}
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[2px] rounded-full transition-all duration-500"
              style={{
                width: i === idx ? 24 : 8,
                background: i <= idx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
