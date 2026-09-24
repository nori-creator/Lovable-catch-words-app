import { useState } from "react";
import { ChunkLine, ChunkLegend } from "@/components/ChunkPills";
import { CHUNK_DESIGNS, CHUNK_DESIGN_LABEL, type ChunkDesign } from "@/lib/chunk-design";
import type { ChunkPart } from "@/lib/extras";

/**
 * チャンクの札のデザイン案 A〜D を見比べる（2026-09-24）。
 * 上の A/B/C/D を押すと、下の「単語の詳細」と「復習の解説」が同じ案で変わる —
 * 2つの画面が同じ部品（`ChunkLine`）を使っていることも一緒に確かめられる。
 */
const SAMPLE: Array<{ parts: ChunkPart[]; ja: string }> = [
  {
    parts: [
      { text: "跟", pos: "Prep" },
      { text: "男朋友", pos: "N" },
      { text: "吵架", pos: "V" },
    ],
    ja: "彼氏と喧嘩する",
  },
  {
    parts: [
      { text: "動不動", pos: "Adv" },
      { text: "就", pos: "Adv" },
      { text: "吵架", pos: "V" },
    ],
    ja: "事あるごとに喧嘩する",
  },
  {
    parts: [
      { text: "點", pos: "V" },
      { text: "一杯", pos: "M" },
      { text: "珍珠奶茶", pos: "N" },
    ],
    ja: "タピオカミルクティーを1杯頼む",
  },
  {
    parts: [
      { text: "半糖", pos: "Vs" },
      { text: "少冰", pos: "Vs" },
    ],
    ja: "甘さ半分・氷少なめ",
  },
];

export function ChunkDesignsScene({ q }: { q: URLSearchParams }) {
  const initial = (CHUNK_DESIGNS as readonly string[]).includes(q.get("d") ?? "")
    ? (q.get("d") as ChunkDesign)
    : "float";
  const [design, setDesign] = useState<ChunkDesign>(initial);
  return (
    <div style={{ padding: "12px 16px 96px", display: "grid", gap: 16 }}>
      <div role="radiogroup" aria-label="チャンクのデザイン案" style={{ display: "grid", gap: 6 }}>
        {CHUNK_DESIGNS.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={design === d}
            onClick={() => setDesign(d)}
            className={`rounded-2xl border px-3 py-2 text-left text-footnote font-semibold ${
              design === d ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
            }`}
          >
            {CHUNK_DESIGN_LABEL[d]}
          </button>
        ))}
      </div>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 text-body font-semibold">単語の詳細: 使い方チャンク</h3>
        <div className="grid gap-3">
          {SAMPLE.map((c, i) => (
            <ChunkLine
              key={i}
              parts={c.parts}
              translation={c.ja}
              lang="zh-TW"
              speakText={c.parts.map((p) => p.text).join("")}
              onSpeak={() => {}}
              design={design}
            />
          ))}
        </div>
        <ChunkLegend parts={SAMPLE.flatMap((c) => c.parts)} />
      </section>

      <section className="rounded-xl bg-secondary/60 px-3 py-2">
        <p className="text-caption font-semibold text-muted-foreground">
          復習の解説: よく使うチャンク
        </p>
        <div className="mt-1.5 grid gap-2">
          {SAMPLE.slice(0, 2).map((c, i) => (
            <ChunkLine
              key={i}
              parts={c.parts}
              translation={c.ja}
              lang="zh-TW"
              speakText={c.parts.map((p) => p.text).join("")}
              design={design}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
