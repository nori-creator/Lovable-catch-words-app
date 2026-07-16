import { useEffect, useRef } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Vision Pro–style scan overlay.
 * A soft grid sweeps across the frame while cyan particles converge on the
 * center. Purely presentational; the parent owns detection state and hides
 * this component when scanning ends.
 *
 * Design notes:
 * - Uses a single full-canvas 2D context, 60fps, typed particle array.
 * - Grid density and particle color subtly shift with time-of-day so the
 *   effect never feels identical twice → variable reward.
 * - No file assets, no external libs.
 */

type Stage = "sensing" | "reading" | "matching";

export function ScanEffect({ stage }: { stage: Stage }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());
  const pulseTimer = useRef<number>(0);

  useEffect(() => {
    Sound.scanStart();
    haptic("light");
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
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

    // Time-of-day accent (dawn cyan → midnight blue-violet)
    const hour = new Date().getHours();
    const accent =
      hour >= 5 && hour < 11 ? [180, 240, 255] :
      hour >= 11 && hour < 17 ? [125, 211, 252] :
      hour >= 17 && hour < 20 ? [255, 190, 200] :
      [148, 163, 255];

    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
    const particles: P[] = [];
    const spawn = () => {
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.min(w, h) * (0.4 + Math.random() * 0.15);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const life = 700 + Math.random() * 500;
      const spd = 0.06 + Math.random() * 0.05;
      particles.push({
        x, y,
        vx: (cx - x) * spd * 0.006,
        vy: (cy - y) * spd * 0.006,
        life, max: life,
        size: (1 + Math.random() * 2.2) * dpr,
      });
    };

    // Grid sweep offset
    let phase = 0;

    const tick = (now: number) => {
      const w = canvas.width, h = canvas.height;
      const elapsed = now - startRef.current;
      ctx.clearRect(0, 0, w, h);

      // 1) darken with radial vignette
      const rg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.75);
      rg.addColorStop(0, "rgba(6, 12, 30, 0.35)");
      rg.addColorStop(1, "rgba(4, 8, 22, 0.75)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      // 2) grid — 8×12, opacity waves through columns
      const cols = 8, rows = 12;
      const cw = w / cols, ch = h / rows;
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      for (let c = 0; c <= cols; c++) {
        const wave = 0.10 + 0.22 * Math.max(0, Math.sin((elapsed / 350) + c * 0.35));
        ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${wave.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(c * cw, 0);
        ctx.lineTo(c * cw, h);
        ctx.stroke();
      }
      for (let r = 0; r <= rows; r++) {
        const wave = 0.06 + 0.18 * Math.max(0, Math.sin((elapsed / 420) + r * 0.28 + Math.PI / 3));
        ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${wave.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(0, r * ch);
        ctx.lineTo(w, r * ch);
        ctx.stroke();
      }

      // 3) sweeping horizon line
      phase = (elapsed % 1600) / 1600;
      const sy = phase * h;
      const grad = ctx.createLinearGradient(0, sy - 40 * dpr, 0, sy + 40 * dpr);
      grad.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0)`);
      grad.addColorStop(0.5, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.55)`);
      grad.addColorStop(1, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, sy - 40 * dpr, w, 80 * dpr);

      // 4) particles
      if (particles.length < 90 && Math.random() < 0.6) spawn();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * 16;
        p.y += p.vy * 16;
        p.life -= 16;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const a = Math.max(0, p.life / p.max);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${(a * 0.9).toFixed(3)})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5) center reticle (respiration)
      const rc = 40 * dpr + Math.sin(elapsed / 260) * 6 * dpr;
      ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.65)`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rc + 14 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.25)`;
      ctx.stroke();

      // periodic pulse tick
      if (elapsed - pulseTimer.current > 700) {
        pulseTimer.current = elapsed;
        Sound.scanPulse();
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
    stage === "sensing" ? "シーンを感知しています" :
    stage === "reading" ? "対象を解析しています" :
    "辞書と照合しています";

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
        <div className="flex gap-1.5">
          {(["sensing", "reading", "matching"] as const).map((s, i) => (
            <span
              key={s}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: stage === s ? 22 : 10,
                background: stage === s ? "rgba(125,211,252,0.95)" : "rgba(125,211,252,0.28)",
                animationDelay: `${i * 80}ms`,
              }}
            />
          ))}
        </div>
        <p className="text-[11px] font-medium tracking-[0.22em] text-white/80 uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}
