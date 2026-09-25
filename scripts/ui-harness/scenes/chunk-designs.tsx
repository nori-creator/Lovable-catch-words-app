import { useState } from "react";
import { ChunkLine, ChunkLegend } from "@/components/ChunkPills";
import { CHUNK_DESIGNS, CHUNK_DESIGN_LABEL, type ChunkDesign } from "@/lib/chunk-design";
import type { ChunkPart } from "@/lib/extras";
import { readySpeech } from "../speech";

/**
 * チャンクの札の**形**の案 A〜F を見比べる（2026-09-25）。
 * 質感はどれも「色付きのガラス・押すと弾む」（前回オーナーが選んだ形）。
 * 上の A〜F を押すと、下の「単語の詳細」と「復習の解説」が同じ案で変わる —
 * 2つの画面が同じ部品（`ChunkLine`）を使っていることも一緒に確かめられる。
 *
 * 札を押すとその語、右端の青いボタンで型ぜんぶが鳴る（確認用ページには
 * 音声の仕組みが無いので、ボタンは出すが音は鳴らない）。
 */
type Sample = { parts: ChunkPart[]; ja: string };
const WORD = "吵架";
const WORD_CHUNKS: Sample[] = [
  {
    parts: [
      { text: "跟", pos: "Prep" },
      { text: "人", pos: "N", slot: true },
      { text: "吵架", pos: "V-sep" },
    ],
    ja: "（人）と喧嘩する",
  },
  {
    parts: [
      { text: "為了", pos: "Prep" },
      { text: "事", pos: "N", slot: true },
      { text: "吵架", pos: "V-sep" },
    ],
    ja: "（事）のことで喧嘩する",
  },
  {
    parts: [
      { text: "動不動", pos: "Adv" },
      { text: "就", pos: "Adv" },
      { text: "吵架", pos: "V-sep" },
    ],
    ja: "何かにつけてすぐ喧嘩する",
  },
  {
    parts: [
      { text: "吵", pos: "V-sep" },
      { text: "了", pos: "Ptc" },
      { text: "一架", pos: "M" },
    ],
    ja: "一度喧嘩した",
  },
];
const REVIEW_WORD = "珍珠奶茶";
const REVIEW_CHUNKS: Sample[] = [
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
      { text: "珍珠奶茶", pos: "N" },
      { text: "半糖", pos: "Vs" },
      { text: "少冰", pos: "Vs" },
    ],
    ja: "タピオカミルクティー、甘さ半分・氷少なめ",
  },
];
const speech = (c: Sample) => c.parts.map((p) => p.text).join("");
readySpeech([...WORD_CHUNKS, ...REVIEW_CHUNKS].map(speech));

export function ChunkDesignsScene({ q }: { q: URLSearchParams }) {
  const asked = q.get("d") ?? "";
  const initial: ChunkDesign = (CHUNK_DESIGNS as readonly string[]).includes(asked)
    ? (asked as ChunkDesign)
    : "glass";
  const [design, setDesign] = useState<ChunkDesign>(initial);
  return (
    <div style={{ padding: "12px 16px 96px", display: "grid", gap: 16 }}>
      <div role="radiogroup" aria-label="チャンクの形の案" style={{ display: "grid", gap: 6 }}>
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
        <h3 className="mb-2 text-body font-semibold">単語の詳細: 使い方チャンク（{WORD}）</h3>
        <div className="usage-chunks">
          {WORD_CHUNKS.map((c, i) => (
            <div key={i} className="usage-chunk-row">
              <ChunkLine
                parts={c.parts}
                translation={c.ja}
                lang="zh-TW"
                speakText={speech(c)}
                onSpeak={() => {}}
                design={design}
                headword={WORD}
              />
            </div>
          ))}
        </div>
        <ChunkLegend parts={WORD_CHUNKS.flatMap((c) => c.parts)} />
      </section>

      <section className="rounded-xl bg-secondary/60 px-3 py-2">
        <p className="text-caption font-semibold text-muted-foreground">
          復習の解説: よく使うチャンク（{REVIEW_WORD}）
        </p>
        <div className="mt-1.5 space-y-1.5">
          {REVIEW_CHUNKS.map((c, i) => (
            <ChunkLine
              key={i}
              parts={c.parts}
              translation={c.ja}
              lang="zh-TW"
              speakText={speech(c)}
              onSpeak={() => {}}
              design={design}
              headword={REVIEW_WORD}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
