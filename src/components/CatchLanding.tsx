import { forwardRef, type CSSProperties, type RefObject } from "react";
import { waitForRef } from "@/lib/wait-for-ref";
import { Score, SCORE } from "@/lib/celebration-score";
import { unlockAudio } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { Term } from "@/components/Term";
import { v5reward } from "@/components/effects/catch-landing/v5_reward";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import {
  isCatchMilestone,
  planCatchAnimation,
  readCatchAnimation,
  readCollection,
  type CatchAnimationPlan,
} from "@/lib/catch-animation-pref";

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
  speakLine?: () => void | Promise<void>;
  destinationId?: string;
  /** 保存済みの札を後から受け取る口(`types.ts` の注)。 */
  getDestinationId?: () => string | undefined;
  openDex?: () => void | Promise<void>;
  /** 保存の通信。見せ場の1秒がこれを待つ。 */
  gate?: Promise<unknown>;
  /**
   * 節目か（`catch-animation-pref.ts`）。**分かる呼び手だけ渡す**（新しいカテゴリーが
   * 増えた時など）。渡さなければ、一覧のキャッシュの数から決める。
   */
  milestone?: boolean;
  /** 演出を名指しする（見本・試験用）。渡さなければ本人の設定と節目から決める。 */
  plan?: CatchAnimationPlan;
}): Promise<void> {
  // ここは保存の往復のあとなので、**厳密にはユーザー操作の中ではない**。
  // それでも毎回呼ぶ理由は、iOS がアプリを背面に回すたびに AudioContext を
  // suspended に落とすから — 解錠は一度きりの手続きではない。
  // (最初の1回の解錠は、設定の試聴やタップ音など操作の中で走る側に任せる。)
  unlockAudio();
  const plan = ctx.plan ?? planCatchAnimation(readCatchAnimation(), landingMilestone(ctx));
  if (plan === "off") return runQuietLanding(ctx);
  const reducedMotion = motionReducedNow();
  if (reducedMotion) {
    // 動きを減らしていても音は同じ山場を鳴らす（音は動きではない）。
    // 語は打撃の響きが引いてから、BGM を下げて読む。
    Score.hit();
    haptic("success");
    void new Promise((r) => setTimeout(r, SCORE.speechDelayMs))
      .then(() => {
        Score.duck(true);
        return ctx.speakLine?.();
      })
      .catch(() => {})
      .finally(() => Score.resolve());
    // **図鑑へ移る前に保存を待つ。**
    // 演出は押した瞬間に始まるので、ここではまだ札の id が決まっていない。
    // 待たずに移ると `?justCaught=` が空のまま図鑑が開き、
    // **動きを減らしている人だけ着弾が出ない**ことになる。
    if (ctx.gate) {
      try {
        await ctx.gate;
      } catch {
        return;
      }
    }
    await ctx.openDex?.();
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  await v5reward({
    startEl: ctx.startEl,
    fly: await waitForRef(ctx.fly),
    dexEl: document.querySelector('[data-nav="/dex"]') as HTMLElement | null,
    speakLine: ctx.speakLine,
    destinationId: ctx.destinationId,
    getDestinationId: ctx.getDestinationId,
    openDex: ctx.openDex,
    gate: ctx.gate,
    intensity: plan,
  });
}

/**
 * 今回が節目か。呼び手が知っていればそれを使い、知らなければ一覧のキャッシュの
 * 数から決める。**押した瞬間に読む**（保存の後だと、今回の札が数に入ってしまう）。
 * 着地先が既に一覧に在るなら再会（数は増えない）。
 */
function landingMilestone(ctx: {
  milestone?: boolean;
  destinationId?: string;
  getDestinationId?: () => string | undefined;
}): boolean {
  if (typeof ctx.milestone === "boolean") return ctx.milestone;
  const collection = readCollection();
  const known = ctx.getDestinationId?.() ?? ctx.destinationId;
  return isCatchMilestone({
    previousCount: collection?.count ?? null,
    reencounter: Boolean(known && collection?.has(known)),
  });
}

/**
 * **演出を切った人の着地**（設定「キャッチの演出: オフ」）。
 * 絵は飛ばさず BGM も鳴らさないが、**語は必ず読む**（発音は飾りではなく学び）。
 * 図鑑へ移るのは保存を待ってから（動きを減らした時と同じ理由）。
 */
async function runQuietLanding(ctx: {
  speakLine?: () => void | Promise<void>;
  openDex?: () => void | Promise<void>;
  gate?: Promise<unknown>;
}): Promise<void> {
  haptic("light");
  void Promise.resolve()
    .then(() => ctx.speakLine?.())
    .catch(() => {});
  if (ctx.gate) {
    try {
      await ctx.gate;
    } catch {
      return;
    }
  }
  await ctx.openDex?.();
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
    const accents = Array.from({ length: 12 }, (_, index) => index);
    return (
      <div id="reward-catch" data-stage="idle" className="reward-catch" aria-live="polite">
        <div className="reward-catch__veil" />
        <div className="reward-catch__field" />
        <div className="reward-catch__shockwave" />
        <div className="reward-catch__charge" />
        <div className="reward-catch__particles" aria-hidden>
          {accents.map((index) => (
            <i key={index} style={{ "--reward-i": index } as CSSProperties} />
          ))}
        </div>
        <img
          ref={flyRef}
          src={
            image ??
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E"
          }
          alt=""
          className={`reward-catch__image ${image ? "" : "reward-catch__image--empty"}`}
        />
        <div className="reward-catch__copy">
          <Term as="div" lang={lang} className="reward-catch__word">
            {headword}
          </Term>
          {reading && (
            <Term as="div" lang={lang} className="reward-catch__reading">
              {reading}
            </Term>
          )}
        </div>
      </div>
    );
  },
);
