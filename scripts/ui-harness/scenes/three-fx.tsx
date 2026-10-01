import { useEffect, useState, type ReactNode } from "react";
import { ScanAnalyzing_v13depth } from "@/components/effects/scan-analyzing/v13_depth";
import { burstConfetti3d } from "@/components/three/confetti3d";
import { photo } from "./peel-sticker";
import { RewardCatchScene } from "./reward-catch";
import { Shelf3DScene } from "./shelf-3d";

/**
 * **重要な演出を 3D で**（オーナー指示 2026-09-28「①AIの分析中のアニメーション
 * ②キャッチ、祝福のアニメーション③本棚の本と本を開いたあとのページ④図鑑のスライドの
 * やつ。…Blenderやthree.jsなど最新の3Dモデルを使用し、リアルで現実的なアニメーション
 * を実装して。BGMや効果音は…本物の映画の効果音のクオリティ」）。
 *
 * 上の4つのボタンで切り替える（`?fx=analyze|catch|shelf`。④ 図鑑 3D の試作は 2026-10-01 に消した）。音は画面を
 * 1回押した後に鳴る（ブラウザの決まり）。
 */
const TABS = [
  { key: "analyze", label: "① 分析中" },
  { key: "catch", label: "② キャッチ・祝福" },
  { key: "shelf", label: "③ 本棚・本" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function ThreeFxScene({ q }: { q: URLSearchParams }) {
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.key === q.get("fx"))?.key ?? "analyze");
  const [run, setRun] = useState(0);
  let body: ReactNode;
  if (tab === "analyze") body = <AnalyzeView />;
  else if (tab === "catch") body = <CatchView run={run} />;
  else body = <Shelf3DScene q={new URLSearchParams("open=12")} />;
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
