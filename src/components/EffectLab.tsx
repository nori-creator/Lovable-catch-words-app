import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Loader2, Play, RotateCcw, X } from "lucide-react";
import { ScanEffectVariant, useEffectVariant } from "./ScanEffect";
import {
  EFFECT_VARIANTS,
  EFFECT_LAB_EVENT,
  FLOW_PRESETS,
  applyFlowPreset,
  matchingFlowPreset,
  resetVariant,
  setVariant,
  type EffectSlot,
  type FlowPreset,
} from "@/lib/effect-lab";
import type { LandingRunner } from "@/components/effects/catch-landing/types";
import { v1classic } from "@/components/effects/catch-landing/v1_classic";
import { v2fullwidth } from "@/components/effects/catch-landing/v2_fullwidth";
import { v3voiceline } from "@/components/effects/catch-landing/v3_voiceline";

/** ラボから直接走らせる歴代のキャッチ演出。 */
const CATCH_LANDING_RUNNERS: Record<string, LandingRunner> = {
  v1classic,
  v2fullwidth,
  v3voiceline,
};

type Stage = "sensing" | "reading" | "matching";

/**
 * エフェクト・ラボ(開発者専用)
 *
 * 「昔の演出に戻したい。でもどれか思い出せない」を解くための画面。
 * 歴代の演出を**実際に動かして**見比べ、枠ごとに好きな時点のものを選ぶ。
 * 全部を同じ時点に戻す必要はない — スキャンはこの版、キャッチは別の版、
 * という混ぜ方ができるのがポイント。
 *
 * 選択は端末ローカルに保存され、アプリ本体の演出がすぐそれに変わる。
 */
