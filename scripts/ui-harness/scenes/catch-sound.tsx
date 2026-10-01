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
import { photo } from "./peel-sticker";
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

const SOUNDS: Array<{ key: string; label: string; note: string }> = [
  { key: "a", label: "A 映画の山場", note: "今の音。金管の和音と打撃、最後にティンパニ" },
  { key: "e", label: "E これまで", note: "比べる用（前の音）" },
];
export function CatchSoundScene({ q }: { q?: URLSearchParams }) {
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(q?.get("sound") ?? "a");
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setLevel("full");
    unlockAudio();
    const on = (st: Step) => setStep(st);
    try {
      if (sound === "e") await playOld(on);
      else await playNew(on);
      await wait(900);
    } finally {
      setStep(null);
      setBusy(false);
    }
  };
  const pill = (on: boolean) =>
    `min-h-11 rounded-full px-3 text-footnote font-semibold ${on ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`;
  const lifted = step != null && step !== "grip" && step !== "transfer" && step !== "land";
  return (
    <div className="space-y-4 px-4 py-6">
      <div>
        <h1 className="text-title font-bold">キャッチの祝福（音と絵）</h1>
        <p className="mt-1 text-footnote text-muted-foreground">
          音を選んで ▶
          を押すと、実際の演出と同じ順・同じ間で鳴ります。音を出せる状態で聴いてください。
        </p>
      </div>
      <div role="radiogroup" aria-label="音の案" className="flex flex-wrap gap-1.5">
        {SOUNDS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={sound === o.key}
            onClick={() => setSound(o.key)}
            className={pill(sound === o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {SOUNDS.find((o) => o.key === sound)?.note}
      </p>
      <div
        className="relative grid h-72 place-items-center overflow-hidden rounded-3xl"
        style={{ background: "linear-gradient(#0b2545, #0f172a)" }}
      >
        <img
          src={photo}
          alt=""
          className="relative h-32 w-32 rounded-2xl object-cover shadow-2xl ring-4 ring-white transition-transform duration-500"
          style={{
            transform: lifted
              ? "scale(1.18) translateY(-6px)"
              : step === "land"
                ? "scale(0.6) translateY(120px)"
                : "none",
          }}
        />
        {(step === "speech" || step === "resolve") && (
          <span
            lang="zh-Hant"
            className="absolute top-4 text-hero font-bold text-white drop-shadow"
          >
            珍珠奶茶
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="press-in min-h-14 w-full rounded-2xl bg-primary px-4 font-semibold text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-50"
      >
        ▶ 鳴らす
      </button>
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
