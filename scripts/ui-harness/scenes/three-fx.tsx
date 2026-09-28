import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScanAnalyzing_v13depth } from "@/components/effects/scan-analyzing/v13_depth";
import { createGallery3d, type Gallery3D, type GalleryItem } from "@/components/three/gallery3d";
import { burstConfetti3d } from "@/components/three/confetti3d";
import { createSpring, rubberband, velocityFrom, type Spring } from "@/lib/spring";
import { settleIndex } from "@/lib/cover-flow";
import { playSfx, preloadSfx } from "@/lib/sfx-files";
import { photo } from "./peel-sticker";
import { RewardCatchScene } from "./reward-catch";
import { Shelf3DScene } from "./shelf-3d";

/**
 * **重要な演出4つを 3D で**（オーナー指示 2026-09-28「①AIの分析中のアニメーション
 * ②キャッチ、祝福のアニメーション③本棚の本と本を開いたあとのページ④図鑑のスライドの
 * やつ。…Blenderやthree.jsなど最新の3Dモデルを使用し、リアルで現実的なアニメーション
 * を実装して。BGMや効果音は…本物の映画の効果音のクオリティ」）。
 *
 * 上の4つのボタンで切り替える（`?fx=analyze|catch|shelf|gallery`）。音は画面を
 * 1回押した後に鳴る（ブラウザの決まり）。
 */
const TABS = [
  { key: "analyze", label: "① 分析中" },
  { key: "catch", label: "② キャッチ・祝福" },
  { key: "shelf", label: "③ 本棚・本" },
  { key: "gallery", label: "④ 図鑑 3D" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function ThreeFxScene({ q }: { q: URLSearchParams }) {
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.key === q.get("fx"))?.key ?? "analyze");
  const [run, setRun] = useState(0);
  let body: ReactNode;
  if (tab === "analyze") body = <AnalyzeView />;
  else if (tab === "catch") body = <CatchView run={run} />;
  else if (tab === "shelf") body = <Shelf3DScene q={new URLSearchParams("open=12")} />;
  else body = <GalleryView />;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <div key={`${tab}-${run}`} style={{ position: "absolute", inset: 0 }}>
        {body}
      </div>
      <div
        role="tablist"
        aria-label="演出"
        style={{
          position: "absolute",
          top: "calc(64px + env(safe-area-inset-top))",
          left: 8,
          right: 8,
          zIndex: 20000,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              if (tab === t.key) setRun((n) => n + 1);
              else setTab(t.key);
            }}
            style={{
              minHeight: 40,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: tab === t.key ? "#0a84ff" : "rgba(30,30,32,0.72)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              backdropFilter: "blur(12px)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "catch" && (
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          style={{
            position: "absolute",
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20000,
            minHeight: 44,
            padding: "0 18px",
            borderRadius: 999,
            background: "#0a84ff",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          もう一度
        </button>
      )}
    </div>
  );
}

/** ① 本番と同じ全画面: 撮った写真の上に 3D の走査。 */
function AnalyzeView() {
  return (
    <div className="fixed inset-0 bg-black">
      <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <ScanAnalyzing_v13depth stage="reading" />
    </div>
  );
}

/**
 * ② 本番のキャッチの流れ（弾ける瞬間に 3D の紙と金の箔、着地で録った「シュッ→ドン」）。
 * 最後に記念アルバムの紙吹雪（両端から打ち上げ）も続けて見せる。
 */
function CatchView({ run }: { run: number }) {
  useEffect(() => {
    const id = window.setTimeout(
      () => burstConfetti3d({ from: "corners", count: 220 }, 9000),
      5200,
    );
    return () => window.clearTimeout(id);
  }, [run]);
  return <RewardCatchScene />;
}

// ---- ④ 図鑑の 3D 展示室 ----------------------------------------------------

const art = (bg: string, body: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#1b2433"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/>${body}</svg>`,
  );

export const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: "g1",
    word: "珍珠奶茶",
    gloss: "タピオカミルクティー",
    image: art(
      "#e9c9a0",
      '<rect x="176" y="120" width="160" height="290" rx="24" fill="#f5e6d0" stroke="#fff" stroke-width="8"/><rect x="176" y="250" width="160" height="160" rx="20" fill="#c08a58"/><g fill="#3b2418">' +
        Array.from(
          { length: 14 },
          (_, i) =>
            `<circle cx="${196 + (i % 5) * 30}" cy="${372 - Math.floor(i / 5) * 26}" r="11"/>`,
        ).join("") +
        '</g><rect x="248" y="60" width="16" height="190" rx="8" fill="#0a84ff"/>',
    ),
  },
  {
    id: "g2",
    word: "夜市",
    gloss: "夜市",
    image: art(
      "#3a1f4d",
      Array.from(
        { length: 5 },
        (_, i) =>
          `<ellipse cx="${70 + i * 94}" cy="${150 + (i % 2) * 30}" rx="34" ry="44" fill="#ff5a3c"/><rect x="${58 + i * 94}" y="${100 + (i % 2) * 30}" width="24" height="10" fill="#222"/>`,
      ).join("") +
        '<rect x="0" y="330" width="512" height="182" fill="#241a2e"/><rect x="40" y="300" width="180" height="60" rx="8" fill="#ffd23f"/><rect x="292" y="300" width="180" height="60" rx="8" fill="#58d7ff"/>',
    ),
  },
  {
    id: "g3",
    word: "芒果冰",
    gloss: "マンゴーかき氷",
    image: art(
      "#9fd7f0",
      '<ellipse cx="256" cy="400" rx="170" ry="34" fill="#ffffff"/><path d="M110 390 Q256 110 402 390Z" fill="#fff6e0"/><g fill="#ffb02e">' +
        Array.from(
          { length: 9 },
          (_, i) =>
            `<rect x="${170 + (i % 3) * 58}" y="${220 + Math.floor(i / 3) * 50}" width="46" height="40" rx="8"/>`,
        ).join("") +
        "</g>",
    ),
  },
  {
    id: "g4",
    word: "腳踏車",
    gloss: "自転車",
    image: art(
      "#bfe3c0",
      '<g fill="none" stroke="#1d1d1f" stroke-width="14"><circle cx="150" cy="330" r="80"/><circle cx="362" cy="330" r="80"/><path d="M150 330 L230 210 L330 210 L362 330 M230 210 L256 330 L330 210"/></g><rect x="212" y="186" width="54" height="14" rx="7" fill="#1d1d1f"/>',
    ),
  },
  {
    id: "g5",
    word: "廟",
    gloss: "お寺",
    image: art(
      "#f2b36b",
      '<path d="M70 230 Q256 120 442 230 L410 240 Q256 170 102 240Z" fill="#b8242c"/><rect x="120" y="240" width="272" height="170" fill="#e34a3a"/><rect x="220" y="300" width="72" height="110" fill="#5a1a14"/><path d="M60 230 Q40 200 70 190" stroke="#2f7a4d" stroke-width="12" fill="none"/><path d="M452 230 Q472 200 442 190" stroke="#2f7a4d" stroke-width="12" fill="none"/>',
    ),
  },
  { id: "g6", word: "謝謝", gloss: "ありがとう", image: null },
  {
    id: "g7",
    word: "機車",
    gloss: "バイク",
    image: art(
      "#c9c6f5",
      '<circle cx="150" cy="370" r="56" fill="#1d1d1f"/><circle cx="370" cy="370" r="56" fill="#1d1d1f"/><path d="M130 330 L200 250 L330 250 L400 330 L300 330 L270 290 L200 330Z" fill="#0a84ff"/><rect x="310" y="210" width="60" height="14" rx="7" fill="#1d1d1f"/>',
    ),
  },
];