export function EffectLab({ onClose }: { onClose: () => void }) {
  const slot: EffectSlot = "scanAnalyzing";
  const current = useEffectVariant(slot);
  const variants = EFFECT_VARIANTS[slot];

  // プレビューは実物と同じ流れ(sensing→reading→matching)をループさせる。
  // 止めて見たいときのために手動切替もできる。
  const [stage, setStage] = useState<Stage>("sensing");
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const order: Stage[] = ["sensing", "reading", "matching"];
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % order.length;
      setStage(order[i]);
    }, 1200);
    return () => window.clearInterval(id);
  }, [playing]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="エフェクト・ラボ"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="min-w-0 pl-1">
          <p className="text-sm font-semibold">エフェクト・ラボ</p>
          <p className="text-[11px] text-muted-foreground">
            歴代の演出を見比べて選ぶ(この端末だけ・開発者用)
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
        {/* まず「フローごと」に当たりを付ける。どの演出がどれと組み合わさって
            いたか思い出せない状態では、枠を1つずつ選ぶより時代で選ぶほうが早い。 */}
        <FlowPresetSection />

        <p className="mb-2 mt-6 text-xs font-semibold text-muted-foreground">
          スキャン中(AIが分析中)の演出
        </p>

        {/* 段階の手動切替 — 気になる瞬間で止めて見比べられる。 */}
        <div className="mb-3 flex items-center gap-1.5">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={playing}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
              playing ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            自動再生
          </button>
          {(["sensing", "reading", "matching"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setPlaying(false);
                setStage(s);
              }}
              aria-pressed={!playing && stage === s}
              className={`min-h-9 rounded-full px-3 text-xs font-medium ${
                !playing && stage === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {s === "sensing" ? "感知" : s === "reading" ? "読取" : "照合"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {variants.map((v) => {
            const selected = v.id === current;
            return (
              <section
                key={v.id}
                className={`overflow-hidden rounded-2xl border bg-card ${
                  selected ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                {/* 実物と同じ比率の枠の中で、本物の演出を動かす。 */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-black">
                  {/* 背景が無いと演出だけ浮くので、写真の代わりに市松模様を敷く。 */}
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-40"
                    style={{
                      backgroundImage:
                        "linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%)",
                      backgroundSize: "28px 28px",
                      backgroundPosition: "0 0,0 14px,14px -14px,-14px 0",
                    }}
                  />
                  <ScanEffectVariant id={v.id} stage={stage} />
                </div>

                <div className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {v.label}
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {v.date}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {v.note}
                    </p>
                  </div>
                  <button
                    onClick={() => setVariant(slot, v.id)}
                    aria-pressed={selected}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background"
                    }`}
                  >
                    {selected && <Check className="h-4 w-4" />}
                    {selected ? "使用中" : "これにする"}
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        <button
          onClick={() => resetVariant(slot)}
          className="press-in mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          既定(カメラ期)に戻す
        </button>

        {/* ② キャッチ→図鑑の着弾演出。動きなので静止画では選べない —
            その場で実際に飛ばして見比べる。 */}
        <CatchLandingSection />

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          ここで選んだ演出はこの端末だけに保存されます。スキャン画面そのものと単語候補の
          出方は、いまはページ本体の中にあるため個別の切り替えはまだできません。上の
          「フローで通し再生」では、その2つも含めた通しの流れとして確認できます。
        </p>
      </div>
    </div>
  );
}

/**
 * フローごとの比較(NORI採用の代案)。
 *
 * 「スキャン→図鑑に入るまで」を**その時期の一式**として選べるようにする。
 * 一式を当ててから、気になる枠だけ下の一覧で差し替える、という順で選べる。
 * 通しで流す「フローを再生」も置く — 演出は繋がりで印象が決まるので、
 * 分析中とキャッチを別々に見ても「あの頃の感じ」かどうかは判断しにくい。
 */
function FlowPresetSection() {
  const [active, setActive] = useState<string | null>(null);
  // 通し再生は**その時代のフローそのもの**を流す。適用しなくても見られるので、
  // 見比べてから決められる。
  const [playing, setPlaying] = useState<FlowPreset | null>(null);
  useEffect(() => {
    const sync = () => setActive(matchingFlowPreset());
    sync();
    window.addEventListener(EFFECT_LAB_EVENT, sync);
    return () => window.removeEventListener(EFFECT_LAB_EVENT, sync);
  }, []);

  return (
    <section>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">
        スキャン→図鑑のフローごと選ぶ
      </p>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        その時期の一式をまとめて適用します。あとから枠ごとに差し替えられます。
      </p>
      <div className="space-y-2">
        {FLOW_PRESETS.map((p) => {
          const selected = active === p.id;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${
                selected ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {p.label}
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {p.date}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{p.note}</p>
              </div>
              <button
                onClick={() => setPlaying(p)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-semibold"
              >
                <Play className="h-3.5 w-3.5" />
                通しで見る
              </button>
              <button
                onClick={() => applyFlowPreset(p)}
                aria-pressed={selected}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background"
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
                {selected ? "使用中" : "これに"}
              </button>
            </div>
          );
        })}
      </div>
      {active === null && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          いまは枠ごとに自分で組み合わせた状態です。
        </p>
      )}

      {playing && (
        <FlowPlayback key={playing.id} preset={playing} onDone={() => setPlaying(null)} />
      )}
    </section>
  );
}

/**
 * フローの通し再生 — 下のボタンを押してから図鑑に入るまで、**全部**。
 *
 * 演出は単体では思い出せない。「あの頃どうだったか」は
 * ボタンの名前・開く画面・切り抜きの待ち・候補の出方・着弾までの
 * **一連の流れ**として記憶されている。だから全段階を順に再現する:
 *
 *   ①下タブを押す → ②開く画面 → ③シャッター → ④解析中
 *   → ⑤候補が出る → ⑥(切り抜き) → ⑦キャッチ画面 → ⑧図鑑へ着弾
 */
type FlowStep =
  | "tab"
  | "entrance"
  | "shutter"
  | "analyzing"
  | "candidates"
  | "cutout"
  | "sheet"
  | "landing";

function FlowPlayback({ preset, onDone }: { preset: FlowPreset; onDone: () => void }) {
  const f = preset.flow;
  const analyzing = preset.variants.scanAnalyzing ?? "v8current";
  const landing = preset.variants.catchLanding ?? "v3voiceline";
  const [step, setStep] = useState<FlowStep>("tab");
  const [stage, setStage] = useState<Stage>("sensing");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      const go = async (s: FlowStep, ms: number) => {
        if (!alive) return false;
        setStep(s);
        await wait(ms);
        return alive;
      };
      if (!(await go("tab", 700))) return;
      if (!(await go("entrance", 1100))) return;
      if (!(await go("shutter", 500))) return;
      // 解析中は段階を順に見せる
      if (!alive) return;
      setStep("analyzing");
      for (const st of ["sensing", "reading", "matching"] as Stage[]) {
        if (!alive) return;
        setStage(st);
        await wait(850);
      }
      if (!(await go("candidates", 1400))) return;
      // 切り抜きがあった時代だけ、その待ち時間ごと再現する
      if (f.cutout && !(await go("cutout", 1500))) return;
      if (!(await go("sheet", 1200))) return;
      if (!alive) return;
      setStep("landing");
      await wait(60);
      const run = CATCH_LANDING_RUNNERS[landing];
      if (run) {
        await run({
          startEl: boxRef.current,
          fly: flyRef.current,
          dexEl: targetRef.current,
          speakLine: () => {},
        });
      }
      if (alive) onDone();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepLabel: Record<FlowStep, string> = {
    tab: "① 下のボタンを押す",
    entrance: `② 開く画面(${f.entrance === "capture" ? "撮影ページ" : f.entrance === "fullscreen" ? "全画面" : "枠の中"})`,
    shutter: `③ ${f.shutterLabel}`,
    analyzing: `④ ${f.analyzingLabel}`,
    candidates: "⑤ 候補が出る",
    cutout: "⑥ 背景を切り抜き",
    sheet: "⑦ キャッチ画面",
    landing: "⑧ 図鑑へ着弾",
  };

  const framed = f.entrance === "framed" && step !== "tab";

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="フローの通し再生"
    >
      {/* いまどの段階か。比較するとき「どこが違ったか」を言葉でも残す。 */}
      <div className="flex items-center gap-2 bg-black px-3 py-2">
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
          {preset.label} · {preset.date}
        </span>
        <span className="text-[11px] text-white/70">{stepLabel[step]}</span>
        <button
          onClick={onDone}
          aria-label="閉じる"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* ① ボタンを押す前 — アプリの中身が見えている状態 */}
        {step === "tab" && (
          <div className="grid h-full place-items-center">
            <p className="text-sm text-white/50">図鑑・ホームなどを見ている…</p>
          </div>
        )}

        {step !== "tab" && (
          <div className={framed ? "px-4 pt-4" : "h-full"}>
            <div
              className={
                framed
                  ? "relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black ring-1 ring-white/10"
                  : "relative h-full w-full overflow-hidden bg-black"
              }
            >
              {/* 写真の代わりの市松模様 */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%)",
                  backgroundSize: "28px 28px",
                  backgroundPosition: "0 0,0 14px,14px -14px,-14px 0",
                }}
              />

              {step === "analyzing" && <ScanEffectVariant id={analyzing} stage={stage} />}

              {/* ⑤ 候補 — 時代ごとに見せ方が違った */}
              {(step === "candidates" || step === "cutout" || step === "sheet") && (
                <FlowCandidates kind={f.candidates} />
              )}

              {/* ⑥ 切り抜き — 待ち時間そのものが体験だった */}
              {step === "cutout" && (
                <div className="absolute inset-0 grid place-items-center bg-black/60">
                  <div className="flex flex-col items-center gap-2 text-white/80">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-[11px]">切り抜き中…</p>
                  </div>
                </div>
              )}

              {/* ⑦ キャッチ画面 — 切り抜き時代は切り抜かれた絵がポンと出る */}
              {(step === "sheet" || step === "landing") && (
                <div className="absolute inset-0 grid place-items-center bg-black/70">
                  <div
                    ref={boxRef}
                    className={`grid h-28 w-28 place-items-center rounded-2xl text-4xl ${
                      f.cutout
                        ? "cutout-pop bg-transparent drop-shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
                        : "bg-gradient-to-br from-primary/40 to-primary/10"
                    } ${step === "landing" ? "opacity-0" : ""}`}
                  >
                    🧴
                  </div>
                  {step === "sheet" && (
                    <p className="absolute bottom-6 text-sm font-semibold text-white">
                      {f.cutout ? "切り抜き完了 — 図鑑へ収める" : "図鑑へ収める"}
                    </p>
                  )}
                </div>
              )}

              {/* ③ シャッター/スキャンのボタン */}
              {(step === "entrance" || step === "shutter") && (
                <div className="absolute inset-x-0 bottom-4 grid place-items-center">
                  <span
                    className={`rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-transform ${
                      step === "shutter" ? "scale-90" : ""
                    }`}
                  >
                    {f.shutterLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 下タブ — ①で押すボタンと、⑧の着弾先 */}
      <div className="flex items-center justify-around border-t border-white/10 bg-black/90 py-3">
        <span className="text-[11px] text-white/40">ホーム</span>
        <div ref={targetRef} className="grid h-11 w-11 place-items-center rounded-full bg-white/10">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
            step === "tab" ? "scale-110 bg-primary text-primary-foreground" : "text-white/40"
          }`}
        >
          {f.entranceLabel}
        </span>
        <span className="text-[11px] text-white/40">設定</span>
      </div>

      <img
        ref={flyRef}
        src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' rx='16' fill='%233b82f6'/><text x='80' y='108' font-size='72' text-anchor='middle'>🧴</text></svg>"
        alt=""
        className="pointer-events-none fixed z-[75] object-contain opacity-0"
        style={{ willChange: "transform, opacity", left: 0, top: 0, width: 112, height: 112 }}
      />
    </div>
  );
}

