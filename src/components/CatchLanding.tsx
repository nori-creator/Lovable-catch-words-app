import { forwardRef, type RefObject } from "react";
import { waitForRef } from "@/lib/wait-for-ref";
import { Sound, unlockAudio } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { getVariant } from "@/lib/effect-lab";
import { Term } from "@/components/Term";
import type { LandingRunner } from "@/components/effects/catch-landing/types";
import { v1classic } from "@/components/effects/catch-landing/v1_classic";
import { v2fullwidth } from "@/components/effects/catch-landing/v2_fullwidth";
import { v3voiceline } from "@/components/effects/catch-landing/v3_voiceline";
import { v4hold } from "@/components/effects/catch-landing/v4_hold";

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
  v4hold,
};

/**
 * 短い「キャッチ!」音。
 *
 * 中身は sound-engine の `Sound.catchChime()`。以前ここには**自前の
 * AudioContext**があり、音量設定(オフ/控えめ/しっかり)を無視して
 * 常に同じ大きさで鳴っていた。「オフ」を選んでも、アプリでいちばん
 * 大きな音だけが鳴る — 設定が嘘になっていた。
 */
export function playCatchChime() {
  Sound.catchChime();
}

/**
 * 選ばれている版の振り付けを走らせる。
 * reduced motion のときは飛行そのものを省き、音と振動だけ残す。
 */
export async function runCatchLanding(ctx: {
  startEl: HTMLElement | null;
  /**
   * 飛ぶ絵の ref。**中身ではなく ref を渡す。**
   * 覆いの層は呼ぶ側の `setLanding(true)` で初めて描かれるので、
   * `.current` を先に読むと必ず null になる(`lib/wait-for-ref.ts` に経緯)。
   */
  fly: RefObject<HTMLImageElement | null>;
  speakLine?: () => void;
}): Promise<void> {
  // ここは保存の往復のあとなので、**厳密にはユーザー操作の中ではない**。
  // それでも毎回呼ぶ理由は、iOS がアプリを背面に回すたびに AudioContext を
  // suspended に落とすから — 解錠は一度きりの手続きではない。
  // (最初の1回の解錠は、設定の試聴やタップ音など操作の中で走る側に任せる。)
  unlockAudio();
  playCatchChime();
  // 生の navigator.vibrate だと**振動オフの設定を無視する**。
  // 触覚は「うるさい」と感じた人が切るためのもので、切れないなら意味がない。
  haptic("success");
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  const run = CATCH_LANDING_VARIANTS[getVariant("catchLanding")] ?? v4hold;
  await run({
    startEl: ctx.startEl,
    fly: await waitForRef(ctx.fly),
    dexEl: document.querySelector('[data-nav="/dex"]') as HTMLElement | null,
    speakLine: ctx.speakLine,
  });
}

type OverlayProps = {
  /** 飛ぶ絵(切り抜きがあれば切り抜き、なければ写真そのまま)。 */
  image: string | null;
  headword: string;
  /** その語の学習言語。**渡さないと台湾華語として組む**(既定)。 */
  lang?: string | null;
  /** 注音・ピンインなど、大きな単語の下に添える読み。 */
  reading?: string | null;
};

/**
 * 演出中だけ載せる層。ref は「実際に飛ぶ画像」に繋がる。
 * 呼ぶ側は演出フェーズのときだけ描画すること。
 */
export const CatchLandingOverlay = forwardRef<HTMLImageElement, OverlayProps>(
  function CatchLandingOverlay({ image, headword, reading, lang }, flyRef) {
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
        {/* 広がりきった瞬間に一度だけ走る「キラッ」 */}
        <div id="catch-glint" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          <span className="catch-glint-bar" />
        </div>
        <div
          id="catch-hero-word"
          className="pointer-events-none fixed left-1/2 z-[61] -translate-x-1/2 text-center opacity-0"
          style={{ top: "68%" }}
        >
          {/* **その語の字で組む**(`Term` の注)。`lang="zh-Hant"` の
              決め打ちだと、英語の語に中国語のフォントが当たる。 */}
          <Term
            as="div"
            lang={lang}
            className="text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]"
          >
            {headword}
          </Term>
          {reading && (
            <Term
              as="div"
              lang={lang}
              className="mt-2 text-title font-semibold text-amber-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
            >
              {reading}
            </Term>
          )}
          <div className="mt-1 text-body font-medium text-white/85">GET!</div>
        </div>
      </>
    );
  },
);
