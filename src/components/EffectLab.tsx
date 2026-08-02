import { useEffect, useState } from "react";
import { Check, Play, RotateCcw, X } from "lucide-react";
import { ScanEffectVariant, useEffectVariant } from "./ScanEffect";
import { EFFECT_VARIANTS, resetVariant, setVariant, type EffectSlot } from "@/lib/effect-lab";

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
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
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

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          ここで選んだ演出はこの端末だけに保存されます。ほかの演出(スキャン画面そのもの・
          単語候補の出方・キャッチの演出)も、同じ仕組みで枠を増やして見比べられるように
          してあります。
        </p>
      </div>
    </div>
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
