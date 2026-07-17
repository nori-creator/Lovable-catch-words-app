import { useEffect, useRef } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Vision Pro–style scan overlay — 3-act composition:
 *
 *   Act 1 · sensing  — a soft aura converges from the edges toward the center,
 *                       a breathing depth-ring anchors the frame.
 *   Act 2 · reading  — a 12×8 lattice sweep from top to bottom, cells that
 *                       the sweep passes briefly ignite; 3–5 random cells
 *                       lock with corner brackets ("gaze locks"); a sparse
 *                       depth wireframe hints at 3D understanding.
 *   Act 3 · matching — every particle vectors toward the reticle, converging
 *                       into a bright point that the caller then blooms into
 *                       the word card.
 *
 * The parent (scan.tsx) owns the actual detection lifecycle; this component
 * is purely presentational and reacts to the `stage` prop.
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
  const hapticSelTimer = useRef<number>(0);

  // Keep an up-to-date stage in a ref so the RAF loop sees changes without restart.
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

    // Time-of-day accent (Deep Ocean palette, subtle drift)
    const hour = new Date().getHours();
    const accent =
      hour >= 5 && hour < 11 ? [180, 240, 255] :   // dawn cyan
      hour >= 11 && hour < 17 ? [125, 211, 252] :  // day cyan
      hour >= 17 && hour < 20 ? [255, 190, 200] :  // dusk warm
      [148, 163, 255];                              // night indigo
    const rgba = (a: number) => `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${a.toFixed(3)})`;

    // ─────────── particles ───────────
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
    const particles: P[] = [];
    const spawn = () => {
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.min(w, h) * (0.35 + Math.random() * 0.2);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const life = 800 + Math.random() * 600;
      particles.push({
        x, y,
        vx: (cx - x) * 0.00035,
        vy: (cy - y) * 0.00035,
        life, max: life,
        size: (1 + Math.random() * 2.2) * dpr,
      });
    };

    // ─────────── gaze-lock cells (Act 2) ───────────
    type Lock = { col: number; row: number; born: number };
    let locks: Lock[] = [];
    let lastLockAt = 0;

    // ─────────── depth wireframe (Act 2) — sparse triangles ───────────
    const WF_COUNT = 14;
    const wfPoints: Array<{ x: number; y: number; dx: number; dy: number }> = [];
    for (let i = 0; i < WF_COUNT; i++) {
      wfPoints.push({
        x: Math.random(), y: Math.random(),
        dx: (Math.random() - 0.5) * 0.00006,
        dy: (Math.random() - 0.5) * 0.00006,
      });
    }

    const tick = (now: number) => {
      const w = canvas.width, h = canvas.height;
      const elapsed = now - startRef.current;
      const stageT = now - stageStartRef.current;
      const st = stageRef.current;
      ctx.clearRect(0, 0, w, h);

      // 1) vignette — deeper during matching for the "reveal" beat
      const vignetteAlpha = st === "matching" ? 0.85 : st === "reading" ? 0.65 : 0.5;
      const rg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.08, w / 2, h / 2, Math.max(w, h) * 0.72);
      rg.addColorStop(0, `rgba(6, 12, 30, ${(vignetteAlpha * 0.4).toFixed(3)})`);
      rg.addColorStop(1, `rgba(4, 8, 22, ${vignetteAlpha.toFixed(3)})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      // 2) act-specific layers
      if (st === "sensing") {
        // Aura converging: draw a ring whose radius shrinks from edge to center
        const p = Math.min(1, stageT / 700);
        const maxR = Math.hypot(w, h) * 0.6;
        const r0 = maxR * (1 - p * 0.65);
        const auraGrad = ctx.createRadialGradient(w / 2, h / 2, r0 * 0.85, w / 2, h / 2, r0);
        auraGrad.addColorStop(0, rgba(0));
        auraGrad.addColorStop(0.7, rgba(0.06 + p * 0.06));
        auraGrad.addColorStop(1, rgba(0));
        ctx.fillStyle = auraGrad;
        ctx.fillRect(0, 0, w, h);
        // faint thin crosshair
        ctx.strokeStyle = rgba(0.35);
        ctx.lineWidth = dpr;
        const cx = w / 2, cy = h / 2, arm = 18 * dpr;
        ctx.beginPath();
        ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - 4 * dpr, cy);
        ctx.moveTo(cx + 4 * dpr, cy); ctx.lineTo(cx + arm, cy);
        ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - 4 * dpr);
        ctx.moveTo(cx, cy + 4 * dpr); ctx.lineTo(cx, cy + arm);
        ctx.stroke();
      } else if (st === "reading") {
        // 2a — sparse depth wireframe (triangulated soft mesh)
        ctx.strokeStyle = rgba(0.16);
        ctx.lineWidth = Math.max(1, dpr * 0.5);
        for (const pt of wfPoints) {
          pt.x = (pt.x + pt.dx * 16 + 1) % 1;
          pt.y = (pt.y + pt.dy * 16 + 1) % 1;
        }
        for (let i = 0; i < wfPoints.length; i++) {
          const a = wfPoints[i];
          const b = wfPoints[(i + 3) % wfPoints.length];
          const c = wfPoints[(i + 7) % wfPoints.length];
          ctx.beginPath();
          ctx.moveTo(a.x * w, a.y * h);
          ctx.lineTo(b.x * w, b.y * h);
          ctx.lineTo(c.x * w, c.y * h);
          ctx.closePath();
          ctx.stroke();
        }

        // 2b — 12×8 lattice
        const cols = 8, rows = 12;
        const cw = w / cols, ch = h / rows;
        ctx.lineWidth = Math.max(1, dpr * 0.6);
        ctx.strokeStyle = rgba(0.14);
        for (let c = 0; c <= cols; c++) {
          ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, h); ctx.stroke();
        }
        for (let r = 0; r <= rows; r++) {
          ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(w, r * ch); ctx.stroke();
        }

        // 2c — sweep line (top→bottom, 900ms, loop)
        const sweepPhase = (stageT % 1100) / 1100;
        const sy = sweepPhase * h;
        const swBand = 70 * dpr;
        const grad = ctx.createLinearGradient(0, sy - swBand, 0, sy + swBand);
        grad.addColorStop(0, rgba(0));
        grad.addColorStop(0.5, rgba(0.55));
        grad.addColorStop(1, rgba(0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, sy - swBand, w, swBand * 2);

        // 2d — ignite cells the sweep just passed
        const passedRow = Math.floor(sy / ch);
        if (passedRow >= 0 && passedRow < rows) {
          for (let c = 0; c < cols; c++) {
            if (((c + passedRow) * 37 + Math.floor(elapsed / 60)) % 5 === 0) {
              ctx.fillStyle = rgba(0.10);
              ctx.fillRect(c * cw + 1, passedRow * ch + 1, cw - 2, ch - 2);
            }
          }
        }

        // 2e — periodically spawn gaze-locks
        if (now - lastLockAt > 260 && locks.length < 4) {
          lastLockAt = now;
          locks.push({ col: Math.floor(Math.random() * cols), row: Math.floor(Math.random() * rows), born: now });
        }
        locks = locks.filter((l) => now - l.born < 900);
        for (const l of locks) {
          const age = (now - l.born) / 900;
          const a = 0.9 * (1 - age);
          const x = l.col * cw, y = l.row * ch;
          const bl = 10 * dpr;
          ctx.strokeStyle = rgba(a);
          ctx.lineWidth = 1.6 * dpr;
          // 4 corner brackets
          ctx.beginPath();
          ctx.moveTo(x, y + bl); ctx.lineTo(x, y); ctx.lineTo(x + bl, y);
          ctx.moveTo(x + cw - bl, y); ctx.lineTo(x + cw, y); ctx.lineTo(x + cw, y + bl);
          ctx.moveTo(x + cw, y + ch - bl); ctx.lineTo(x + cw, y + ch); ctx.lineTo(x + cw - bl, y + ch);
          ctx.moveTo(x + bl, y + ch); ctx.lineTo(x, y + ch); ctx.lineTo(x, y + ch - bl);
          ctx.stroke();
        }
      } else {
        // matching — a bright converging point + halo
        const p = Math.min(1, stageT / 500);
        const cx = w / 2, cy = h / 2;
        // halo
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, (60 + 120 * p) * dpr);
        halo.addColorStop(0, rgba(0.55 * (1 - p) + 0.15));
        halo.addColorStop(1, rgba(0));
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);
        // bright core
        ctx.beginPath();
        ctx.arc(cx, cy, (4 + 10 * (1 - p)) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.6 + 0.35 * p).toFixed(3)})`;
        ctx.fill();
      }

      // 3) particles — attracted more strongly during matching
      if (st !== "matching" && particles.length < 80 && Math.random() < 0.65) spawn();
      const attract = st === "matching" ? 0.06 : 0.014;
      const cx = w / 2, cy = h / 2;
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.vx += (cx - pt.x) * attract * 0.001;
        pt.vy += (cy - pt.y) * attract * 0.001;
        pt.x += pt.vx * 16;
        pt.y += pt.vy * 16;
        pt.life -= 16;
        const near = Math.hypot(pt.x - cx, pt.y - cy) < 6 * dpr;
        if (pt.life <= 0 || (st === "matching" && near)) { particles.splice(i, 1); continue; }
        const a = Math.max(0, pt.life / pt.max);
        ctx.beginPath();
        ctx.fillStyle = rgba(a * 0.9);
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4) breathing depth-ring (always visible, tightens in matching)
      const baseR = st === "matching" ? 24 * dpr : 40 * dpr;
      const rc = baseR + Math.sin(elapsed / 260) * 5 * dpr;
      ctx.strokeStyle = rgba(0.7);
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rc + 14 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(0.22);
      ctx.stroke();

      // audio + haptic timers
      if (elapsed - pulseTimer.current > 700) {
        pulseTimer.current = elapsed;
        Sound.scanPulse();
      }
      if (st === "reading" && elapsed - readingSubTimer.current > 900) {
        readingSubTimer.current = elapsed;
        Sound.scanReading();
      }
      if (st === "reading" && elapsed - hapticSelTimer.current > 260) {
        hapticSelTimer.current = elapsed;
        haptic("selection");
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
          {(["sensing", "reading", "matching"] as const).map((s) => (
            <span
              key={s}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: stage === s ? 24 : 10,
                background: stage === s ? "rgba(125,211,252,0.95)" : "rgba(125,211,252,0.28)",
              }}
            />
          ))}
        </div>
        <p className="font-mono-tight text-[10px] tracking-[0.32em] text-white/85 uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}
