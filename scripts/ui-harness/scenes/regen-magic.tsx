import { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { playMagicSwap, snapshotForSwap } from "@/lib/magic-swap";

/**
 * **解説の作り直し — 魔法の入れ替わり**（オーナー指示 2026-09-27、新幹線の
 * 動画を参考に）。本番と同じ `magic-swap.ts` を使う。
 *
 * 「作り直す」を押すと、古い例文は**読めるまま**光の筋が流れ（AI を待つ
 * 1.4 秒の見立て）、届いたら古い方が砂になって散り、新しい方が浮かび上がる。
 */
const VERSIONS = [
  { zh: "我想喝一杯珍珠奶茶。", ja: "タピオカミルクティーを一杯飲みたい。" },
  {
    zh: "這家的珍珠奶茶半糖少冰最好喝。",
    ja: "この店のタピオカミルクティーは甘さ半分・氷少なめが一番おいしい。",
  },
  { zh: "排了半小時才買到珍珠奶茶！", ja: "30分並んでやっとタピオカミルクティーが買えた！" },
];

export function RegenMagicScene() {
  const [i, setI] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const v = VERSIONS[i % VERSIONS.length];
  async function regen() {
    if (waiting) return;
    setWaiting(true);
    await new Promise((r) => setTimeout(r, 1400));
    const ghost = snapshotForSwap(body.current);
    setI((n) => n + 1);
    setWaiting(false);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    void playMagicSwap(body.current, ghost);
  }
  return (
    <div className="space-y-4 pb-28">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-caption text-primary-foreground">
            例
          </span>
          <h3 className="text-footnote font-semibold">例文</h3>
          {/* **円形の矢印に戻した**（オーナー指示 2026-09-28「単語の作り直すボタン大きすぎる
              から、円形の矢印に戻して」）。本番の `WordCard` の節の ↻ と同じ寸法
              （見た目 32px・当たり 44px）。 */}
          <button
            type="button"
            onClick={regen}
            disabled={waiting}
            aria-label="例文: 作り直す"
            title="作り直す"
            className="relative ml-auto grid h-8 w-8 place-items-center rounded-full text-muted-foreground/60 transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-secondary hover:text-foreground disabled:text-muted-foreground/40"
          >
            {waiting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div ref={body} className={waiting ? "magic-wait" : undefined}>
          <div className="rounded-xl bg-secondary/60 p-3">
            <p lang="zh-Hant" className="text-headline">
              {v.zh}
            </p>
            <p className="mt-2 text-footnote text-muted-foreground">{v.ja}</p>
          </div>
        </div>
      </section>
      <p className="text-caption leading-relaxed text-muted-foreground">
        本番では各項目の ↻（作り直し）と「報告」で直したときにこの動きになります。
        動きを減らす設定では、短い重ね替えだけになります。
      </p>
    </div>
  );
}
