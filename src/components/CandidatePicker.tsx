import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PronounceButton } from "@/components/PronounceButton";
import { Term } from "@/components/Term";
import { ZhuyinWord, useZhuyinUnits } from "@/components/ZhuyinWord";
import { groupCandidates, type Register } from "@/lib/candidate-order";
import { useT } from "@/lib/i18n";
import { Reading } from "@/lib/phonetic";

/**
 * **撮った後の候補を2段で選ぶ**（オーナー指示 2026-09-27）。
 *
 * > 「C のデザインで、ネイティブが最も自然に言う単語を第一画面に一覧表示。
 * >  ただし写真に映る候補それぞれ別々の名詞。注音は漢字の右。名詞をタップ
 * >  したら2段階目として D（最も自然な普段の言い方を一番大きく、下に専門的な
 * >  言い方や固有名詞）。他の言い方が無い場合は2段階目を表示しない。」
 *
 * - 1段目 … 写っている**物ごとに1語**（ふだんの呼び方）。いちばん確からしい物を
 *   大きく（C）、残りは「ほかに写っている物」として下に並べる。
 * - 2段目 … 押した物の**ほかの言い方**が在る時だけ。ふだんの呼び方を一番大きく、
 *   下に「くわしい名前」「固有名詞」。無ければ押した瞬間にその語で進む。
 *
 * **横には動かない**（同日「撮影後の単語候補画面を横スライドできないよう固定。
 * 説明が長い時は折り返し」）。訳・使い分けは省略せず折り返す。
 */
export type PickCandidate = {
  headword: string;
  reading_zhuyin: string;
  pinyin: string;
  meaning_ja: string;
  distinction?: string;
  register?: Register | null;
  group?: number | null;
};

export function CandidatePicker<T extends PickCandidate>({
  suggestions,
  language,
  onPick,
}: {
  suggestions: readonly T[];
  language: string;
  onPick: (s: T) => void;
}) {
  const t = useT();
  const groups = groupCandidates(suggestions);
  const [open, setOpen] = useState<number | null>(null);
  const choose = (i: number) => {
    const g = groups[i];
    if (!g) return;
    if (g.others.length === 0) onPick(g.main);
    else setOpen(i);
  };

  const g = open == null ? null : groups[open];
  if (g) {
    return (
      <div className="candidate-picker space-y-3" data-stage="2">
        <button
          type="button"
          onClick={() => setOpen(null)}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-body text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back")}
        </button>
        <HeroWord
          c={g.main}
          language={language}
          onWord={() => onPick(g.main)}
          onPick={() => onPick(g.main)}
        />
        <p className="px-1 text-footnote font-semibold text-muted-foreground">
          {t("cap.otherNames")}
        </p>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {g.others.map((c) => (
            <li key={c.headword} className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => onPick(c)}
                className="min-h-11 min-w-0 flex-1 text-left"
              >
                <WordLine c={c} language={language} size="headline" />
                {c.register && c.register !== "common" && (
                  <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                    {t(c.register === "proper" ? "cap.regProper" : "cap.regSpecific")}
                  </span>
                )}
              </button>
              <PronounceButton text={c.headword} language={language} tone="hero" size="sm" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const [first, ...rest] = groups;
  if (!first) return null;
  return (
    <div className="candidate-picker space-y-3" data-stage="1">
      <HeroWord
        c={first.main}
        language={language}
        more={first.others.length}
        onWord={() => choose(0)}
        onPick={() => onPick(first.main)}
        onMore={() => setOpen(0)}
      />
      {rest.length > 0 && (
        <>
          <p className="px-1 text-footnote font-semibold text-muted-foreground">
            {t("cap.otherObjects")}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {rest.map((r, k) => (
              <li key={r.main.headword} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => choose(k + 1)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <WordLine c={r.main} language={language} size="title" />
                  </span>
                  {r.others.length > 0 && (
                    <span className="flex shrink-0 items-center text-caption text-muted-foreground">
                      {t("cap.otherNamesN", { n: r.others.length })}
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </button>
                <PronounceButton text={r.main.headword} language={language} tone="hero" size="sm" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** いちばん大きく見せる1語（C の上の札）。 */
function HeroWord({
  c,
  language,
  onWord,
  onPick,
  onMore,
  more = 0,
}: {
  c: PickCandidate;
  language: string;
  /** 語そのものを押した（ほかの言い方が在れば2段目へ）。 */
  onWord: () => void;
  /** 「この語で図鑑に入れる」— 2段目を通らずにこの語で進む。 */
  onPick: () => void;
  onMore?: () => void;
  /** ほかの言い方の数。 */
  more?: number;
}) {
  const t = useT();
  const units = useZhuyinUnits(language, c.headword, c.reading_zhuyin);
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onWord} className="min-w-0 flex-1 text-left">
          {units ? (
            <ZhuyinWord
              units={units}
              lang={language}
              className="block text-hero font-medium leading-tight"
            />
          ) : (
            <Term lang={language} className="block break-words text-hero font-medium leading-tight">
              {c.headword}
            </Term>
          )}
          {!units && (
            <Reading
              lang={language}
              zhuyin={c.reading_zhuyin}
              pinyin={c.pinyin}
              className="mt-0.5 block text-footnote text-muted-foreground"
            />
          )}
          <span className="mt-1 block break-words text-body text-muted-foreground">
            {c.meaning_ja}
          </span>
          {c.distinction && (
            <span className="mt-0.5 block break-words text-footnote text-primary-ink">
              {c.distinction}
            </span>
          )}
        </button>
        <PronounceButton text={c.headword} language={language} tone="hero" />
      </div>
      <button
        type="button"
        onClick={onPick}
        className="mt-3 min-h-11 w-full rounded-full bg-primary text-body font-semibold text-primary-foreground active:scale-[0.98]"
      >
        {t("cap.pickThis")}
      </button>
      {more > 0 && onMore && (
        <button
          type="button"
          onClick={onMore}
          className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-0.5 text-footnote font-semibold text-primary-ink"
        >
          {t("cap.otherNamesN", { n: more })}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** 一覧の1語。注音は字の右（組めない語は下の行）。訳は折り返す。 */
function WordLine({
  c,
  language,
  size,
}: {
  c: PickCandidate;
  language: string;
  size: "title" | "headline";
}) {
  const units = useZhuyinUnits(language, c.headword, c.reading_zhuyin);
  const cls = size === "title" ? "text-title" : "text-headline";
  return (
    <>
      {units ? (
        <ZhuyinWord units={units} lang={language} className={`block ${cls} font-medium`} />
      ) : (
        <Term lang={language} className={`block break-words ${cls} font-medium`}>
          {c.headword}
        </Term>
      )}
      {!units && (
        <Reading
          lang={language}
          zhuyin={c.reading_zhuyin}
          pinyin={c.pinyin}
          className="block text-caption text-muted-foreground"
        />
      )}
      <span className="block break-words text-footnote text-muted-foreground">{c.meaning_ja}</span>
      {c.distinction && (
        <span className="block break-words text-caption text-primary-ink">{c.distinction}</span>
      )}
    </>
  );
}
