import { ChunkLine, ChunkLegend } from "@/components/ChunkPills";
import type { ChunkPart } from "@/lib/extras";
import { readySpeech } from "../speech";

/**
 * チャンクの公式の形（F、オーナー決定 2026-09-27）。入れ替える所（点線の枠）
 * にも、いちばんよく入る具体語が入る。「単語の詳細」と「復習の解説」が
 * 同じ部品（`ChunkLine`）を使っていることも一緒に確かめられる。
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
      { text: "男朋友", pos: "N", slot: true },
      { text: "吵架", pos: "V-sep" },
    ],
    ja: "彼氏と喧嘩する",
  },
  {
    parts: [
      { text: "為了", pos: "Prep" },
      { text: "錢", pos: "N", slot: true },
      { text: "吵架", pos: "V-sep" },
    ],
    ja: "お金のことで喧嘩する",
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
      { text: "一杯", pos: "M", slot: true },
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

export function ChunkDesignsScene() {
  return (
    <div style={{ padding: "12px 16px 96px", display: "grid", gap: 16 }}>
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
            />
          ))}
        </div>
      </section>
    </div>
  );
}
