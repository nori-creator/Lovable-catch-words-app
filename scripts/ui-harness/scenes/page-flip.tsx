import { useState, type CSSProperties } from "react";
import { PageCurlBook, type BookPage } from "@/components/PageCurlBook";
import { photo } from "./peel-sticker";

/**
 * **アルバムを本のようにめくる**（試作・本番のホームは未変更。オーナー指示
 * 2026-09-27「添付動画のように、どこからでもページがめくれるように。めくった時の
 * 残像やページの柔らかさを再現」「設定の紙は添付したバッグの画像の紙の本物の質を
 * 再現し、アルバムの紙にもその紙質を使う」「表紙もデザイン。案を複数」）。
 *
 * - 紙のどこを掴んでも角が付いてくる。上半分なら右上、下半分なら右下の角。
 * - 速く払うと残像（薄い紙の影）が付く。軽く叩くだけでもめくれる。
 * - 上の切り替えで表紙の案 A〜D と、幅（スマホ / 折りたたみの見開き）を試せる。
 */
const DAYS = [
  { date: "9月27日", sub: "土曜日", words: ["珍珠奶茶", "夜市", "腳踏車"] },
  { date: "9月26日", sub: "金曜日", words: ["芒果", "雨傘"] },
  { date: "9月25日", sub: "木曜日", words: ["捷運", "獎學金", "便當"] },
  { date: "9月24日", sub: "水曜日", words: ["公車"] },
  { date: "9月23日", sub: "火曜日", words: ["面紙", "雞肉"] },
  { date: "9月22日", sub: "月曜日", words: ["滷肉飯"] },
];

const TAPE = ["#e8d9b5cc", "#cfe3d8cc", "#f2c9d2cc", "#c9d6f2cc"];

function DayPage({ i }: { i: number }) {
  const d = DAYS[i];
  return (
    <div style={{ position: "absolute", inset: 0, padding: "22px 18px" }}>
      <p style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: "#2b2723" }}>
        {d.date}
        <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8, color: "#8a8176" }}>
          {d.sub}
        </span>
      </p>
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px 14px",
        }}
      >
        {d.words.map((w, k) => (
          <figure
            key={w}
            style={{
              rotate: `${k % 2 ? 3 : -3}deg`,
              background: "#fff",
              padding: 6,
              paddingBottom: 8,
              boxShadow: "0 6px 14px -8px rgb(0 0 0 / .45)",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -8,
                left: "50%",
                width: 54,
                height: 16,
                translate: "-50% 0",
                rotate: `${k % 2 ? -4 : 5}deg`,
                background: TAPE[(i + k) % TAPE.length],
              }}
            />
            <img
              src={photo}
              alt=""
              draggable={false}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }}
            />
            <figcaption
              lang="zh-Hant"
              style={{ textAlign: "center", fontSize: 18, fontWeight: 700, marginTop: 4 }}
            >
              {w}
            </figcaption>
          </figure>
        ))}
      </div>
      <p
        style={{
          position: "absolute",
          bottom: 12,
          right: 16,
          fontSize: 11,
          color: "#a39a8e",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {i + 1}
      </p>
    </div>
  );
}

// ---- 表紙の案 ---------------------------------------------------------------
const COVERS = [
  { key: "a", label: "A 布張り（金の箔押し）" },
  { key: "b", label: "B クラフト紙＋ステッカー" },
  { key: "c", label: "C 写真の窓" },
  { key: "d", label: "D 透明カバー" },
] as const;
type CoverKey = (typeof COVERS)[number]["key"];

const full: CSSProperties = { position: "absolute", inset: 0 };

