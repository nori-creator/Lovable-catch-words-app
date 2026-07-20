import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { WordCard } from "@/components/WordCard";
import type { GeneratedCard } from "@/lib/ai.functions";
import type { DetectedItem, DictionaryEntry } from "@/lib/scan.functions";

type Props = {
  headword: string;
  item: DetectedItem;
  dict: DictionaryEntry | undefined;
  cardPromise: Promise<GeneratedCard>;
  onClose: () => void;
};

/**
 * §3.3 "詳しく →" sheet. Consumes the promise already started at tap time
 * (prefetch), so if the user waits 3s+ before opening this, the card is
 * already resolved and rendering is instant.
 */
export function ScanDetailSheet({ headword, item, dict, cardPromise, onClose }: Props) {
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cardPromise
      .then((c) => { if (!cancelled) setCard(c); })
      .catch((e) => { if (!cancelled) setErr((e as Error)?.message || "生成に失敗しました"); });
    return () => { cancelled = true; };
  }, [cardPromise]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="material-in fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md" role="dialog">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur">
        <span className="pl-1 text-xs font-medium text-muted-foreground">{headword} — 詳しく</span>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-transform duration-100 active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {err ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p>
        ) : !card ? (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="mt-2 text-xs">詳しい解説を準備中…</p>
          </div>
        ) : (
          <WordCard
            word={{
              headword,
              reading_zhuyin: dict?.zhuyin ?? card.reading_zhuyin,
              pinyin: dict?.pinyin ?? card.pinyin,
              meaning_ja: dict?.meaning_ja ?? card.meaning_ja,
              part_of_speech: dict?.pos ?? card.part_of_speech,
              level: card.level,
              example_sentence: card.example_sentence,
              example_translation: card.example_translation,
              extras: card.extras,
            }}
          />
        )}
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          {dict ? "✓ 検証済み辞書 + AI詳細" : "AI生成"} · 点 {item.confidence.toFixed(2)}
        </p>
      </div>
    </div>
  );
}
