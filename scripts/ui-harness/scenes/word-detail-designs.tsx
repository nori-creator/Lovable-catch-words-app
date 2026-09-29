/**
 * **単語の詳細（全項目）を1から考え直したデザイン案**（見本・本番は未変更）。
 *
 * > オーナー指示 2026-09-27「単語の詳細のすべての項目デザイン案を複数案提案して。1から様々な
 * > デザインを考え直したい。視覚的に心理学的にマーケティング的に行動経済学的に言語学的に優れた
 * > デザイン、ユーザーを引き付けるデザイン、記憶に残るデザインを作りたい。」
 *
 * 同じ1語（珍珠奶茶）の全項目を、考え方の違う4案で描く。各案の上に「なぜこの形か」の根拠
 * （学習の研究・行動経済学・言語学）を1行ずつ添える。
 *
 *   A 思い出してから見る … 答えを隠し、押すと出る（テスト効果）。
 *   B 雑誌の1ページ   … 文字の美しさと余白で「読みたくなる」（処理の流暢性）。
 *   C 集めるカード     … 語をカードとして集め、育てる（収集・進み具合・変動報酬）。
 *   D 友だちとの会話   … ネイティブの友だちが教えてくれる形（物語・社会的学習）。
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronDown,
  Eye,
  Flame,
  Lightbulb,
  MapPin,
  MessageCircle,
  Sparkles,
  Star,
  Volume2,
} from "lucide-react";
import { photo } from "./peel-sticker";

const W = {
  head: "珍珠奶茶",
  zhuyin: ["ㄓㄣ", "ㄓㄨ", "ㄋㄞˇ", "ㄔㄚˊ"],
  pinyin: "zhēnzhū nǎichá",
  meaning: "タピオカミルクティー",
  pos: "名詞",
  level: "TOCFL A2",
  freq: 4,
  memory: 72,
  example: "我每天下課都會去買一杯珍珠奶茶。",
  exampleJa: "毎日授業の後にタピオカミルクティーを1杯買いに行く。",
  chunks: [
    { zh: "一杯珍珠奶茶", ja: "タピオカミルクティー1杯" },
    { zh: "珍奶 半糖少冰", ja: "タピオカ 甘さ半分・氷少なめ" },
    { zh: "去買珍奶", ja: "タピオカを買いに行く" },
  ],
  measure: "杯（ㄅㄟ）",
  related: ["珍奶（略して）", "奶茶", "波霸奶茶", "手搖飲"],
  tip: "「奶」は3声。前の「珠」から下げてすぐ上げる。",
  etym: "珍珠＝真珠（粒をたとえて）＋ 奶茶＝ミルクティー",
  mnemonic: "真珠のような粒が沈むミルクティー。",
  taiwan: "台湾では「珍奶」と略すのが普通。注文は「甘さ・氷」を必ず聞かれる。",
};

type Design = "a" | "b" | "c" | "d";
const DESIGNS: Array<{ key: Design; label: string; why: string[] }> = [
  {
    key: "a",
    label: "A 思い出してから見る",
    why: [
      "テスト効果: 見るより「思い出そうとする」方が長く覚える（想起練習）。",
      "二重符号化: 写真と語を並べ、絵と言葉の両方で記憶に残す。",
      "ツァイガルニク効果: 開けていない札が残ると、続きを開けたくなる。",
    ],
  },
  {
    key: "b",
    label: "B 雑誌の1ページ",
    why: [
      "処理の流暢性: 読みやすく美しい物ほど「良い・正しい」と感じる。",
      "チャンク: 語を固まり（一杯＋珍奶）で見せ、話す時の単位で覚える（言語学のコロケーション）。",
      "余白と階層: 大事な物が一目で分かる（Apple の明瞭さ）。",
    ],
  },
  {
    key: "c",
    label: "C 集めるカード",
    why: [
      "収集と所有: 自分の物は価値が高く感じる（保有効果）。",
      "目標勾配: 記憶の%のゲージが満ちるほど、続けたくなる。",
      "変動報酬: 珍しさ（頻度の星）で、次の1枚を撮りたくなる。",
    ],
  },
  {
    key: "d",
    label: "D 友だちとの会話",
    why: [
      "社会的学習: 人から教わる形は記憶と感情に残る。",
      "自己関連づけ: 「あなたなら？」と自分の場面に結ぶ（自己参照効果）。",
      "ピーク・エンド: 最後を「使ってみよう」で締め、良い印象で終える。",
    ],
  },
];

function Zh({ size = 44 }: { size?: number }) {
  return (
    <span lang="zh-Hant" style={{ display: "inline-flex", alignItems: "flex-start", gap: 2 }}>
      {[...W.head].map((c, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1 }}>{c}</span>
          <span
            style={{
              writingMode: "vertical-rl",
              fontSize: size * 0.28,
              color: "color-mix(in oklab, currentColor 55%, transparent)",
              marginLeft: 1,
            }}
          >
            {W.zhuyin[i]}
          </span>
        </span>
      ))}
    </span>
  );
}

const Speaker = ({ light = false }: { light?: boolean }) => (
  <span
    aria-hidden
    style={{
      display: "inline-grid",
      placeItems: "center",
      width: 36,
      height: 36,
      borderRadius: 99,
      background: light ? "rgb(255 255 255 / .2)" : "#0a84ff",
      color: "#fff",
      flex: "none",
    }}
  >
    <Volume2 size={18} />
  </span>
);

// ---- A: 思い出してから見る ---------------------------------------------------
function Reveal({ q, children }: { q: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="block w-full rounded-2xl border border-border bg-card p-3 text-left"
    >
      <p className="flex items-center justify-between text-caption font-semibold text-muted-foreground">
        {q}
        {!open && (
          <span className="flex items-center gap-1 text-primary">
            <Eye size={14} /> 思い出したら押す
          </span>
        )}
      </p>
      <div
        style={{
          marginTop: 6,
          filter: open ? "none" : "blur(7px)",
          opacity: open ? 1 : 0.6,
          transition: "filter .35s, opacity .35s",
          userSelect: open ? "auto" : "none",
        }}
      >
        {children}
      </div>
    </button>
  );
}

function DesignA() {
  return (
    <div className="space-y-2.5">
      <div style={{ position: "relative", borderRadius: 24, overflow: "hidden" }}>
        <img src={photo} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            inset: "auto 0 0 0",
            padding: "40px 16px 14px",
            background: "linear-gradient(transparent, rgb(0 0 0 / .65))",
            color: "#fff",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <Zh size={38} />
          <Speaker light />
        </div>
      </div>
      <Reveal q="① 意味は？">
        <p className="text-title font-bold">{W.meaning}</p>
      </Reveal>
      <Reveal q="② いちばんよく使う言い方は？">
        <ul className="space-y-1">
          {W.chunks.map((c) => (
            <li key={c.zh}>
              <span lang="zh-Hant" className="text-body font-bold">
                {c.zh}
              </span>
              <span className="ml-2 text-caption text-muted-foreground">{c.ja}</span>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal q="③ この文の空所は？ 我每天下課都會去買一杯＿＿＿。">
        <p lang="zh-Hant" className="text-body">
          {W.example}
        </p>
        <p className="text-caption text-muted-foreground">{W.exampleJa}</p>
      </Reveal>
      <Reveal q="④ 数えるときの言葉（量詞）は？">
        <p className="text-body font-bold">{W.measure}</p>
      </Reveal>
      <details className="rounded-2xl border border-border bg-card p-3">
        <summary className="flex min-h-8 cursor-pointer items-center justify-between text-footnote font-semibold">
          もっと（発音のコツ・成り立ち・覚え方・台湾メモ・仲間の語）
          <ChevronDown size={16} />
        </summary>
        <div className="mt-2 space-y-2 text-footnote">
          <p>🗣 {W.tip}</p>
          <p>🧩 {W.etym}</p>
          <p>💡 {W.mnemonic}</p>
          <p>🇹🇼 {W.taiwan}</p>
          <p lang="zh-Hant">🔗 {W.related.join("・")}</p>
        </div>
      </details>
    </div>
  );
}

// ---- B: 雑誌の1ページ -------------------------------------------------------
const serif = "'Hiragino Mincho ProN', 'Noto Serif TC', Georgia, serif";
function Kicker({ n, t }: { n: string; t: string }) {
  return (
    <p style={{ fontSize: 11, letterSpacing: 3, fontWeight: 700, color: "#b0453a", marginTop: 22 }}>
      {n} · {t}
    </p>
  );
}
function DesignB() {
  return (
    <article
      style={{
        background: "#fbf8f2",
        color: "#231f1a",
        borderRadius: 24,
        padding: "22px 20px 26px",
      }}
    >
      <p style={{ fontSize: 11, letterSpacing: 4, color: "#8a8176" }}>
        {W.level} · {W.pos} · よく使う {"★".repeat(W.freq)}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <span style={{ fontFamily: serif }}>
          <Zh size={46} />
        </span>
        <Speaker />
      </div>
      <p style={{ fontFamily: serif, fontSize: 22, marginTop: 10 }}>{W.meaning}</p>
      <div style={{ height: 1, background: "#231f1a", opacity: 0.15, margin: "18px 0 0" }} />
      <Kicker n="01" t="この形で覚える" />
      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
        {W.chunks.map((c, i) => (
          <p key={c.zh} lang="zh-Hant" style={{ fontSize: 20, fontFamily: serif }}>
            <span style={{ color: "#b0453a", marginRight: 8, fontSize: 13 }}>{i + 1}</span>
            {c.zh}
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: "#8a8176",
                marginLeft: 22,
                fontFamily: "inherit",
              }}
            >
              {c.ja}
            </span>
          </p>
        ))}
      </div>
      <Kicker n="02" t="例文" />
      <blockquote style={{ borderLeft: "3px solid #b0453a", paddingLeft: 12, marginTop: 8 }}>
        <p lang="zh-Hant" style={{ fontFamily: serif, fontSize: 18, lineHeight: 1.6 }}>
          我每天下課都會去買一杯
          <mark
            style={{
              background: "linear-gradient(transparent 60%, #f6d68a 60%)",
              color: "inherit",
            }}
          >
            珍珠奶茶
          </mark>
          。
        </p>
        <p style={{ fontSize: 13, color: "#8a8176", marginTop: 4 }}>{W.exampleJa}</p>
      </blockquote>
      <Kicker n="03" t="成り立ち" />
      <p style={{ fontSize: 14, marginTop: 6 }}>{W.etym}</p>
      <Kicker n="04" t="台湾では" />
      <p style={{ fontSize: 14, marginTop: 6 }}>{W.taiwan}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: 2, color: "#8a8176" }}>量詞</p>
          <p lang="zh-Hant" style={{ fontSize: 16, fontFamily: serif }}>
            {W.measure}
          </p>
        </div>
        <div>
          <p style={{ fontSize: 11, letterSpacing: 2, color: "#8a8176" }}>仲間</p>
          <p lang="zh-Hant" style={{ fontSize: 14 }}>
            {W.related.slice(0, 3).join("・")}
          </p>
        </div>
      </div>
    </article>
  );
}

// ---- C: 集めるカード --------------------------------------------------------
function DesignC() {
  return (
    <div
      style={{
        borderRadius: 28,
        padding: 3,
        background: "linear-gradient(135deg,#ffd76a,#ff8a5c,#b86bff,#5cc8ff)",
      }}
    >
      <div style={{ borderRadius: 25, background: "#101522", color: "#fff", padding: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <span style={{ display: "flex", gap: 2, color: "#ffd76a" }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={14} fill={i < W.freq ? "#ffd76a" : "none"} />
            ))}
          </span>
          <span style={{ opacity: 0.7 }}>No. 086 · {W.level}</span>
        </div>
        <div style={{ position: "relative", marginTop: 10, borderRadius: 18, overflow: "hidden" }}>
          <img src={photo} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              padding: "2px 8px",
              borderRadius: 99,
              background: "rgb(0 0 0 / .55)",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <MapPin size={12} /> 西門町 · 9/3
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <Zh size={34} />
          <Speaker light />
        </div>
        <p style={{ fontSize: 15, opacity: 0.85 }}>{W.meaning}</p>
        {/* 記憶のゲージ（目標勾配: あと少しで満ちる所を見せる）。 */}
        <div style={{ marginTop: 12 }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.8 }}
          >
            <span>記憶</span>
            <span>{W.memory}% · あと1回の復習で「定着」</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: "rgb(255 255 255 / .12)",
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: `${W.memory}%`,
                height: "100%",
                borderRadius: 4,
                background: "linear-gradient(90deg,#5cc8ff,#b86bff)",
              }}
            />
          </div>
        </div>
        <p style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginTop: 14 }}>
          わざ（よく使う形）
        </p>
        <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
          {W.chunks.map((c) => (
            <div
              key={c.zh}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 12,
                background: "rgb(255 255 255 / .07)",
              }}
            >
              <span lang="zh-Hant" style={{ fontWeight: 700 }}>
                {c.zh}
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{c.ja}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            marginTop: 10,
            fontSize: 12,
          }}
        >
          <div style={{ padding: 10, borderRadius: 12, background: "rgb(255 255 255 / .07)" }}>
            <Lightbulb size={14} /> {W.mnemonic}
          </div>
          <div style={{ padding: 10, borderRadius: 12, background: "rgb(255 255 255 / .07)" }}>
            <Flame size={14} /> 仲間の語 <b>4</b> 枚のうち <b>1</b> 枚を持っている
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- D: 友だちとの会話 -------------------------------------------------------
function Bubble({ me = false, children }: { me?: boolean; children: ReactNode }) {
  const s: CSSProperties = {
    maxWidth: "82%",
    padding: "10px 12px",
    borderRadius: 18,
    borderBottomLeftRadius: me ? 18 : 6,
    borderBottomRightRadius: me ? 6 : 18,
    background: me ? "#0a84ff" : "var(--card)",
    color: me ? "#fff" : "var(--foreground)",
    boxShadow: me ? "none" : "0 1px 2px rgb(0 0 0 / .08)",
    alignSelf: me ? "flex-end" : "flex-start",
    fontSize: 15,
    lineHeight: 1.45,
  };
  return <div style={s}>{children}</div>;
}
function DesignD() {
  return (
    <div className="rounded-3xl bg-secondary/60 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 99,
            background: "linear-gradient(135deg,#ff9f0a,#ff375f)",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          小
        </span>
        <div>
          <p className="text-footnote font-bold">小美（台北のともだち）</p>
          <p className="text-caption text-muted-foreground">この写真、見たよ！</p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ alignSelf: "flex-end", width: "60%", borderRadius: 16, overflow: "hidden" }}>
          <img src={photo} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
        </div>
        <Bubble>
          それは <b lang="zh-Hant">珍珠奶茶</b>！（{W.meaning}）
          <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <Speaker /> <span className="text-caption">{W.pinyin}</span>
          </span>
        </Bubble>
        <Bubble>
          でもね、台湾ではみんな <b lang="zh-Hant">珍奶</b> って略すよ。注文はこう言うの👇
        </Bubble>
        <Bubble>
          <span lang="zh-Hant" style={{ fontWeight: 700 }}>
            我要一杯珍奶，半糖少冰。
          </span>
          <span className="block text-caption text-muted-foreground">
            タピオカ1杯、甘さ半分・氷少なめで。
          </span>
        </Bubble>
        <Bubble me>「杯」で数えるんだね</Bubble>
        <Bubble>そう！ ちなみに「奶」は3声だよ。{W.tip.replace("「奶」は3声。", "")}</Bubble>
        <Bubble>
          <span className="flex items-center gap-1 font-semibold">
            <MessageCircle size={15} /> あなたなら、いつ飲む？
          </span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {["下課後", "週末", "考試前"].map((x) => (
              <span
                key={x}
                lang="zh-Hant"
                style={{
                  padding: "4px 10px",
                  borderRadius: 99,
                  background: "rgb(10 132 255 / .1)",
                  color: "#0a84ff",
                  fontSize: 13,
                }}
              >
                {x}
              </span>
            ))}
          </span>
        </Bubble>
      </div>
    </div>
  );
}

const pill = (on: boolean): CSSProperties => ({
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: on ? "var(--primary)" : "var(--card)",
  color: on ? "var(--primary-foreground)" : "var(--foreground)",
  fontWeight: 600,
  fontSize: 13,
});

export function WordDetailDesignsScene({ q }: { q: URLSearchParams }) {
  const [d, setD] = useState<Design>(DESIGNS.find((x) => x.key === q.get("d"))?.key ?? "a");
  const cur = DESIGNS.find((x) => x.key === d)!;
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="単語の詳細の案" className="flex flex-wrap gap-1.5">
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
      {d === "d" && <DesignD />}
    </div>
  );
}
