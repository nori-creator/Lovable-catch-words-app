/**
 * **単語の詳細を、今の項目・機能のまま見た目だけ磨く案**（見本・本番は未変更）。
 *
 * > オーナー指示 2026-09-28「単語の詳細の今の機能・項目のままでデザインを向上させた案を
 * > 複数提案して」
 *
 * 前回（`word-detail-designs`）は「1から考え直す」案だった。今回は**中身を1つも
 * 足さず・減らさず**、並びと器だけを変える。出す物は今の本番と同じ7つ:
 * 見出し（注音・発音・品詞・級・話し言葉の目盛り）／意味／例文／使い方チャンク／
 * 量詞／類義語・関連語／実際の使われ方（外のサイト6つ）。
 *
 *   A 1枚の紙     … 節ごとの箱をやめ、1枚の面を細い線で区切る（Apple のメモ・辞書）。
 *   B 見出しが主役 … 意味を見出しのすぐ下に上げ、答えを一目で。残りは軽い札。
 *   C 目次つき     … 上に目次の札。押すとその節へ。節の色で場所が分かる。
 *
 * チャンクだけは**本物の部品**（`ChunkLine`）を使う。見た目を変えるのは器だけで、
 * 押すと語ごとに鳴る・右端で型ぜんぶが鳴る、は今のまま。
 */
import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Hash,
  Link2,
  MessageSquareQuote,
  Network,
  Shapes,
  Sparkles,
  Volume2,
} from "lucide-react";
import { ChunkLine } from "@/components/ChunkPills";
import { FULL } from "./word-card";

const HEAD = FULL.headword;
const ZHUYIN = FULL.reading_zhuyin.split(" ");
const EX = FULL.example_sentence;
const MEASURE = FULL.extras.measure_words[0];
const RELATED = FULL.extras.related_words;
const CHUNKS = FULL.extras.usage_chunks;
const LINKS = [
  { icon: "🎬", label: "YouTube", sub: "で聞く" },
  { icon: "🗣️", label: "YouGlish", sub: "発音例" },
  { icon: "💬", label: "Dcard", sub: "で見る" },
  { icon: "🧵", label: "Threads", sub: "で見る" },
  { icon: "📰", label: "台湾のサイト", sub: "で検索" },
  { icon: "📖", label: "教育部辞典", sub: "簡編本" },
];

type Design = "a" | "b" | "c";
const DESIGNS: Array<{ key: Design; label: string; why: string[] }> = [
  {
    key: "a",
    label: "A 1枚の紙",
    why: [
      "箱の中に箱をやめる: 今は節の白い箱の中にさらに灰色の箱（例文・量詞）があり、枠が二重。枠は1つ減るたびに中身が前に出る（HIG の「控えめ」＝中身が主役）。",
      "区切りは線と余白で: 同じ面の中の見出しと細い線で、7つの節が「1つの語の話」として続いて読める（ゲシュタルトの共通領域）。",
      "外のサイト6つは3×2の升目に: 今は画面の高さの約4割を占める。押す大きさ（44px 以上）は守ったまま半分以下にする。",
    ],
  },
  {
    key: "b",
    label: "B 見出しが主役",
    why: [
      "いちばん知りたい答え（意味）を、語のすぐ下に置く: 今は別の箱に分かれていて、目が1回離れる。並べると「語→意味」が1つの塊として覚えやすい（二重符号化・近接）。",
      "大事さで大きさを変える: 今は7つの節が同じ見出し・同じ箱で並び、どれが大事か分からない。見出し＞意味＞例文＞その他、の4段にする（HIG の階層）。",
      "関連語は1語ずつ発音ボタン: 今は2語に1つのボタンが間に浮いていて、どちらが鳴るか分からない。",
    ],
  },
  {
    key: "c",
    label: "C 目次つき",
    why: [
      "上に目次の札: 押すとその節へ滑る。長い詳細でも「どこに何があるか」が最初に分かる（HIG のナビゲーション: 今どこ・どこへ行ける）。",
      "節ごとに色: アイコンの丸を節の色で塗り、目次の札と同じ色にする。色で場所を覚えられる（ただし色だけに頼らず名前も出す）。",
      "中の灰色の箱をやめ、例文は左の色の線で「引用」だと示す。",
    ],
  },
];

/** 今の本番の問題（撮った画面から数えた物）。3案すべてがこれを直す。 */
const NOW = [
  "箱の中に箱（例文・量詞の灰色の箱）で枠が二重",
  "7つの節が同じ大きさ・同じ見出しで、大事さの差が無い",
  "意味が見出しと別の箱に離れている",
  "外のサイト6つが画面の高さの約4割",
  "関連語の発音ボタンが2語の間に1つで、どちらが鳴るか曖昧",
];

