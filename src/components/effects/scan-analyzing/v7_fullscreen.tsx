import { useEffect, useState } from "react";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * スキャン中のフルスクリーン演出(2026-07-27 刷新)。
 *
 * 狙い: 待ち時間を「苦痛」ではなく「報酬」に変える。
 * 人は (a) 進行が見えている (b) 自分の世界が読み取られている実感がある
 * とき、同じ秒数を短く感じる(Labor illusion / progress transparency)。
 *
 * 構成 — 全部CSSとSVGで、外部アセットなし:
 *  1. 走査線: 上から下へ一度だけ抜ける光の刃(いま読んでいる場所)
 *  2. 解析グリッド: 極薄の格子が浮かび、機械が空間を測っている質感
 *  3. コーナーブラケット: カメラの照準が締まる(対象を捕まえた合図)
 *  4. 粒子の上昇: 読み取った情報が上へ吸い上げられる
 *  5. 段階ラベル: 見つける → 読む → 照合する の3段が順に灯る
 * 「少しだけ待ってね」のような待たせる言葉は出さない(NORI指定)。
 */

type Stage = "sensing" | "reading" | "matching";

const STEPS: { key: Stage; label: string }[] = [
  { key: "sensing", label: "空間を捉える" },
  { key: "reading", label: "文字と物を読む" },
  { key: "matching", label: "台湾華語と照合" },
];

export function ScanAnalyzing_v7fullscreen({ stage }: { stage: Stage }) {
  const idx = stage === "sensing" ? 0 : stage === "reading" ? 1 : 2;
  // 経過時間で微妙に表情を変える(同じ絵が止まって見えると長く感じる)。
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    Sound.scanStart();
    haptic("light");
  }, []);

  useEffect(() => {
    if (stage === "reading") {
      Sound.scanReading();
      haptic("selection");
    }
    if (stage === "matching") haptic("light");
  }, [stage]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 世界はそのまま見せる。締めるのは四隅と、下の情報帯だけ。 */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_38%,rgba(0,0,0,0.42)_100%)]" />

      {/* 2. 解析グリッド */}
      <div
        className="absolute inset-0 opacity-[0.16] scan-grid"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--accent-cyan) 1px, transparent 1px), linear-gradient(to bottom, var(--accent-cyan) 1px, transparent 1px)",
          backgroundSize: "38px 38px",
          maskImage: "radial-gradient(70% 55% at 50% 45%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(70% 55% at 50% 45%, #000 30%, transparent 100%)",
        }}
      />

      {/* 1. 走査線 — 刃の前後に薄いグローを持たせる */}
      <div className="scan-blade absolute inset-x-0 h-[42vh]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-[var(--accent-cyan)] shadow-[0_0_24px_6px_var(--accent-cyan)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[color-mix(in_oklab,var(--accent-cyan)_10%,transparent)] to-[color-mix(in_oklab,var(--accent-cyan)_26%,transparent)]" />
      </div>

      {/* 3. コーナーブラケット(照準が締まる) */}
      <div className="absolute inset-[9%] scan-bracket">
        {(
          [
            "left-0 top-0 border-l-2 border-t-2 rounded-tl-[14px]",
            "right-0 top-0 border-r-2 border-t-2 rounded-tr-[14px]",
            "left-0 bottom-0 border-l-2 border-b-2 rounded-bl-[14px]",
            "right-0 bottom-0 border-r-2 border-b-2 rounded-br-[14px]",
          ] as const
        ).map((cls) => (
          <span key={cls} className={`absolute h-9 w-9 border-[var(--accent-cyan)]/85 ${cls}`} />
        ))}
      </div>

      {/* 4. 情報の粒子が上へ吸い上がる */}
      {[12, 28, 44, 60, 76, 90].map((left, i) => (
        <span
          key={left}
          className="scan-mote absolute bottom-[26%] h-1 w-1 rounded-full bg-[var(--accent-cyan)]"
          style={{ left: `${left}%`, animationDelay: `${i * 0.28}s` }}
        />
      ))}

      {/* 5. 段階表示 — 読み取っている「いま」が言葉で分かる */}
      <div className="absolute inset-x-0 bottom-[18%] flex flex-col items-center gap-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent-cyan)] opacity-75 motion-reduce:animate-none" />
            <span className="relative h-2 w-2 rounded-full bg-[var(--accent-cyan)]" />
          </span>
          <p
            className="text-[15px] font-semibold tracking-[-0.01em] text-white"
            style={{ textShadow: "0 1px 12px rgba(0,0,0,0.6)" }}
          >
            {STEPS[idx].label}
            <span className="ml-1 inline-block w-6 text-left opacity-70">
              {".".repeat((tick % 3) + 1)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden>
          {STEPS.map((st, i) => (
            <span
              key={st.key}
              className="h-[3px] rounded-full transition-all duration-500"
              style={{
                width: i === idx ? 30 : 14,
                background:
                  i < idx
                    ? "var(--accent-cyan)"
                    : i === idx
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.28)",
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes scanBlade {
          0%   { transform: translateY(-45vh); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        .scan-blade { animation: scanBlade 1.9s cubic-bezier(0.4, 0, 0.5, 1) infinite; }
        @keyframes scanGrid {
          0%, 100% { opacity: 0.10; }
          50%      { opacity: 0.22; }
        }
        .scan-grid { animation: scanGrid 2.4s ease-in-out infinite; }
        @keyframes scanBracket {
          0%   { transform: scale(1.06); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: scale(1); opacity: 0.9; }
        }
        .scan-bracket { animation: scanBracket 700ms var(--ease-out-soft) both; }
        @keyframes scanMote {
          0%   { transform: translateY(0) scale(0.6); opacity: 0; }
          25%  { opacity: 0.95; }
          100% { transform: translateY(-30vh) scale(1.1); opacity: 0; }
        }
        .scan-mote { animation: scanMote 2.1s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .scan-blade, .scan-grid, .scan-mote { animation: none; }
          .scan-blade { opacity: 0.5; transform: translateY(28vh); }
          .scan-mote { opacity: 0.5; }
          .scan-bracket { animation: none; }
        }
      `}</style>
    </div>
  );
}
