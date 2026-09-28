/**
 * **ホーム画面のウィジェットの案**（見本・本番は未実装）。
 *
 * > オーナー指示 2026-09-27「Android や iPhone でウィジェットを使いたい。カメラ検索を
 * > すぐ開けるようにしたり、今日のアルバムの画像をスマホ上で表示できるようにして。
 * > 他にもいいウィジェットのほうがあれば作って。」
 *
 * ウィジェットは Web の画面ではなく、**iPhone は Swift（WidgetKit）、Android は
 * Kotlin（App Widget）で別に作る部品**。この見本は、何をどの大きさで置くかを
 * 決めるためのもの。作り方は `docs/widgets.md`。
 *
 * 押した時の行き先は `src/lib/deep-link.ts` の `WIDGET_LINKS`（アプリ側は受け取れる）。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Camera, Flame, Image as ImageIcon, ScanText, Search, Sparkles } from "lucide-react";
import { photo } from "./peel-sticker";
import type { StoryItem } from "@/components/StoryInk";
import { WIDGET_MEDIUM, drawAlbumSnapshot } from "@/lib/widget-snapshot";

const tile = (hue: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue} 45% 62%)"/><circle cx="140" cy="62" r="26" fill="hsl(${hue} 60% 82%)"/><path d="M0 200 L70 110 L120 160 L150 130 L200 190 V200Z" fill="hsl(${hue} 35% 40%)"/></svg>`,
  );

type OS = "ios" | "android";
const U = 70; // iPhone のアイコン1つぶんの升目（見本の縮尺）

function Box({
  w,
  h,
  os,
  children,
  bg = "#fff",
  label,
}: {
  w: number;
  h: number;
  os: OS;
  children: ReactNode;
  bg?: string;
  label: string;
}) {
  return (
    <figure style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <div
        style={{
          width: w,
          height: h,
          borderRadius: os === "ios" ? 22 : 28,
          overflow: "hidden",
          position: "relative",
          background: bg,
          boxShadow: "0 8px 20px -10px rgb(0 0 0 / .45)",
        }}
      >
        {children}
      </div>
      <figcaption style={{ fontSize: 11, color: "rgb(255 255 255 / .9)", textAlign: "center" }}>
        {label}
      </figcaption>
    </figure>
  );
}

const full: CSSProperties = { position: "absolute", inset: 0 };

/** ① カメラ検索（小）: 押す所が3つ。 */
function CameraWidget({ os }: { os: OS }) {
  const b = (Icon: typeof Camera, t: string, primary = false) => (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 3,
        padding: "8px 0",
        borderRadius: 16,
        background: primary ? "#0a84ff" : "rgb(10 132 255 / .1)",
        color: primary ? "#fff" : "#0a84ff",
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      <Icon size={20} />
      {t}
    </div>
  );
  return (
    <Box w={2 * U + 18} h={2 * U + 18} os={os} label="カメラ（小）">
      <div style={{ ...full, padding: 10, display: "grid", gridTemplateRows: "1fr 1fr", gap: 6 }}>
        {b(Camera, "撮る", true)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {b(ScanText, "スキャン")}
          {b(Search, "検索")}
        </div>
      </div>
    </Box>
  );
}

/** ② 今日のアルバム（中）: 今日の写真を最大4枚、語は写真の下の余白に。 */
function AlbumWidget({ os, empty = false }: { os: OS; empty?: boolean }) {
  const words = ["珍珠奶茶", "夜市", "芒果", "捷運"];
  return (
    <Box
      w={4 * U + 54}
      h={2 * U + 18}
      os={os}
      bg="#faf7f0"
      label={empty ? "今日のアルバム（まだ0枚）" : "今日のアルバム（中）"}
    >
      <div style={{ ...full, padding: "10px 12px" }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: "#2b2723" }}>
          9月28日 <span style={{ fontWeight: 600, color: "#8a8176" }}>· {empty ? 0 : 4}枚</span>
        </p>
        {empty ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              height: 100,
              color: "#8a8176",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            <ImageIcon size={26} />
            今日の1枚目を撮りに行こう
          </div>
        ) : (
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 8 }}
          >
            {words.map((w, i) => (
              <div
                key={w}
                style={{
                  background: "#fffdf8",
                  padding: "3px 3px 0",
                  borderRadius: 3,
                  rotate: `${i % 2 ? 2 : -2}deg`,
                  boxShadow: "0 3px 6px -3px rgb(0 0 0 / .4)",
                }}
              >
                <img
                  src={i === 0 ? photo : tile(i * 70)}
                  alt=""
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }}
                />
                <p
                  lang="zh-Hant"
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textAlign: "center",
                    lineHeight: "16px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                >
                  {w}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Box>
  );
}