function Cover({ v }: { v: CoverKey }) {
  if (v === "a")
    // 紺の布（縦横の織り目）に、題を金で箔押し。沈んだ押し跡の陰も付ける。
    return (
      <div
        style={{
          ...full,
          background: `
            repeating-linear-gradient(0deg, rgb(255 255 255 / .035) 0 1px, transparent 1px 3px),
            repeating-linear-gradient(90deg, rgb(0 0 0 / .08) 0 1px, transparent 1px 3px),
            linear-gradient(160deg, #22365e, #15223d)`,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontSize: 13,
              letterSpacing: 6,
              color: "#d9b56a",
              textShadow: "0 1px 0 rgb(0 0 0 / .5), 0 -1px 0 rgb(255 255 255 / .12)",
            }}
          >
            CATCHWORDS
          </p>
          <p
            style={{
              marginTop: 10,
              fontSize: 44,
              fontWeight: 800,
              color: "transparent",
              background: "linear-gradient(180deg,#f6e3a6,#c49a45 55%,#8a6424)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              filter: "drop-shadow(0 1px 0 rgb(0 0 0 / .45))",
            }}
          >
            2026
          </p>
          <p style={{ marginTop: 6, fontSize: 12, letterSpacing: 3, color: "#b89a5e" }}>
            WORDS I CAUGHT
          </p>
        </div>
      </div>
    );
  if (v === "b")
    // ほぼ日の動画の表紙のように: クラフト紙に、撮った写真をステッカーで。
    return (
      <div
        style={{
          ...full,
          background: `
            radial-gradient(circle at 30% 20%, rgb(255 255 255 / .18), transparent 60%),
            linear-gradient(160deg, #e2c796, #d2b07a)`,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 22,
            left: 18,
            padding: "6px 10px",
            background: "#fffdf7",
            fontFamily: "'Segoe Script','Bradley Hand',cursive",
            fontSize: 15,
            rotate: "-3deg",
            boxShadow: "0 2px 4px rgb(0 0 0 / .15)",
          }}
        >
          September 2026
        </span>
        <p
          style={{
            position: "absolute",
            right: 20,
            top: "40%",
            textAlign: "right",
            color: "#8b6d42",
            fontSize: 12,
            letterSpacing: 2,
            lineHeight: 1.6,
          }}
        >
          CATCHWORDS
          <br />
          <b style={{ fontSize: 16 }}>ALBUM 2026</b>
        </p>
        <img
          src={photo}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: 22,
            bottom: 36,
            width: "46%",
            aspectRatio: "1",
            objectFit: "cover",
            borderRadius: 18,
            border: "6px solid #fff",
            rotate: "-6deg",
            boxShadow: "0 8px 16px -8px rgb(0 0 0 / .5)",
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 36,
            bottom: 44,
            fontSize: 44,
            rotate: "8deg",
            filter: "drop-shadow(0 3px 3px rgb(0 0 0 / .25))",
          }}
        >
          🧋
        </span>
      </div>
    );
  if (v === "c")
    // 表紙に丸い窓。その日の1枚が窓からのぞく（開くと同じ写真が中に在る）。
    return (
      <div style={{ ...full, background: "linear-gradient(160deg,#2a2622,#171411)" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "40%",
            width: "62%",
            aspectRatio: "1",
            translate: "-50% -50%",
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: "inset 0 8px 18px rgb(0 0 0 / .6), 0 0 0 6px #3a332c",
          }}
        >
          <img
            src={photo}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <p
          style={{
            position: "absolute",
            bottom: 38,
            width: "100%",
            textAlign: "center",
            color: "#efe6d6",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          いま、ここで覚えた言葉
          <br />
          <span style={{ fontSize: 12, letterSpacing: 4, opacity: 0.7 }}>2026 · CATCHWORDS</span>
        </p>
      </div>
    );
  // D: 写真を並べた上に、透明な塩ビのカバー（光の筋と縁の厚み）。
  return (
    <div style={{ ...full, background: "#f3efe8" }}>
      <div
        style={{
          ...full,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
          padding: 14,
        }}
      >
        {Array.from({ length: 9 }).map((_, k) => (
          <img
            key={k}
            src={photo}
            alt=""
            draggable={false}
            style={{
              width: "100%",
              aspectRatio: "1",
              objectFit: "cover",
              rotate: `${(k % 3) - 1}deg`,
              filter: `hue-rotate(${k * 36}deg)`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          ...full,
          background: `
            linear-gradient(115deg, transparent 30%, rgb(255 255 255 / .55) 38%, transparent 46%),
            linear-gradient(115deg, transparent 55%, rgb(255 255 255 / .25) 60%, transparent 66%),
            rgb(255 255 255 / .12)`,
          boxShadow: "inset 0 0 0 2px rgb(255 255 255 / .7), inset 0 0 22px rgb(255 255 255 / .35)",
        }}
      />
      <p
        style={{
          position: "absolute",
          left: 18,
          bottom: 18,
          padding: "4px 10px",
          background: "rgb(255 255 255 / .85)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        CATCHWORDS 2026
      </p>
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

export function PageFlipScene({ q }: { q: URLSearchParams }) {
  const [wide, setWide] = useState(q.get("w") === "fold");
  const [cover, setCover] = useState<CoverKey>(
    COVERS.find((c) => c.key === q.get("cover"))?.key ?? "a",
  );
  const pages: BookPage[] = [
    {
      key: `cover-${cover}`,
      content: <Cover v={cover} />,
      // 表紙の裏は見返し（無地の厚い紙）。
      back: <div style={{ ...full, background: "#e9e2d4" }} />,
    },
    ...DAYS.map((_, i) => ({ key: `day-${i}`, content: <DayPage i={i} /> })),
  ];
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="表紙の案" className="flex flex-wrap gap-1.5">
        {COVERS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={cover === c.key}
            onClick={() => setCover(c.key)}
            style={pill(cover === c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="画面の幅" className="flex gap-1.5">
        {[
          { v: false, label: "スマホ（1ページ）" },
          { v: true, label: "折りたたみを開いた時（見開き）" },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={wide === o.v}
            onClick={() => setWide(o.v)}
            style={pill(wide === o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto px-1 pb-6 pt-2">
        <div style={{ width: wide ? 720 : "100%", margin: "0 auto" }}>
          <PageCurlBook key={`${wide}-${cover}`} pages={pages} spread={wide} />
        </div>
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        紙のどこを掴んでも角が付いてきます（上半分なら右上、下半分なら右下）。速く払うと残像、
        軽く叩くと自動でめくれます（右の端=次、左の端=前）。紙は参考のバッグの写真の水彩紙の
        凹凸を光の当たり方ごと再現しています（設定の「紙」の壁紙と同じ紙）。
      </p>
    </div>
  );
}
