import { useEffect, useState, type ReactElement } from "react";
import { ScanAnalyzing_v0cutout } from "@/components/effects/scan-analyzing/v0_cutout";
import {
  ScanAnalyzing_v9trace,
  ScanAnalyzing_v10glyphs,
  ScanAnalyzing_v11lens,
  ScanAnalyzing_v12steps,
} from "@/components/effects/scan-analyzing/v9_proposals";
import { photo } from "./peel-sticker";

/**
 * **AI 分析中の動きの案 A〜E**（オーナー指示 2026-09-27）。
 * 撮った写真の上に重ねたところを、本番と同じ全画面で見せる。
 * E の段は見本のため 1.6 秒ごとに進める（本番は AI の進みに合わせる）。
 */
type Stage = "sensing" | "reading" | "matching";
const VARIANTS: Array<{
  key: string;
  label: string;
  C: (p: { stage: Stage; cutout?: boolean }) => ReactElement;
}> = [
  { key: "a", label: "A 今の形", C: ScanAnalyzing_v0cutout },
  { key: "b", label: "B 輪郭をなぞる", C: ScanAnalyzing_v9trace },
  { key: "c", label: "C 文字が浮かぶ", C: ScanAnalyzing_v10glyphs },
  { key: "d", label: "D レンズ", C: ScanAnalyzing_v11lens },
  { key: "e", label: "E 3つの段", C: ScanAnalyzing_v12steps },
];
const STAGES: Stage[] = ["sensing", "reading", "matching"];

export function AnalyzingDesignsScene({ q }: { q: URLSearchParams }) {
  const [v, setV] = useState(VARIANTS.find((o) => o.key === q.get("v"))?.key ?? "a");
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % STAGES.length), 1600);
    return () => window.clearInterval(id);
  }, []);
  const C = (VARIANTS.find((o) => o.key === v) ?? VARIANTS[0]).C;
  return (
    <div className="fixed inset-0 z-40 bg-black">
      <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <C stage={STAGES[i]} />
      <div
        role="radiogroup"
        aria-label="分析中の案"
        className="absolute inset-x-0 top-[72px] z-10 flex flex-wrap justify-center gap-1.5 px-3"
      >
        {VARIANTS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={v === o.key}
            onClick={() => setV(o.key)}
            className={`min-h-11 rounded-full px-3 text-footnote font-semibold ${
              v === o.key ? "bg-primary text-primary-foreground" : "bg-black/55 text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
