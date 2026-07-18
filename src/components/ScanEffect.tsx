import { useEffect, useRef } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Liquid-metal scan overlay (redesign v3).
 *
 *   Act 1 · sensing  — a silver dew ripples outward from the center; the
 *                       camera feed is barely veiled by a breathing sheen.
 *   Act 2 · reading  — the sheen thickens into a liquid-metal layer; 3–5
 *                       "gaze points" surface like water indentations; a
 *                       thin water-line grows along the bottom edge as a
 *                       progress metaphor.
 *   Act 3 · matching — the metal draws inward with surface tension toward
 *                       the target(s); a single bright core detonates just
 *                       before the caller reveals the words.
 *
 * All strokes are silver/blue (Deep Ocean primary highlights). No lattices,
 * no wireframes, no corner brackets — quiet, high-end, "the AI is thinking".
 */

type Stage = "sensing" | "reading" | "matching";

export function ScanEffect({ stage }: { stage: Stage }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<Stage>(stage);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());
  const stageStartRef = useRef<number>(performance.now());
  const pulseTimer = useRef<number>(0);
  const readingSubTimer = useRef<number>(0);

  // React to stage changes without restarting the RAF loop.
  useEffect(() => {
    if (stageRef.current !== stage) {
      stageStartRef.current = performance.now();
      stageRef.current = stage;
      if (stage === "reading") { Sound.scanReading(); haptic("selection"); }
      if (stage === "matching") { haptic("light"); }
    }
  }, [stage]);

  useEffect(() => {
    Sound.scanStart();
    haptic("light");
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Silver-blue with a warm dusk shift (kept close to primary hue).
    const hour = new Date().getHours();
    const accent =
      hour >= 17 && hour < 20 ? [230, 210, 235] :   // dusk warm-silver
      hour >= 20 || hour < 5  ? [200, 220, 255] :   // night cool-silver
                                 [220, 235, 255];   // day bright-silver
    const silver = (a: number) => `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${a.toFixed(3)})`;

    // Persistent surface ripples — spawned per act, fade over ~1.6s.
    type R = { x: number; y: number; born: number; life: number; maxR: number };
    let ripples: R[] = [];
    const spawnRipple = (x: number, y: number, maxR: number, life = 1600) => {
      ripples.push({ x, y, born: performance.now(), life, maxR });
    };

    // Gaze points that appear during reading — surface indentations.
    type Gaze = { x: number; y: number; born: number };
    let gazes: Gaze[] = [];
    let lastGazeAt = 0;

    // Fine particles that drift toward center during matching.
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number };
    const particles: P[] = [];
    const spawnParticle = () => {
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.min(w, h) * (0.32 + Math.random() * 0.22);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const life = 700 + Math.random() * 500;
      particles.push({
        x, y,
        vx: (cx - x) * 0.0005,
        vy: (cy - y) * 0.0005,
        life, max: life,
      });
    };

    // Initial dew ripple
    setTimeout(() => {
      const w = canvas.width, h = canvas.height;
      spawnRipple(w / 2, h / 2, Math.hypot(w, h) * 0.55, 2000);
    }, 40);

    const tick = (now: number) => {
      const w = canvas.width, h = canvas.height;
      const elapsed = now - startRef.current;
      const stageT = now - stageStartRef.current;
      const st = stageRef.current;
      ctx.clearRect(0, 0, w, h);

      // 1) Global tint — subtle silver veil that thickens by act.
      const veil = st === "matching" ? 0.30 : st === "reading" ? 0.22 : 0.12;
      const veilGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      veilGrad.addColorStop(0, silver(veil * 0.35));
      veilGrad.addColorStop(0.7, silver(veil));
      veilGrad.addColorStop(1, "rgba(6, 12, 28, 0.55)");
      ctx.fillStyle = veilGrad;
      ctx.fillRect(0, 0, w, h);

      // 2) Ripples (liquid surface)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const age = now - rp.born;
        if (age > rp.life) { ripples.splice(i, 1); continue; }
        const p = age / rp.life;
        const r = rp.maxR * (0.05 + p * 0.95);
        const alpha = (1 - p) * 0.55;
        ctx.strokeStyle = silver(alpha);
        ctx.lineWidth = (1.6 - p * 1.2) * dpr;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, r, 0, Math.PI * 2);
        ctx.stroke();
        // inner faint ripple
        if (p < 0.7) {
          ctx.strokeStyle = silver(alpha * 0.35);
          ctx.lineWidth = 0.8 * dpr;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, r * 0.72, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Auto-spawn ripples per act
      if (st === "sensing" && Math.random() < 0.02) {
        spawnRipple(w / 2 + (Math.random() - 0.5) * w * 0.15,
                    h / 2 + (Math.random() - 0.5) * h * 0.15,
                    Math.min(w, h) * (0.28 + Math.random() * 0.18));
      }
      if (st === "reading" && Math.random() < 0.05) {
        spawnRipple(Math.random() * w, Math.random() * h,
                    Math.min(w, h) * (0.14 + Math.random() * 0.14), 1200);
      }

      // 3) Reading: surface indentations (gaze points)
      if (st === "reading") {
        if (now - lastGazeAt > 340 && gazes.length < 5) {
          lastGazeAt = now;
          gazes.push({
            x: w * (0.18 + Math.random() * 0.64),
            y: h * (0.18 + Math.random() * 0.64),
            born: now,
          });
          Sound.tap();
        }
        gazes = gazes.filter((g) => now - g.born < 2200);
        for (const g of gazes) {
          const age = (now - g.born) / 2200;
          const rr = (18 + age * 22) * dpr;
          const alpha = (1 - age) * 0.9;
          // dark inner "indentation"
          const ind = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, rr);
          ind.addColorStop(0, `rgba(4, 8, 22, ${(alpha * 0.55).toFixed(3)})`);
          ind.addColorStop(0.6, `rgba(4, 8, 22, ${(alpha * 0.15).toFixed(3)})`);
          ind.addColorStop(1, "rgba(4, 8, 22, 0)");
          ctx.fillStyle = ind;
          ctx.beginPath();
          ctx.arc(g.x, g.y, rr, 0, Math.PI * 2);
          ctx.fill();
          // silver rim
          ctx.strokeStyle = silver(alpha * 0.7);
          ctx.lineWidth = 1.2 * dpr;
          ctx.beginPath();
          ctx.arc(g.x, g.y, rr * 0.9, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Water-line progress (bottom) — loops through 3 phases.
        const phase = (stageT % 1600) / 1600;
        const lineY = h - 22 * dpr;
        const grad = ctx.createLinearGradient(0, lineY, w, lineY);
        grad.addColorStop(0, silver(0));
        grad.addColorStop(Math.max(0, phase - 0.15), silver(0));
        grad.addColorStop(phase, silver(0.9));
        grad.addColorStop(Math.min(1, phase + 0.15), silver(0));
        grad.addColorStop(1, silver(0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, lineY, w, 1.5 * dpr);
      }

      // 4) Matching: converging mercury
      if (st === "matching") {
        const p = Math.min(1, stageT / 700);
        const cx = w / 2, cy = h / 2;

        // Halo bloom
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, (80 + 160 * p) * dpr);
        halo.addColorStop(0, silver(0.7 * (1 - p) + 0.15));
        halo.addColorStop(0.5, silver(0.3 * (1 - p) + 0.08));
        halo.addColorStop(1, silver(0));
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);

        // Bright core
        ctx.beginPath();
        ctx.arc(cx, cy, (6 + 14 * (1 - p)) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.55 + 0.4 * p).toFixed(3)})`;
        ctx.fill();

        // Particles vector inward
        if (particles.length < 60 && Math.random() < 0.7) spawnParticle();
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.vx += (cx - pt.x) * 0.00012;
          pt.vy += (cy - pt.y) * 0.00012;
          pt.x += pt.vx * 16;
          pt.y += pt.vy * 16;
          pt.life -= 16;
          const near = Math.hypot(pt.x - cx, pt.y - cy) < 8 * dpr;
          if (pt.life <= 0 || near) { particles.splice(i, 1); continue; }
          const a = Math.max(0, pt.life / pt.max);
          ctx.beginPath();
          ctx.fillStyle = silver(a * 0.85);
          ctx.arc(pt.x, pt.y, 1.4 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5) Breathing depth-ring (always) — tighter in matching.
      const baseR = st === "matching" ? 22 * dpr : 44 * dpr;
      const rc = baseR + Math.sin(elapsed / 260) * 4 * dpr;
      ctx.strokeStyle = silver(0.55);
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = silver(0.15);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rc + 14 * dpr, 0, Math.PI * 2);
      ctx.stroke();

      // Sound timers
      if (elapsed - pulseTimer.current > 900) {
        pulseTimer.current = elapsed;
        if (st !== "matching") Sound.scanPulse();
      }
      if (st === "reading" && elapsed - readingSubTimer.current > 1400) {
        readingSubTimer.current = elapsed;
        Sound.scanReading();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const label =
    stage === "sensing" ? "銀の露をひろげています" :
    stage === "reading" ? "世界を読んでいます" :
    "言葉が結晶化します";

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2.5">
        <div className="flex gap-1.5">
          {(["sensing", "reading", "matching"] as const).map((s) => (
            <span
              key={s}
              className="h-[2px] rounded-full transition-all duration-500"
              style={{
                width: stage === s ? 28 : 8,
                background: stage === s ? "rgba(220,235,255,0.95)" : "rgba(220,235,255,0.25)",
              }}
            />
          ))}
        </div>
        <p
          className="font-display text-[15px] italic text-white/90"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.35)" }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}