// ---- 共通の部品 ------------------------------------------------------------
function Headword({ size = 40 }: { size?: number }) {
  return (
    <span lang="zh-Hant" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {[...HEAD].map((c, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1 }}>{c}</span>
          <span
            style={{
              writingMode: "vertical-rl",
              fontSize: Math.max(9, size * 0.26),
              lineHeight: 1,
              color: "color-mix(in oklab, currentColor 60%, transparent)",
              marginLeft: 1,
            }}
          >
            {ZHUYIN[i]}
          </span>
        </span>
      ))}
    </span>
  );
}

function Speak({ size = 44 }: { size?: number }) {
  return (
    <button
      type="button"
      aria-label="発音"
      className="speak-button press-in"
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: 999,
        flex: "none",
      }}
    >
      <Volume2 size={Math.round(size * 0.45)} />
    </button>
  );
}

function Tags() {
  const t: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 9px",
    borderRadius: 999,
    background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <span style={t}>名詞</span>
      <span style={{ ...t, display: "inline-flex", alignItems: "center", gap: 2 }}>
        TOCFL 2級 <ChevronDown size={12} />
      </span>
      <span style={t}>やや話し言葉</span>
    </div>
  );
}

/** 例文。見出し語だけ青。 */
function Example() {
  const at = EX.indexOf(HEAD);
  return (
    <p lang="zh-Hant" style={{ fontSize: 17, lineHeight: 1.6, margin: 0 }}>
      {EX.slice(0, at)}
      <b style={{ color: "var(--primary)" }}>{HEAD}</b>
      {EX.slice(at + HEAD.length)}
    </p>
  );
}

function Chunks() {
  return (
    <div className="usage-chunks">
      {CHUNKS.map((c, i) => (
        <div key={i} className="usage-chunk-row">
          <ChunkLine
            parts={c.parts}
            translation={c.ja}
            lang="zh-TW"
            speakText={c.parts.map((p) => p.text).join("")}
            onSpeak={() => {}}
          />
        </div>
      ))}
    </div>
  );
}

const muted: CSSProperties = { color: "var(--muted-foreground)" };

// ---- A: 1枚の紙 -------------------------------------------------------------
function Label({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: "0 0 8px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        ...muted,
      }}
    >
      {children}
    </p>
  );
}
function Rule() {
  return <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "18px 0" }} />;
}

function DesignA() {
  return (
    <article
      className="rounded-3xl border border-border bg-card"
      style={{ padding: "20px 18px 18px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Headword size={40} />
        </div>
        <Speak />
      </div>
      <div style={{ marginTop: 10 }}>
        <Tags />
      </div>
      <Rule />
      <Label>意味</Label>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{FULL.meaning_ja}</p>
      <Rule />
      <Label>例文</Label>
      <Example />
      <p style={{ margin: "4px 0 0", fontSize: 14, ...muted }}>{FULL.example_translation}</p>
      <Rule />
      <Label>使い方チャンク</Label>
      <Chunks />
      <Rule />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 14px" }}>
        <Label>量詞</Label>
        <p style={{ margin: 0, fontSize: 15 }}>
          <b lang="zh-Hant" style={{ fontSize: 17 }}>
            {MEASURE.word}
          </b>{" "}
          <span style={{ fontSize: 11, ...muted }}>{MEASURE.zhuyin}</span>
          <span style={{ marginLeft: 8, fontSize: 13, ...muted }}>{MEASURE.note}</span>
        </p>
      </div>
      <Rule />
      <Label>類義語・反義語・関連語</Label>
      <div style={{ display: "grid", gap: 2 }}>
        {RELATED.map((r) => (
          <div
            key={r.word}
            style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0 }}>
                <b lang="zh-Hant" style={{ fontSize: 17 }}>
                  {r.word}
                </b>
                <span style={{ marginLeft: 6, fontSize: 11, ...muted }}>{r.reading}</span>
              </p>
              <p style={{ margin: 0, fontSize: 13, ...muted }}>{r.note}</p>
            </div>
            <Speak size={36} />
          </div>
        ))}
      </div>
      <Rule />
      <Label>実際の使われ方</Label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {LINKS.map((l) => (
          <a
            key={l.label}
            href="#"
            onClick={(e) => e.preventDefault()}
            className="press-in"
            style={{
              display: "grid",
              justifyItems: "center",
              gap: 2,
              minHeight: 64,
              padding: "8px 4px",
              borderRadius: 14,
              background: "color-mix(in oklab, var(--foreground) 4%, transparent)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span style={{ fontSize: 20 }}>{l.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center" }}>{l.label}</span>
          </a>
        ))}
      </div>
    </article>
  );
}