/** 候補の見せ方は時代で変わった(4状態レーダー → 3色 → 下に一覧つき)。 */
function FlowCandidates({ kind }: { kind: "dots4" | "dots3" | "list" }) {
  const dots =
    kind === "dots4"
      ? ["bg-white", "bg-emerald-400", "bg-amber-400", "bg-sky-400"]
      : kind === "dots3"
        ? ["bg-white", "bg-emerald-400", "bg-amber-400"]
        : ["bg-white", "bg-emerald-400"];
  const pos = [
    { l: "30%", t: "32%" },
    { l: "66%", t: "44%" },
    { l: "42%", t: "62%" },
    { l: "72%", t: "70%" },
  ];
  return (
    <>
      {dots.map((c, i) => (
        <span
          key={i}
          className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
          style={{ left: pos[i].l, top: pos[i].t }}
        >
          <span
            className={`block h-4 w-4 rounded-full ${c} shadow-[0_0_10px_2px_rgba(255,255,255,0.4)]`}
          />
          {i === 0 && (
            <span className="absolute top-full mt-1 whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
              洗髮精
            </span>
          )}
        </span>
      ))}
      {kind === "list" && (
        <div className="absolute inset-x-3 bottom-3 space-y-1">
          {["洗髮精", "毛巾"].map((w) => (
            <div
              key={w}
              className="flex items-center gap-2 rounded-xl bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-black"
            >
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              {w}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * キャッチ→図鑑の着弾演出。静止画では判断できないので「ためす」で実際に飛ばす。
 * 本物と同じ関数(effects/catch-landing)を、ラボ内の仮の写真と図鑑アイコンに
 * 向けて走らせる。
 */
function CatchLandingSection() {
  const slot: EffectSlot = "catchLanding";
  const current = useEffectVariant(slot);
  const variants = EFFECT_VARIANTS[slot];
  const boxRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  async function play(id: string) {
    if (playing) return;
    setPlaying(id);
    try {
      const run = CATCH_LANDING_RUNNERS[id];
      if (run) {
        await run({
          startEl: boxRef.current,
          fly: flyRef.current,
          dexEl: targetRef.current,
          speakLine: () => {},
        });
      }
    } finally {
      // 飛ばしたあとは元の位置に戻して、何度でも見比べられるようにする。
      const fly = flyRef.current;
      if (fly) {
        fly.style.transition = "none";
        fly.style.transform = "translate(0,0) scale(1)";
        fly.style.opacity = "0";
      }
      setPlaying(null);
    }
  }

  return (
    <section className="mt-6">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">キャッチ→図鑑の着弾演出</p>

      {/* 飛ぶ元(仮の写真)と着弾先(仮の図鑑アイコン)。 */}
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-card p-3">
        <div
          ref={boxRef}
          className="grid h-20 w-20 place-items-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 text-2xl"
        >
          📷
        </div>
        <span className="text-[11px] text-muted-foreground">→</span>
        <div
          ref={targetRef}
          className="grid h-11 w-11 place-items-center rounded-full bg-secondary"
        >
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
      </div>

      <div className="space-y-2">
        {variants.map((v) => {
          const selected = v.id === current;
          return (
            <div
              key={v.id}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${
                selected ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {v.label}
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {v.date}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{v.note}</p>
              </div>
              <button
                onClick={() => void play(v.id)}
                disabled={!!playing}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-semibold disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                {playing === v.id ? "再生中" : "ためす"}
              </button>
              <button
                onClick={() => setVariant(slot, v.id)}
                aria-pressed={selected}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background"
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
                {selected ? "使用中" : "これに"}
              </button>
            </div>
          );
        })}
      </div>

      {/* 飛ぶ画像(演出中だけ見える)。 */}
      <img
        ref={flyRef}
        src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' rx='16' fill='%233b82f6'/><text x='80' y='104' font-size='72' text-anchor='middle'>📷</text></svg>"
        alt=""
        className="pointer-events-none fixed z-[60] object-contain opacity-0"
        style={{ willChange: "transform, opacity", left: 0, top: 0, width: 80, height: 80 }}
      />
    </section>
  );
}

/**
 * 設定に置く入口。置き場所自体が管理者専用セクションなので、ここでは
 * 二重にゲートしない(?dev=1 を付け忘れて見つからない、を防ぐ)。
 */
export function EffectLabButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press-in mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-2.5 text-xs font-semibold text-primary"
      >
        🧪 エフェクト・ラボ(歴代の演出を見比べる)
      </button>
      {open && <EffectLab onClose={() => setOpen(false)} />}
    </>
  );
}
