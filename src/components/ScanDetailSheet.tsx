import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { WordCard } from "@/components/WordCard";
import type { GeneratedCard } from "@/lib/ai.functions";
import type { DetectedItem, DictionaryEntry } from "@/lib/scan.functions";
import { Zh } from "@/components/Zh";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cardPromise
      .then((c) => {
        if (!cancelled) setCard(c);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error)?.message || t("err.generateFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [cardPromise, t]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="material-in fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
      role="dialog"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur">
        {/* **主題のほうを重くする。** 見出しが 12px のグレーで、右の × が
            44px の枠付き白丸だったので、**退出口が主題より目立って**いた
            (独立監査)。「— 詳しく」という区切りも開発者的なので落とし、
            語だけを見出しにする。 */}
        <span className="pl-1 text-base font-semibold">
          <Zh>{headword}</Zh>
        </span>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          // **出口は 44px を割らない。** ここは覆っている面の唯一の出口で、
          // 小さいほど「閉じられない」に直結する(36px だった)。
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-transform duration-100 hover:bg-secondary active:scale-95"
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
            <p className="mt-2 text-xs">{t("detail.preparing")}</p>
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
        {/* 出所は**中身の直下**に置く。以前はスピナーの 180px 下に
            浮いていて、まだ何も出ていない中身について出所を語っていた。
            confidence(0.92)も出していたが、あれはモデルの内部値で、
            学習者には意味が無い(独立監査)。人の言葉だけを残す。

            「検証済み」と言えるのは辞書の出所が verified のときだけ。
            `dict` の有無で言っていたので、同じ語が**このシートでは
            検証済み、次のシートではAI生成**と1タップの間に食い違っていた。 */}
        {card && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {dict?.source === "verified" ? t("detail.verified") : t("detail.aiOnly")}
          </p>
        )}
      </div>
    </div>
  );
}
