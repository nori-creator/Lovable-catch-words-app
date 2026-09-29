import { ChunkLine, ChunkLegend } from "@/components/ChunkPills";
import type { ChunkPart } from "@/lib/extras";
import { readySpeech } from "../speech";

/**
 * チャンクの公式の形（F、オーナー決定 2026-09-27）を**1本のカプセル**に継いだ形
 * （2026-09-28「チャンクだから固まりとして見せたい」）。入れ替える所（点線の下線と ▾）
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
      {
        text: "男朋友",
        pos: "N",
        slot: true,
        ja: "彼氏",
        alts: [
          { text: "女朋友", ja: "彼女" },
          { text: "朋友", ja: "友だち" },
          { text: "同事", ja: "同僚" },
          { text: "爸媽", ja: "両親" },
          { text: "室友", ja: "ルームメイト" },
        ],
      },
      { text: "吵架", pos: "V-sep" },
    ],
    ja: "彼氏と喧嘩する",
  },
  {
    parts: [
      { text: "為了", pos: "Prep" },
      {
        text: "錢",
        pos: "N",
        slot: true,
        alts: [
          { text: "小事", ja: "ささいな事" },
          { text: "家事", ja: "家事" },
          { text: "工作", ja: "仕事" },
        ],
      },
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
      {
        text: "一杯",
        pos: "M",
        slot: true,
        alts: [
          { text: "兩杯", ja: "2杯" },
          { text: "大杯", ja: "Lサイズ" },
          { text: "中杯", ja: "Mサイズ" },
        ],
      },
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
/**
 * R17 の報告そのもの（オーナーの絵: 「加熱」が点線・「滷味＋入味」に 很 が無い）。AI が返した
 * ままの形を置き、画面が直して描くことを確かめる: 動詞の 加熱 は点線にならない（slot が
 * 付いていても）、滷味＋入味 は 滷味＋很＋入味 と描かれ、読み上げも「滷味很入味」。
 */
const LUWEI = "滷味";
const LUWEI_CHUNKS: Sample[] = [
  {
    parts: [
      { text: "買", pos: "V" },
      {
        text: "豆干",
        pos: "N",
        slot: true,
        alts: [
          { text: "海帶", ja: "昆布" },
          { text: "米血", ja: "米血糕" },
          { text: "百頁豆腐", ja: "百頁豆腐" },
        ],
      },
      { text: "滷味", pos: "N" },
    ],
    ja: "豆干の滷味を買う",
  },
  {
    parts: [
      {
        text: "加熱",
        pos: "V",
        slot: true,
        alts: [{ text: "加辣", ja: "辛くする" }],
      },
      { text: "滷味", pos: "N" },
    ],
    ja: "滷味を温める",
  },
  {
    parts: [
      { text: "滷味", pos: "N" },
      { text: "入味", pos: "Vs" },
    ],
    ja: "滷味によく味が染みている",
  },
];
const speech = (c: Sample) => c.parts.map((p) => p.text).join("");
/** 入れ替えた形（語だけ・型ぜんぶ）も、本番で先に作っておくのと同じく鳴らせる状態にする。 */
const swapped = (c: Sample) =>
  c.parts.flatMap((p, i) =>
    (p.alts ?? []).flatMap((a) => [
      a.text,
      p.text,
      c.parts.map((q, j) => (j === i ? a.text : q.text)).join(""),
    ]),
  );
readySpeech(
  [...WORD_CHUNKS, ...REVIEW_CHUNKS, ...LUWEI_CHUNKS].flatMap((c) => [speech(c), ...swapped(c)]),
);

export function ChunkDesignsScene() {
  return (
    <div style={{ padding: "12px 16px 96px", display: "grid", gap: 16 }}>
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 text-body font-semibold">R17: 報告の形（{LUWEI}）</h3>
        <div className="usage-chunks">
          {LUWEI_CHUNKS.map((c, i) => (
            <div key={i} className="usage-chunk-row">
              <ChunkLine
                parts={c.parts}
                translation={c.ja}
                lang="zh-TW"
                headword={LUWEI}
                speakText={speech(c)}
                onSpeak={() => {}}
              />
            </div>
          ))}
        </div>
      </section>
      <p style={{ margin: 0, fontSize: 12, color: "#6e6e73" }}>
        点線の四角（▾）を押すとその語が鳴り、ネイティブがよく入れる語が縦の輪に並びます。回して止めた語、または押した語だけが鳴り、訳もその語に替わります（押すと輪は閉じます）。右端のボタンは入れ替えた型ぜんぶを読みます。学ぶ語（
        {WORD}
        ）は入れ替えません。
      </p>
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 text-body font-semibold">単語の詳細: 使い方チャンク（{WORD}）</h3>
        <div className="usage-chunks">
          {WORD_CHUNKS.map((c, i) => (
            <div key={i} className="usage-chunk-row">
              <ChunkLine
                parts={c.parts}
                translation={c.ja}
                lang="zh-TW"
                headword={WORD}
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
              headword={REVIEW_WORD}
              speakText={speech(c)}
              onSpeak={() => {}}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
