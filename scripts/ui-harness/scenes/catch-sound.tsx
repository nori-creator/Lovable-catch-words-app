/**
 * キャッチの祝福の音を**聴き比べる**。（オーナー指示 2026-09-23「祝福のアニメーションの
 * BGM…映画のクライマックスを盛り上げる音」）
 *
 * 実物の演出（`v5_reward.ts`）と同じ順・同じ間で鳴らす。語の発音は端末の声で
 * 「珍珠奶茶」を読む（端末に中国語の声が無ければ 1 秒の無音で代える）。
 * 音量は「しっかり」で鳴らす（控えめだと小さくて比べにくい）。
 *
 * `window.__cwScore` は検査（波形の書き出し）から同じ音を呼ぶための口。
 */
import { useState } from "react";
import { Score, SCORE } from "@/lib/celebration-score";
import { setLevel, Sound, unlockAudio } from "@/lib/sound-engine";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function speak(): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
    const voice = synth?.getVoices().find((v) => v.lang.toLowerCase().startsWith("zh"));
    if (!synth || !voice) {
      void wait(1000).then(resolve);
      return;
    }
    const u = new SpeechSynthesisUtterance("珍珠奶茶");
    u.voice = voice;
    u.lang = voice.lang;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
    window.setTimeout(resolve, 2600);
  });
}

type Step = "grip" | "build" | "hit" | "speech" | "resolve" | "transfer" | "land";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "grip", label: "つかむ" },
  { id: "build", label: "溜め（加速・上昇）" },
  { id: "hit", label: "頂点（一瞬の間 → 打撃）" },
  { id: "speech", label: "発音（BGM を 20dB 下げる）" },
  { id: "resolve", label: "二度目の山（ソ → ド）" },
  { id: "transfer", label: "図鑑へ飛ぶ" },
  { id: "land", label: "着地（ティンパニ）" },
];

/** 新しい音。実物の演出と同じ間。 */
async function playNew(on: (s: Step) => void) {
  on("grip");
  Sound.rewardGrip();
  await wait(120);
  on("build");
  Score.build();
  await wait(SCORE.build.hitMs);
  on("hit");
  Score.hit();
  await wait(SCORE.speechDelayMs);
  on("speech");
  Score.duck(true);
  await speak();
  on("resolve");
  Score.resolve();
  Sound.itemGlint();
  await wait(460);
  on("transfer");
  Sound.rewardTransfer();
  await wait(320);
  Sound.itemDrop();
  await wait(240);
  on("land");
  Sound.shelfLand();
  Score.land();
}

/** これまでの音（比較用）。 */
async function playOld(on: (s: Step) => void) {
  on("grip");
  Sound.rewardGrip();
  await wait(120);
  on("build");
  Sound.itemFanfare();
  await wait(480);
  on("speech");
  await speak();
  on("resolve");
  Sound.itemGlint();
  await wait(460);
  on("transfer");
  Sound.rewardTransfer();
  await wait(320);
  Sound.itemDrop();
  await wait(240);
  on("land");
  Sound.shelfLand();
}

if (typeof window !== "undefined") {
  (window as unknown as { __cwScore?: unknown }).__cwScore = { Score, SCORE, Sound, setLevel };
}

export function CatchSoundScene() {
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (which: "new" | "old") => {
    if (busy) return;
    setBusy(true);
    setLevel("full");
    unlockAudio();
    try {
      await (which === "new" ? playNew : playOld)(setStep);
      await wait(900);
    } finally {
      setStep(null);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5 px-4 py-6">
      <div>
        <h1 className="text-title font-bold">キャッチの祝福の音</h1>
        <p className="mt-1 text-footnote text-muted-foreground">
          押すと、実際の演出と同じ順・同じ間で鳴ります。音を出せる状態で聴いてください。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("new")}
          className="press-in min-h-14 rounded-2xl bg-primary px-4 font-semibold text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-50"
        >
          ▶ 新しい音（BGM）
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("old")}
          className="press-in min-h-14 rounded-2xl bg-secondary px-4 font-semibold disabled:opacity-50"
        >
          ▶ これまでの音
        </button>
      </div>
      <ol className="space-y-1.5" aria-live="polite">
        {STEPS.map((s) => (
          <li
            key={s.id}
            data-on={step === s.id || undefined}
            className="rounded-xl border border-border px-3 py-2 text-footnote transition-colors data-[on]:border-primary data-[on]:bg-primary/10 data-[on]:font-semibold"
          >
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