/**
 * ②' **今日のアルバム — 書き込み・ひとこと・落書き入り**（オーナー指示 2026-09-28
 * 「ウィジェットの今日のアルバムを表示はユーザーの書き込みやひとこと、落書きも表示して」）。
 *
 * 見本の絵ではなく、**本番で使う描き方そのもの**（`src/lib/widget-snapshot.ts`）で
 * 今日のページを1枚の絵に焼いている。ウィジェットはこの絵を出すだけなので、
 * アプリで書いた物がそのまま出る。
 */
const INK_TODAY: StoryItem[] = [
  {
    id: "p1",
    kind: "photo",
    src: photo,
    caption: "珍珠奶茶",
    x: 0.24,
    y: 0.36,
    w: 0.36,
    rot: -6,
    z: 1,
  },
  {
    id: "p2",
    kind: "photo",
    src: tile(20),
    caption: "夜市",
    x: 0.56,
    y: 0.42,
    w: 0.3,
    rot: 4,
    z: 2,
  },
  {
    id: "p3",
    kind: "photo",
    src: tile(200),
    caption: "捷運",
    x: 0.84,
    y: 0.34,
    w: 0.26,
    rot: -3,
    z: 3,
  },
  {
    id: "t1",
    kind: "text",
    text: "初めての夜市!",
    font: "signature",
    color: "#ff375f",
    bg: "soft",
    x: 0.5,
    y: 0.1,
    w: 0.5,
    rot: -4,
    z: 5,
  },
  {
    // 落書き: ハートと矢印（指で書いた線と同じ形で持つ）。
    id: "s1",
    kind: "sketch",
    strokes: [
      {
        color: "#ff375f",
        width: 14,
        pts: [
          [100, 60],
          [70, 20],
          [30, 30],
          [25, 80],
          [100, 150],
          [175, 80],
          [170, 30],
          [130, 20],
          [100, 60],
        ],
      },
      {
        color: "#0a84ff",
        width: 10,
        pts: [
          [220, 140],
          [300, 110],
          [380, 70],
        ],
      },
      {
        color: "#0a84ff",
        width: 10,
        pts: [
          [340, 60],
          [380, 70],
          [365, 108],
        ],
      },
    ],
    box: [10, 5, 385, 160],
    x: 0.74,
    y: 0.7,
    w: 0.34,
    rot: 0,
    z: 6,
  },
];

function InkAlbumWidget({ os }: { os: OS }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = WIDGET_MEDIUM;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const images = new Map<string, CanvasImageSource>();
    const paint = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawAlbumSnapshot(ctx, { items: INK_TODAY, images, title: "9月28日", subtitle: "3枚" });
    };
    for (const it of INK_TODAY) {
      if (it.kind !== "photo" || images.has(it.src)) continue;
      const img = new Image();
      img.onload = () => {
        images.set(it.src, img);
        paint();
      };
      img.src = it.src;
    }
    paint();
  }, []);
  return (
    <Box w={w} h={h} os={os} bg="#faf7f0" label="今日のアルバム（中・書き込み入り）">
      <canvas
        ref={ref}
        width={w * 3}
        height={h * 3}
        style={{ ...full, width: w, height: h }}
        aria-label="今日のアルバム"
      />
    </Box>
  );
}