// ---- B: 見出しが主役 --------------------------------------------------------
function Sub({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>{children}</h3>;
}
function Soft({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      className="rounded-3xl bg-card"
      style={{ padding: 16, minWidth: 0, boxShadow: "0 1px 0 var(--border)", ...style }}
    >
      {children}
    </section>
  );
}

function DesignB() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      <section
        className="rounded-[28px]"
        style={{
          padding: "22px 18px 18px",
          background:
            "linear-gradient(170deg, color-mix(in oklab, var(--primary) 14%, var(--card)), var(--card) 70%)",
          border: "1px solid color-mix(in oklab, var(--primary) 18%, var(--border))",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Headword size={46} />
            <p style={{ margin: "10px 0 0", fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>
              {FULL.meaning_ja}
            </p>
          </div>
          <Speak size={52} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Tags />
        </div>
      </section>

      <Soft>
        <Sub>例文</Sub>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <Example />
            <p style={{ margin: "4px 0 0", fontSize: 14, ...muted }}>{FULL.example_translation}</p>
          </div>
          <Speak size={36} />
        </div>
      </Soft>

      <Soft>
        <Sub>使い方チャンク</Sub>
        <Chunks />
      </Soft>

      <Soft>
        <Sub>いっしょに覚える語</Sub>
        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, ...muted }}>量詞</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
          <b lang="zh-Hant" style={{ fontSize: 20 }}>
            一{MEASURE.word}
          </b>
          <span style={{ fontSize: 13, ...muted }}>{MEASURE.note}</span>
        </div>
        <p style={{ margin: "12px 0 6px", fontSize: 12, fontWeight: 700, ...muted }}>
          類義語・反義語・関連語
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {RELATED.map((r) => (
            <div
              key={r.word}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 8px 8px 14px",
                borderRadius: 18,
                background: "color-mix(in oklab, var(--primary) 7%, var(--card))",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <b lang="zh-Hant" style={{ fontSize: 17 }}>
                  {r.word}
                </b>
                <span style={{ marginLeft: 6, fontSize: 11, ...muted }}>{r.reading}</span>
                <p style={{ margin: 0, fontSize: 13, ...muted }}>{r.note}</p>
              </div>
              <Speak size={36} />
            </div>
          ))}
        </div>
      </Soft>

      <Soft>
        <Sub>実際の使われ方</Sub>
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            margin: "0 -16px",
            padding: "0 16px 2px",
            scrollbarWidth: "none",
          }}
        >
          {LINKS.map((l) => (
            <a
              key={l.label}
              href="#"
              onClick={(e) => e.preventDefault()}
              className="press-in"
              style={{
                flex: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
                padding: "0 14px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                textDecoration: "none",
                color: "inherit",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span>{l.icon}</span>
              {l.label}
              <ExternalLink size={13} style={muted} />
            </a>
          ))}
        </div>
      </Soft>
    </div>
  );
}

// ---- C: 目次つき -------------------------------------------------------------
const TOC = [
  { id: "meaning", label: "意味", icon: BookOpen, hue: 250 },
  { id: "example", label: "例文", icon: MessageSquareQuote, hue: 200 },
  { id: "chunks", label: "チャンク", icon: Shapes, hue: 150 },
  { id: "measure", label: "量詞", icon: Hash, hue: 85 },
  { id: "related", label: "関連語", icon: Network, hue: 320 },
  { id: "usage", label: "使われ方", icon: Link2, hue: 25 },
] as const;
const tint = (hue: number, l = 0.62, c = 0.16) => `oklch(${l} ${c} ${hue})`;

function Sect({
  id,
  refs,
  children,
}: {
  id: (typeof TOC)[number]["id"];
  refs: RefObject<Record<string, HTMLElement | null>>;
  children: ReactNode;
}) {
  const t = TOC.find((x) => x.id === id)!;
  const Icon = t.icon;
  return (
    <section
      ref={(el) => {
        refs.current[id] = el;
      }}
      className="rounded-3xl border border-border bg-card"
      style={{ padding: 16, scrollMarginTop: 64 }}
    >
      <h3
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "0 0 10px",
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 26,
            height: 26,
            borderRadius: 8,
            background: tint(t.hue),
            color: "white",
          }}
        >
          <Icon size={15} />
        </span>
        {t.label}
      </h3>
      {children}
    </section>
  );
}

