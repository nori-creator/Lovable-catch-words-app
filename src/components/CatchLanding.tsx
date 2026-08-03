import { forwardRef } from "react";
import { getVariant } from "@/lib/effect-lab";
import type { LandingRunner } from "@/components/effects/catch-landing/types";
import { v1classic } from "@/components/effects/catch-landing/v1_classic";
import { v2fullwidth } from "@/components/effects/catch-landing/v2_fullwidth";
import { v3voiceline } from "@/components/effects/catch-landing/v3_voiceline";

/**
 * キャッチ→図鑑の着弾演出、まるごと一式。
 *
 * もともとはスキャンのシートの中だけにあり、**カメラから撮るフローには
 * 何の演出もなかった**(保存したら図鑑に飛ぶだけ)。同じ体験を両方の入口で
 * 出せるよう、飛ぶ画像・閃光・大きな単語・キーフレームをここへ集約する。
 *
 * 振り付けそのものは effects/catch-landing/ の variant 側。ここが持つのは
 * **どの版でも共通の前後処理**(チャイム・振動・reduced motion の判定)と、
 * 振り付けが掴む DOM(#catch-trail / #catch-hero-flash / #catch-hero-word)。
 */

const CATCH_LANDING_VARIANTS: Record<string, LandingRunner> = {
  v1classic,
  v2fullwidth,
  v3voiceline,
};

/** 短い「キャッチ!」音 — WebAudio、音源ファイルなし。 */
export function playCatchChime() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const t = ctx.currentTime;

    // 「ポン」: 低めのサイン波を素早くピッチダウンさせる水滴風ポップ
    {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.12);
      o.connect(g).connect(ctx.destination);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t);
      o.stop(t + 0.2);
    }

    // 「キラン」: 高いサイン波2音を薄く重ねて素早く減衰
    [1568, 2349].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g).connect(ctx.destination);
      const t0 = t + 0.1 + i * 0.05;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.1 : 0.06, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.start(t0);
      o.stop(t0 + 0.32);
    });

    setTimeout(() => ctx.close(), 600);
  } catch {
    /* silent */
  }
}

/**
 * 選ばれている版の振り付けを走らせる。
 * reduced motion のときは飛行そのものを省き、音と振動だけ残す。
 */
export async function runCatchLanding(ctx: {
  startEl: HTMLElement | null;
  fly: HTMLImageElement | null;
  speakLine?: () => void;
}): Promise<void> {
  playCatchChime();
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([18, 40, 60]);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  const run = CATCH_LANDING_VARIANTS[getVariant("catchLanding")] ?? v1classic;
  await run({
    startEl: ctx.startEl,
    fly: ctx.fly,
    dexEl: document.querySelector('[data-nav="/dex"]') as HTMLElement | null,
    speakLine: ctx.speakLine,
  });
}

type OverlayProps = {
  /** 飛ぶ絵(切り抜きがあれば切り抜き、なければ写真そのまま)。 */
  image: string | null;
  headword: string;
  /** 注音・ピンインなど、大きな単語の下に添える読み。 */
  reading?: string | null;
};

/**
 * 演出中だけ載せる層。ref は「実際に飛ぶ画像」に繋がる。
 * 呼ぶ側は演出フェーズのときだけ描画すること。
 */
export const CatchLandingOverlay = forwardRef<HTMLImageElement, OverlayProps>(
  function CatchLandingOverlay({ image, headword, reading }, flyRef) {
    return (
      <>
        {image && (
          <>
            <div
              id="catch-trail"
              className="pointer-events-none fixed z-[59]"
              style={{
                willChange: "transform",
                transition: "transform 820ms cubic-bezier(0.5, -0.2, 0.35, 1.25)",
                width: 8,
                height: 8,
                left: 0,
                top: 0,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="absolute inset-0 -m-6 rounded-full bg-amber-300/60 blur-2xl animate-pulse" />
              <span className="absolute inset-0 -m-3 rounded-full bg-white/80 blur-md" />
            </div>
            <img
              ref={flyRef}
              src={image}
              alt=""
              className="pointer-events-none fixed z-[60] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
              style={{ willChange: "transform, opacity", left: 0, top: 0 }}
            />
          </>
        )}
        <div
          id="catch-hero-flash"
          className="pointer-events-none fixed inset-0 z-[58] opacity-0"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(253,230,138,0.35), rgba(0,0,0,0) 60%)",
          }}
        />
        <div
          id="catch-hero-word"
          className="pointer-events-none fixed left-1/2 z-[61] -translate-x-1/2 text-center opacity-0"
          style={{ top: "68%" }}
        >
          <div
            lang="zh-Hant"
            className="text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]"
          >
            {headword}
          </div>
          {reading && (
            <div
              lang="zh-Hant"
              className="mt-2 text-xl font-semibold text-amber-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
            >
              {reading}
            </div>
          )}
          <div className="mt-1 text-sm font-medium text-white/85">GET!</div>
        </div>
      </>
    );
  },
);