/** ③ 1問（小）: 写真だけ見せて「言える？」。押すとその語の復習へ。 */
function QuizWidget({ os }: { os: OS }) {
  return (
    <Box w={2 * U + 18} h={2 * U + 18} os={os} label="1問（小）">
      <img
        src={photo}
        alt=""
        style={{ ...full, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div style={{ ...full, background: "linear-gradient(transparent 45%, rgb(0 0 0 / .65))" }} />
      <p
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 10,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        これ、台湾華語で言える？
      </p>
    </Box>
  );
}

/** ④ 復習（小）: 今日の数と、覚えている割合。 */
function ReviewWidget({ os }: { os: OS }) {
  return (
    <Box w={2 * U + 18} h={2 * U + 18} os={os} label="復習（小）">
      <div style={{ ...full, padding: 12, display: "grid", alignContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            color: "#0a84ff",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <Sparkles size={14} />
          復習
        </div>
        <div>
          <p style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: "#111" }}>12</p>
          <p style={{ fontSize: 11, color: "#666" }}>語が忘れかけ</p>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "#e6eef9" }}>
          <div style={{ width: "72%", height: "100%", borderRadius: 3, background: "#0a84ff" }} />
        </div>
      </div>
    </Box>
  );
}

/** ⑤ 続けた日（小）＋ ロック画面の丸。 */
function StreakWidget({ os }: { os: OS }) {
  return (
    <Box
      w={2 * U + 18}
      h={2 * U + 18}
      os={os}
      bg="linear-gradient(160deg,#ff9f0a,#ff375f)"
      label="続けた日（小）"
    >
      <div
        style={{
          ...full,
          padding: 12,
          color: "#fff",
          display: "grid",
          alignContent: "space-between",
        }}
      >
        <Flame size={22} />
        <div>
          <p style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>23</p>
          <p style={{ fontSize: 11, opacity: 0.9 }}>日つづけて撮った</p>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {[1, 1, 1, 1, 1, 0, 0].map((on, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: on ? "#fff" : "rgb(255 255 255 / .35)",
              }}
            />
          ))}
        </div>
      </div>
    </Box>
  );
}

function LockCircle() {
  return (
    <figure style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { v: "12", t: "復習" },
          { v: "23", t: "日" },
        ].map((x) => (
          <div
            key={x.t}
            style={{
              width: 58,
              height: 58,
              borderRadius: 99,
              background: "rgb(255 255 255 / .18)",
              border: "3px solid rgb(255 255 255 / .75)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{x.v}</div>
              <div style={{ fontSize: 9 }}>{x.t}</div>
            </div>
          </div>
        ))}
      </div>
      <figcaption style={{ fontSize: 11, color: "rgb(255 255 255 / .9)" }}>
        ロック画面（iPhone のみ・時計の下）
      </figcaption>
    </figure>
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

export function WidgetDesignsScene({ q }: { q: URLSearchParams }) {
  const [os, setOs] = useState<OS>(q.get("os") === "android" ? "android" : "ios");
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="端末" className="flex gap-1.5">
        {(["ios", "android"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={os === k}
            onClick={() => setOs(k)}
            style={pill(os === k)}
          >
            {k === "ios" ? "iPhone" : "Android"}
          </button>
        ))}
      </div>
      <p className="text-caption leading-relaxed text-muted-foreground">
        ホーム画面に置く部品の案です。押すと: カメラ →撮る/スキャン/検索の画面、アルバム →ホーム、
        1問・復習 →その語の復習、続けた日 →ホーム。
      </p>
      <div
        style={{
          borderRadius: 32,
          padding: "22px 12px 28px",
          background:
            os === "ios"
              ? "radial-gradient(120% 80% at 30% 0%, #7aa2d6, #34507e 55%, #1b2640)"
              : "radial-gradient(120% 80% at 30% 0%, #9bb59a, #4d6b55 55%, #26352b)",
          display: "grid",
          gap: 18,
          justifyItems: "center",
        }}
      >
        {os === "ios" && <LockCircle />}
        <InkAlbumWidget os={os} />
        <AlbumWidget os={os} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <CameraWidget os={os} />
          <QuizWidget os={os} />
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <ReviewWidget os={os} />
          <StreakWidget os={os} />
        </div>
        <AlbumWidget os={os} empty />
      </div>
    </div>
  );
}