function GalleryView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gallery = useRef<Gallery3D | null>(null);
  const spring = useRef<Spring | null>(null);
  const [center, setCenter] = useState(0);
  const [failed, setFailed] = useState(false);
  const n = GALLERY_ITEMS.length;
  // 指 1 枚ぶんの送り量（px）。画面の幅の 45%。
  const step = useRef(180);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = createGallery3d(el, GALLERY_ITEMS);
    if (!g) {
      setFailed(true);
      return;
    }
    gallery.current = g;
    step.current = Math.max(120, el.clientWidth * 0.45);
    void preloadSfx(["gallery-slide"]);
    const sp = createSpring(0, (px) => {
      const o = px / step.current;
      g.setOffset(o);
      setCenter(Math.max(0, Math.min(n - 1, Math.round(o))));
    });
    spring.current = sp;
    return () => {
      sp.stop();
      g.dispose();
      gallery.current = null;
    };
  }, [n]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    playSfx("gallery-slide", { gain: 0.8 });
  }, [center]);

  const drag = useRef<{
    x0: number;
    from: number;
    moved: boolean;
    history: { t: number; x: number }[];
  } | null>(null);
  const bring = (i: number) =>
    spring.current?.to(Math.max(0, Math.min(n - 1, i)) * step.current, {
      response: 0.5,
      damping: 1,
    });
  if (failed) {
    return (
      <div style={{ color: "#fff", padding: 80, textAlign: "center" }}>
        この端末では WebGL が使えません
      </div>
    );
  }
  const item = GALLERY_ITEMS[center];
  return (
    <div style={{ position: "absolute", inset: 0, background: "#f5f3ef" }}>
      <canvas
        ref={canvas}
        aria-label="図鑑の展示室"
        style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }}
        onPointerDown={(e) => {
          spring.current?.stop();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = {
            x0: e.clientX,
            from: spring.current?.value() ?? 0,
            moved: false,
            history: [{ t: e.timeStamp, x: e.clientX }],
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x0;
          if (Math.abs(dx) > 6) d.moved = true;
          const max = (n - 1) * step.current;
          let x = d.from - dx;
          if (x < 0) x = -rubberband(-x, step.current * 2);
          else if (x > max) x = max + rubberband(x - max, step.current * 2);
          d.history.push({ t: e.timeStamp, x: e.clientX });
          if (d.history.length > 6) d.history.shift();
          spring.current?.set(x, 0);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (!d.moved) {
            // 押した作品を真ん中へ（真ん中の作品なら、本番では詳細が開く）。
            const hit = gallery.current?.pick(e.clientX, e.clientY);
            if (hit != null) bring(hit);
            return;
          }
          const v = -velocityFrom(d.history);
          const cur = spring.current?.value() ?? 0;
          const target = settleIndex(cur, v, step.current, n);
          spring.current?.to(target * step.current, {
            ...(Math.abs(v) > 600
              ? { response: 0.5, damping: 0.85 }
              : { response: 0.5, damping: 1 }),
            velocity: v,
          });
        }}
        onPointerCancel={() => {
          drag.current = null;
          bring(center);
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "calc(28px + env(safe-area-inset-bottom))",
          textAlign: "center",
          color: "#1d1d1f",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 13, color: "#6e6e73" }}>
          {center + 1} / {n}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
          {GALLERY_ITEMS.map((g, i) => (
            <span
              key={g.id}
              style={{
                width: i === center ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === center ? "#0a84ff" : "rgba(0,0,0,0.2)",
                transition: "width 240ms cubic-bezier(0.32,0.72,0,1)",
              }}
            />
          ))}
        </div>
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
          {item?.word}
        </span>
      </div>
    </div>
  );
}
