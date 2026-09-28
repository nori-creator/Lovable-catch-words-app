import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useTargetLang } from "@/lib/target-lang-pref";
import { normalizeTargetLanguage } from "@/lib/target-lang";

/**
 * **AI 分析中の新しい案 B〜E**（オーナー指示 2026-09-27「AI分析中の
 * アニメーション案を複数出して」）。A は今の形（`v0_cutout`）。
 *
 * どれも「撮った写真の上に重ねる層」で、写真は呼ぶ側が敷く。
 * 文言は4案とも同じ「AIが分析中…」— 違いは**動きだけ**にして、
 * 見比べたときに動きの差だけが目に入るようにしている。
 *
 * 動きを減らす設定では、動きを止めて文言だけ残す（`styles.css` の
 * `html[data-motion="reduce"] .an-*`）。
 */

type Stage = "sensing" | "reading" | "matching";

function Caption({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-6 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-24 text-center text-white">
      {children}
      <div className="flex items-center gap-2" role="status">
        <Sparkles className="h-5 w-5" aria-hidden />
        <span className="font-semibold">{t("scan.analyzing")}</span>
      </div>
    </div>
  );
}

/** B: 光が物の輪郭をなぞる（シールの形を作っている、と見える）。 */
export function ScanAnalyzing_v9trace(_: { stage: Stage; cutout?: boolean }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-black/30" />
      <svg
        className="an-trace absolute left-1/2 top-[42%] h-[64vw] max-h-80 w-[64vw] max-w-80 -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <rect className="an-trace__base" x="3" y="3" width="94" height="94" rx="20" />
        <rect
          className="an-trace__path"
          x="3"
          y="3"
          width="94"
          height="94"
          rx="20"
          pathLength={100}
        />
      </svg>
      <Caption />
    </div>
  );
}

/**
 * C: 学習言語の文字が写真から浮かび上がって消える（言葉を読み取っている、
 * と見える）。**答えは出さない** — 浮かぶのは注音の記号やアルファベット
 * だけで、語そのものではない。
 */
const GLYPHS: Record<string, string> = {
  en: "abcdefghijklmn",
  default: "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒ",
};
const SPOTS = [
  [18, 30],
  [72, 22],
  [44, 48],
  [82, 55],
  [26, 62],
  [60, 70],
  [12, 50],
  [52, 28],
  [36, 36],
  [76, 40],
  [66, 52],
  [30, 20],
] as const;

export function ScanAnalyzing_v10glyphs(_: { stage: Stage; cutout?: boolean }) {
  const lang = normalizeTargetLanguage(useTargetLang());
  const set = GLYPHS[lang] ?? GLYPHS.default;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-black/35" />
      <div aria-hidden>
        {SPOTS.map(([x, y], i) => (
          <span
            key={i}
            className="an-glyph absolute text-title font-semibold text-white"
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i * 0.27) % 2.4}s` }}
          >
            {set[i % set.length]}
          </span>
        ))}
      </div>
      <Caption />
    </div>
  );
}

/** D: ガラスのレンズが写真の上をゆっくり探して回る。 */
export function ScanAnalyzing_v11lens(_: { stage: Stage; cutout?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-black/20" />
      <div className="an-lens absolute left-1/2 top-[40%]" aria-hidden />
      <Caption />
    </div>
  );
}

/**
 * E: 3つの段が順に進む（見る → 読む → 選ぶ）。いま何をしているかが
 * 言葉で分かる、**終わりの見える待ち方**。段は呼ぶ側の `stage` に従う。
 */
const STEP_OF: Record<Stage, number> = { sensing: 0, reading: 1, matching: 2 };

export function ScanAnalyzing_v12steps({ stage }: { stage: Stage; cutout?: boolean }) {
  const t = useT();
  const at = STEP_OF[stage] ?? 0;
  const steps = [t("analyze.stepLook"), t("analyze.stepRead"), t("analyze.stepPick")];
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-black/30" />
      <Caption>
        <ol className="flex items-center gap-1.5" aria-label={t("scan.analyzing")}>
          {steps.map((s, i) => (
            <li
              key={s}
              aria-current={i === at ? "step" : undefined}
              className={`an-step rounded-full px-3 py-1 text-footnote font-semibold ${
                i < at
                  ? "bg-white/85 text-black"
                  : i === at
                    ? "an-step--on bg-primary text-primary-foreground"
                    : "bg-white/15 text-white/80"
              }`}
            >
              {s}
            </li>
          ))}
        </ol>
      </Caption>
    </div>
  );
}
