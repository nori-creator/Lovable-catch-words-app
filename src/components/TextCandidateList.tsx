import { ChevronLeft, ChevronRight, Languages, Loader2 } from "lucide-react";
import { PronounceButton } from "@/components/PronounceButton";
import { Term } from "@/components/Term";
import { useT } from "@/lib/i18n";
import { shortMeaning } from "@/lib/meaning-rule";
import { Reading } from "@/lib/phonetic";
import type { CandidateUsage, TextCandidate } from "@/lib/text-search-flow";

/** 使われ方の札の文言（`local` は学習言語で言い方が変わる）。 */
export function usageLabelKey(usage: CandidateUsage | null, targetLanguage: string): string | null {
  switch (usage) {
    case "common":
      return "textPick.usage.common";
    case "colloquial":
      return "textPick.usage.colloquial";
    case "formal":
      return "textPick.usage.formal";
    case "academic":
      return "textPick.usage.academic";
    case "local":
      return targetLanguage.startsWith("zh") ? "textPick.usage.taiwan" : "textPick.usage.local";
    default:
      return null;
  }
}

/**
 * **母語で打った語の、学習言語の候補**（オーナー指示 2026-10-08「母語で一対一の関係ではなく、
 * 複数の単語の候補がある場合（同じ日本でも台湾華語だと区別があったり一般でな言い方や学術的な
 * 言い方など）は単語の候補を表示して」）。
 *
 * 1行に1語: 語（繁体字）・読み・使われ方の札（一般的 / 口語 / 書き言葉 …）・一行の訳と違い。
 * 押した行だけがその場で回り（札の絵と発音がそろうまで）、そろったら剥がす札の画面へ移る。
 * 白い札・青い印の見出し（アプリのほかの面と同じ）。
 */
export function TextCandidateList({
  query,
  candidates,
  language,
  preparing,
  onPick,
  onBack,
}: {
  /** 打った語（見出しに出す）。 */
  query: string;
  candidates: readonly TextCandidate[];
  /** 候補の学習言語。 */
  language: string;
  /** いま札を用意している語（その行だけ回す。ほかの行は押せない）。 */
  preparing: string | null;
  onPick: (c: TextCandidate) => void;
  onBack: () => void;
}) {
  const t = useT();
  const zh = language.startsWith("zh");
  return (
    <div className="space-y-3 overflow-x-hidden [touch-action:pan-y]" data-testid="text-candidates">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-body text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("textPick.back")}
      </button>
      <header className="flex items-center gap-3 px-1">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink">
          <Languages className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-headline font-bold tracking-tight">
            {t("textPick.title", { query })}
          </h2>
          <p className="text-footnote text-muted-foreground">{t("textPick.hint")}</p>
        </div>
      </header>
      <ul
        className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        aria-busy={!!preparing}
      >
        {candidates.map((c) => {
          const busy = preparing === c.headword;
          const label = usageLabelKey(c.usage, language);
          return (
            <li key={c.headword} className="flex min-w-0 items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => onPick(c)}
                disabled={!!preparing}
                aria-busy={busy}
                data-testid="text-candidate"
                className="flex min-h-14 min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-100"
              >
                <span className={`min-w-0 flex-1 ${preparing && !busy ? "opacity-50" : ""}`}>
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Term lang={language} className="break-words text-title font-medium">
                      {c.headword}
                    </Term>
                    {zh ? (
                      c.pinyin && (
                        <span className="text-footnote text-muted-foreground">{c.pinyin}</span>
                      )
                    ) : (
                      <Reading
                        lang={language}
                        zhuyin={c.reading_zhuyin}
                        pinyin={c.pinyin}
                        className="text-footnote text-muted-foreground"
                      />
                    )}
                    {label && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary-ink">
                        {t(label)}
                      </span>
                    )}
                  </span>
                  {c.meaning_ja && (
                    <span className="mt-0.5 line-clamp-2 block break-words text-footnote text-foreground/80">
                      {shortMeaning(c.meaning_ja)}
                    </span>
                  )}
                  {c.distinction && (
                    <span className="line-clamp-2 block break-words text-caption text-muted-foreground">
                      {c.distinction}
                    </span>
                  )}
                </span>
                <span className="grid h-6 w-6 shrink-0 place-items-center text-muted-foreground">
                  {busy ? (
                    <Loader2
                      className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none"
                      aria-label={t("textPick.preparing")}
                    />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  )}
                </span>
              </button>
              <PronounceButton
                text={c.headword}
                language={language}
                tone="hero"
                size="sm"
                ident={{ pinyin: c.pinyin, zhuyin: c.reading_zhuyin }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
