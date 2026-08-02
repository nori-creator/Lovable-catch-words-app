import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Play, RotateCcw, X } from "lucide-react";
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
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
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
          既定(現行)に戻す
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
  const [runId, setRunId] = useState(0);
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
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {p.date}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{p.note}</p>
              </div>
              <button
                onClick={() => applyFlowPreset(p)}
                aria-pressed={selected}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background"
                }`}
              >
                {selected && <Check className="h-4 w-4" />}
                {selected ? "使用中" : "この一式"}
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => setRunId((n) => n + 1)}
        className="press-in mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-4 text-sm font-semibold text-primary"
      >
        <Play className="h-3.5 w-3.5" />
        いまの一式をフローで通し再生
      </button>

      {active === null && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          いまは枠ごとに自分で組み合わせた状態です。
        </p>
      )}

      {runId > 0 && <FlowPlayback key={runId} onDone={() => setRunId(0)} />}
    </section>
  );
}

/**
 * フローの通し再生: 分析中 → 候補が出る → キャッチして図鑑へ、を続けて見せる。
 * 演出は**繋がり**で印象が決まるので、部品を別々に見るだけでは
 * 「あの頃の感じ」かどうか判断できない。
 */
function FlowPlayback({ onDone }: { onDone: () => void }) {
  const analyzing = useEffectVariant("scanAnalyzing");
  const landing = useEffectVariant("catchLanding");
  const [step, setStep] = useState<"analyzing" | "candidates" | "catching">("analyzing");
  const [stage, setStage] = useState<Stage>("sensing");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const flyRef = useRef<HTMLImageElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      // 1) 分析中(段階を順に)
      for (const s of ["sensing", "reading", "matching"] as Stage[]) {
        if (!alive) return;
        setStage(s);
        await wait(900);
      }
      // 2) 候補が出る
      if (!alive) return;
      setStep("candidates");
      await wait(1200);
      // 3) キャッチ→図鑑へ着弾
      if (!alive) return;
      setStep("catching");
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

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="フローの通し再生"
    >
      <div className="relative flex-1 overflow-hidden">
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

        {/* 候補が出る瞬間(いまの実装の見え方を模したもの) */}
        {step !== "analyzing" && (
          <>
            <span className="absolute left-1/3 top-1/3 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center">
              <span className="block h-4 w-4 animate-pulse rounded-full bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.6)]" />
              <span className="absolute top-full mt-1 whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white">
                詞語
              </span>
            </span>
            <span className="absolute left-2/3 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center">
              <span className="block h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.5)]" />
            </span>
          </>
        )}

        {/* キャッチ時に飛ぶ元 */}
        <div
          ref={boxRef}
          className={`absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-gradient-to-br from-primary/40 to-primary/10 text-3xl transition-opacity ${
            step === "catching" ? "opacity-0" : "opacity-100"
          }`}
        >
          📷
        </div>
      </div>

      {/* 着弾先(下タブの図鑑に相当) */}
      <div className="flex items-center justify-around border-t border-white/10 bg-black/80 py-3">
        <span className="text-[11px] text-white/50">ホーム</span>
        <div ref={targetRef} className="grid h-11 w-11 place-items-center rounded-full bg-white/10">
          <BookOpen className="h-5 w-5 text-white" />
        </div>
        <span className="text-[11px] text-white/50">設定</span>
      </div>

      <img
        ref={flyRef}
        src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' rx='16' fill='%233b82f6'/><text x='80' y='104' font-size='72' text-anchor='middle'>📷</text></svg>"
        alt=""
        className="pointer-events-none fixed z-[75] object-contain opacity-0"
        style={{ willChange: "transform, opacity", left: 0, top: 0, width: 96, height: 96 }}
      />

      <button
        onClick={onDone}
        aria-label="閉じる"
        className="absolute right-3 top-3 z-[80] grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
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
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
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
