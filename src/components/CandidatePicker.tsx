import { useState } from "react";
import { shortMeaning } from "@/lib/meaning-rule";
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
 * 説明が長い時は折り返し」）。
 *
 * **2026-09-28 の作り直し**（オーナー指示「柚子みたいにこれだけ大きく表示したり、単語の
 * 解説を長く書くのではなく、他にも写ってるものと同じ大きさで表示して。柚子（もっとも一般的な
 * 言い方）をタップしたら、次の画面に移り、柚子は大きく、ほかの詳しい言い方、専門的な言い方、
 * 砕けた言い方、固有名詞などは小さく表示して」「説明が長すぎる文はなしで」）:
 * - 1段目は**全部同じ大きさ**の一覧。1つ目だけを大きくしない。説明は訳の短い一言だけ
 *   （使い分けの一言は2段目で）。長ければ2行で切る（横には伸ばさない）。
 * - 2段目で初めて、ふだんの言い方を大きく、ほかの言い方（砕けた・くわしい・固有名詞）を小さく。
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
                {c.register && c.register !== "common" && (
                  <span className="mb-0.5 inline-block rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                    {t(
                      c.register === "proper"
                        ? "cap.regProper"
                        : c.register === "casual"
                          ? "cap.regCasual"
                          : "cap.regSpecific",
                    )}
                  </span>
                )}
                <WordLine c={c} language={language} size="body" />
              </button>
              <PronounceButton
                text={c.headword}
                language={language}
                tone="hero"
                size="sm"
                ident={{ pinyin: c.pinyin, zhuyin: c.reading_zhuyin }}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!groups.length) return null;
  return (
    <div className="candidate-picker space-y-2" data-stage="1">
      <p className="px-1 text-footnote font-semibold text-muted-foreground">{t("cap.inPhoto")}</p>
      {/* 全部同じ大きさ（1つ目だけを大きくしない）。 */}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {groups.map((r, k) => (
          <li
            key={r.main.headword}
            // 背の低い画面では行の上下を詰める（下の入力欄まで1画面に。`PickWordPanel` の注）。
            className="flex min-w-0 items-center gap-2 px-3 py-2.5 [@media(max-height:700px)]:py-1"
          >
            <button
              type="button"
              onClick={() => choose(k)}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <WordLine c={r.main} language={language} size="title" note={false} />
              </span>
              {r.others.length > 0 && (
                <span className="flex shrink-0 items-center text-caption text-muted-foreground">
                  {t("cap.otherNamesN", { n: r.others.length })}
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </button>
            <PronounceButton
              text={r.main.headword}
              language={language}
              tone="hero"
              size="sm"
              ident={{ pinyin: r.main.pinyin, zhuyin: r.main.reading_zhuyin }}
            />
          </li>
        ))}
      </ul>
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
              className="zy-word--balanced block text-hero font-medium leading-tight"
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
          {c.meaning_ja && (
            <span className="mt-1 line-clamp-2 block break-words text-body text-muted-foreground">
              {shortMeaning(c.meaning_ja)}
            </span>
          )}
          {c.distinction && (
            <span className="mt-0.5 line-clamp-2 block break-words text-footnote text-primary-ink">
              {c.distinction}
            </span>
          )}
        </button>
        <PronounceButton
          text={c.headword}
          language={language}
          tone="hero"
          ident={{ pinyin: c.pinyin, zhuyin: c.reading_zhuyin }}
        />
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

/**
 * 一覧の1語。注音は字の右（組めない語は下の行）。訳は**2行まで**（それ以上は切る —
 * 横に伸ばさない）。使い分けの一言は `note` のときだけ（2段目）。
 */
function WordLine({
  c,
  language,
  size,
  note = true,
}: {
  c: PickCandidate;
  language: string;
  size: "title" | "headline" | "body";
  note?: boolean;
}) {
  const units = useZhuyinUnits(language, c.headword, c.reading_zhuyin);
  const cls = size === "title" ? "text-title" : size === "headline" ? "text-headline" : "text-body";
  return (
    <>
      {units ? (
        // **見出しと同じ比（字の 0.36 倍）**（オーナー報告 2026-09-29「ほかの言い方の漢字と注音の
        // バランスが悪い、注音がでかすぎる。上の保温杯のやつと同じバランス比にして。漢字も小さい
        // ときは注音もそれに合わせて小さくして」）。下限 11px を外す（`zy-word--balanced`）。
        <ZhuyinWord
          units={units}
          lang={language}
          className={`zy-word--balanced block ${cls} font-medium`}
        />
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
      {/* 表示言語の意味が無い時は空（別の言語の意味は出さない）。空の行は描かない。 */}
      {c.meaning_ja && (
        <span className="line-clamp-2 block break-words text-footnote text-muted-foreground">
          {shortMeaning(c.meaning_ja)}
        </span>
      )}
      {note && c.distinction && (
        <span className="line-clamp-2 block break-words text-caption text-primary-ink">
          {c.distinction}
        </span>
      )}
    </>
  );
}