function DesignC() {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section className="rounded-3xl border border-border bg-card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Headword size={42} />
          </div>
          <Speak />
        </div>
        <div style={{ marginTop: 10 }}>
          <Tags />
        </div>
      </section>

      <nav
        aria-label="この語の目次"
        style={{
          position: "sticky",
          top: 8,
          zIndex: 2,
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: 6,
          borderRadius: 999,
          scrollbarWidth: "none",
          background: "color-mix(in oklab, var(--card) 72%, transparent)",
          backdropFilter: "blur(18px) saturate(180%)",
          WebkitBackdropFilter: "blur(18px) saturate(180%)",
          border: "1px solid var(--border)",
        }}
      >
        {TOC.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              refs.current[t.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="press-in"
            style={{
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 36,
              padding: "0 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              background: `color-mix(in oklab, ${tint(t.hue)} 14%, var(--card))`,
              color: tint(t.hue, 0.45, 0.14),
            }}
          >
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: 9, background: tint(t.hue) }}
            />
            {t.label}
          </button>
        ))}
      </nav>

      <Sect id="meaning" refs={refs}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{FULL.meaning_ja}</p>
      </Sect>
      <Sect id="example" refs={refs}>
        <div style={{ borderLeft: `3px solid ${tint(200)}`, paddingLeft: 12 }}>
          <Example />
          <p style={{ margin: "4px 0 0", fontSize: 14, ...muted }}>{FULL.example_translation}</p>
        </div>
      </Sect>
      <Sect id="chunks" refs={refs}>
        <Chunks />
      </Sect>
      <Sect id="measure" refs={refs}>
        <p style={{ margin: 0 }}>
          <b lang="zh-Hant" style={{ fontSize: 18 }}>
            {MEASURE.word}
          </b>
          <span style={{ marginLeft: 6, fontSize: 11, ...muted }}>{MEASURE.zhuyin}</span>
          <span style={{ marginLeft: 10, fontSize: 13, ...muted }}>{MEASURE.note}</span>
        </p>
      </Sect>
      <Sect id="related" refs={refs}>
        {RELATED.map((r, i) => (
          <div
            key={r.word}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 52,
              borderTop: i ? "1px solid var(--border)" : undefined,
            }}
          >
            <div style={{ flex: 1 }}>
              <b lang="zh-Hant" style={{ fontSize: 17 }}>
                {r.word}
              </b>
              <span style={{ marginLeft: 6, fontSize: 11, ...muted }}>{r.reading}</span>
              <p style={{ margin: 0, fontSize: 13, ...muted }}>{r.note}</p>
            </div>
            <Speak size={36} />
          </div>
        ))}
      </Sect>
      <Sect id="usage" refs={refs}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {LINKS.map((l) => (
            <a
              key={l.label}
              href="#"
              onClick={(e) => e.preventDefault()}
              className="press-in"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 48,
                padding: "0 12px",
                borderRadius: 14,
                background: `color-mix(in oklab, ${tint(25)} 7%, var(--card))`,
                textDecoration: "none",
                color: "inherit",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 17 }}>{l.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{l.label}</span>
            </a>
          ))}
        </div>
      </Sect>
    </div>
  );
}

const pill = (on: boolean): CSSProperties => ({
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: on ? "var(--primary)" : "var(--card)",
  color: on ? "var(--primary-foreground)" : "var(--foreground)",
  fontWeight: 600,
  fontSize: 13,
});

export function WordDetailRefineScene({ q }: { q: URLSearchParams }) {
  const [d, setD] = useState<Design>(DESIGNS.find((x) => x.key === q.get("d"))?.key ?? "a");
  const cur = DESIGNS.find((x) => x.key === d)!;
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="単語の詳細の磨き方" className="flex flex-wrap gap-1.5">
        {DESIGNS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={d === x.key}
            onClick={() => setD(x.key)}
            style={pill(d === x.key)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <details className="rounded-2xl border border-border bg-card p-3 text-caption leading-relaxed">
        <summary className="font-semibold">今の本番の問題（3案すべてで直す）</summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          {NOW.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
      <ul className="space-y-1 rounded-2xl border border-border bg-card p-3 text-caption leading-relaxed">
        {cur.why.map((w) => (
          <li key={w} className="flex gap-1.5">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-primary" />
            {w}
          </li>
        ))}
      </ul>
      {d === "a" && <DesignA />}
      {d === "b" && <DesignB />}
      {d === "c" && <DesignC />}
    </div>
  );
}
