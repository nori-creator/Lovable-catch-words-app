import { useEffect, useMemo, useState } from "react";

/**
 * Scan waiting overlay — Apple Intelligence-style aurora ring, rotating
 * poetic copy, and floating candidate "word motes". Replaces the old
 * cyan sweep + progress bar.
 *
 * Design intent (from the design plan):
 * - No progress bar. Waiting time is turned into "reward time" via
 *   Labor Illusion (visible effort) + Variable Reward (motes are random).
 * - Rich, calm, expensive feel — reads as an Apple Intelligence "thinking"
 *   moment, not a technical loader.
 */
type Stage = "idle" | "sensing" | "reading" | "matching";

const POETIC: Record<Stage, string[]> = {
  idle:     ["look closer…"],
  sensing:  ["look closer…", "something's here…", "in the light…"],
  reading:  ["listening to shapes…", "tracing the letters…", "almost a word…"],
  matching: ["catching the meaning…", "polishing…", "almost…"],
};

// Chinese-flavored candidate word "motes" that drift by while we wait.
// Purely decorative — makes the AI feel alive without lying about results.
const MOTES = ["咖啡", "光", "巷子", "招牌", "字", "花", "門", "雨", "書", "夜"];

export function ScanAuroraOverlay({ stage }: { stage: Stage }) {
  // Rotate poetic copy every 900ms.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 900);
    return () => window.clearInterval(id);
  }, []);

  const line = useMemo(() => {
    const pool = POETIC[stage] ?? POETIC.idle;
    return pool[tick % pool.length];
  }, [stage, tick]);

  // Precompute mote positions once per mount so motion feels intentional.
  const motes = useMemo(
    () => MOTES.map((w, i) => ({
      w,
      left: 10 + Math.random() * 80,
      top: 15 + Math.random() * 70,
      delay: i * 220,
      size: 14 + Math.random() * 10,
    })),
    [],
  );

  return (
    <div className="aurora-scrim grid place-items-center" aria-live="polite" aria-label="scanning">
      <div className="aurora-ring" />
      <div className="aurora-ring-inner" />

      {/* Floating candidate motes — Labor Illusion */}
      <div className="pointer-events-none absolute inset-0">
        {motes.map((m, i) => (
          <span
            key={i}
            className="word-mote"
            style={{
              left: `${m.left}%`,
              top: `${m.top}%`,
              transform: "translate(-50%, -50%)",
              animationDelay: `${m.delay}ms`,
              fontSize: `${m.size}px`,
            }}
          >
            {m.w}
          </span>
        ))}
      </div>

      {/* Poetic copy — no progress bar */}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <p
          key={line}
          className="poetic-line font-serif-italic text-xl text-white/95 sm:text-2xl"
        >
          {line}
        </p>
        <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">
          Catchwords AI
        </p>
      </div>
    </div>
  );
}
