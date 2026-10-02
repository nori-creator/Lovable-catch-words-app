import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MEMORY_LEVELS, memoryOf } from "@/lib/memory";
import type { MemoryWord } from "@/lib/reviews.functions";
import { useTargetLang } from "@/lib/target-lang-pref";
import { Term } from "@/components/Term";
import type { SeriesPoint } from "./model";

/**
 * どの案も**同じ形で受け取る**。本番の `ReviewSessionHeader` が既に持っている物だけ
 * （`memOverview.words`・`memStats.series`・開閉・語を押した時）なので、選んだ案は
 * あそこの `MemoryLevelSummary` / `MemoryOverviewPanel` / `MiniRetentionGraph` の
 * 位置へそのまま差し替えられる。
 */
export type MemoryDesignProps = {
  words: MemoryWord[];
  /** 前後2週間の全体の記憶率（`getOverallMemoryStats().series`）。 */
  series: SeriesPoint[];
  expanded: boolean;
  onToggle: () => void;
  onOpenWord: (w: MemoryWord) => void;
  /** 見本で日付を固定するため。本番では渡さない。 */
  nowMs?: number;
};

/**
 * 畳んだ時の1行（押すと開く）。**本番の帯と同じ作り** — 見た目は細いまま、
 * `before` で指の当たり判定だけ上下に広げて 44px を満たす。
 */
export function SummaryButton({
  expanded,
  onToggle,
  children,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** 読み上げの名前（目に見える字だけでは足りない時）。 */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      className="relative mt-3 flex w-full items-center gap-2 text-left before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] active:opacity-70"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronDown
        aria-hidden
        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
          expanded ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

/** 開いた中身の器。本番の一覧と同じカード。 */
export function DesignCard({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card p-3 shadow-sm">{children}</div>
  );
}

/**
 * 押せる語の札（押すと忘却曲線）。色の点 + 語 + %。**段の名前は読み上げにだけ**
 * （画面の数は1つ — `memoryOf` の %）。
 */
export function WordChip({ word, onOpen }: { word: MemoryWord; onOpen: (w: MemoryWord) => void }) {
  const targetLanguage = useTargetLang();
  const { level, percent } = memoryOf(word);
  return (
    <button
      type="button"
      onClick={() => onOpen(word)}
      className="relative inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-footnote before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] active:scale-95"
    >
      <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${level.bar}`} />
      <Term lang={targetLanguage} className="font-medium">
        {word.headword}
      </Term>
      <span className={`tabular-nums font-semibold ${level.text}`}>{percent}%</span>
    </button>
  );
}

/** 札の点の色の意味。**色だけに意味を負わせない**ための凡例（使われている段だけ）。 */
export function LevelLegend({ words }: { words: MemoryWord[] }) {
  const t = useT();
  const used = new Set(words.map((w) => memoryOf(w).level.level));
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
      {MEMORY_LEVELS.filter((lv) => used.has(lv.level)).map((lv) => (
        <span key={lv.level} className="inline-flex items-center gap-1">
          <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${lv.bar}`} />
          {t(lv.labelKey)}
        </span>
      ))}
    </div>
  );
}
