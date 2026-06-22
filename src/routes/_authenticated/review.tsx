import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getDueReviews, gradeReview, type DueReviewCard } from "@/lib/reviews.functions";
import { Eye, Sparkles, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "復習 — Catchwords" },
      { name: "description", content: "今日の弱点語をAIが選別。ぼかしを剥がして思い出そう。" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const fetchDue = useServerFn(getDueReviews);
  const grade = useServerFn(gradeReview);
  const { data: cards, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["reviews-due"],
    queryFn: () => fetchDue(),
    staleTime: 0,
  });

  const [idx, setIdx] = useState(0);
  const [blurSeen, setBlurSeen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [showResult, setShowResult] = useState<{ correct: boolean; score: number } | null>(null);
  const startedAt = useRef<number>(Date.now());

  const current: DueReviewCard | undefined = cards?.[idx];
  const done = cards && idx >= cards.length;

  useEffect(() => {
    startedAt.current = Date.now();
    setBlurSeen(false);
    setPicked(null);
    setShowResult(null);
  }, [idx]);

  async function pick(choice: string) {
    if (!current || picked) return;
    setPicked(choice);
    const correct = choice === current.meaning_ja;
    const res = await grade({
      data: {
        review_id: current.review_id,
        correct,
        blur_seen: blurSeen,
        response_ms: Date.now() - startedAt.current,
      },
    });
    setShowResult({ correct, score: res.score });
  }

  const progress = useMemo(() => {
    if (!cards?.length) return 0;
    return Math.round((idx / cards.length) * 100);
  }, [cards, idx]);

  return (
    <AppShell title="復習">
      <section className="mb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">きょうの復習</h1>
          <span className="text-xs text-muted-foreground">
            {cards ? `${Math.min(idx, cards.length)} / ${cards.length}` : "—"}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {isLoading || isFetching ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">AIが今日の出題を選別中…</p>
        </div>
      ) : !cards?.length ? (
        <EmptyState />
      ) : done ? (
        <DoneState onAgain={() => { setIdx(0); refetch(); }} />
      ) : current ? (
        <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
          <div className="relative mx-auto mb-4 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
            {current.cutout_url ? (
              <img
                src={current.cutout_url}
                alt="復習対象"
                className={`h-full w-full object-contain p-4 transition-[filter] duration-300 ${
                  blurSeen || picked ? "blur-0" : "blur-md scale-105"
                }`}
              />
            ) : (
              <span className="text-5xl">📦</span>
            )}
            {!picked && (
              <button
                onClick={() => setBlurSeen(true)}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur hover:bg-background"
              >
                <Eye className="h-3 w-3" /> ぼかしを剥がす{blurSeen && "（-1点）"}
              </button>
            )}
          </div>

          <div className="mb-4 text-center">
            <div className="text-3xl font-bold tracking-tight">{current.headword}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {current.reading_zhuyin} {current.pinyin && `· ${current.pinyin}`}
            </div>
          </div>

          <ul className="space-y-2">
            {current.choices.map((c) => {
              const isPicked = picked === c;
              const isCorrect = picked && c === current.meaning_ja;
              const wrong = isPicked && !showResult?.correct;
              return (
                <li key={c}>
                  <button
                    disabled={!!picked}
                    onClick={() => pick(c)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-all
                      ${!picked ? "border-border bg-background hover:border-primary/60 hover:bg-accent/40" : ""}
                      ${isCorrect ? "border-green-500/60 bg-green-500/10" : ""}
                      ${wrong ? "border-red-500/60 bg-red-500/10" : ""}
                      ${picked && !isPicked && c !== current.meaning_ja ? "opacity-50" : ""}`}
                  >
                    <span>{c}</span>
                    {isCorrect && <Check className="h-4 w-4 text-green-600" />}
                    {wrong && <X className="h-4 w-4 text-red-600" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {showResult && (
            <div className="mt-5 rounded-2xl bg-secondary/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {showResult.correct ? "正解！" : "もう一度覚えよう"}
                </span>
                <span className="text-xs text-muted-foreground">スコア {showResult.score}/5</span>
              </div>
              {current.example_sentence && (
                <div>
                  <div className="text-sm">{current.example_sentence}</div>
                  <div className="text-xs text-muted-foreground">{current.example_translation}</div>
                </div>
              )}
              <button
                onClick={() => setIdx((i) => i + 1)}
                className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
              >
                次へ
              </button>
            </div>
          )}
        </article>
      ) : null}
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">今日復習する単語はありません。</p>
      <p className="mt-1 text-xs text-muted-foreground">新しい単語をキャッチすると、10分後に最初の復習が出ます。</p>
      <Link to="/capture" className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
        撮りに行く
      </Link>
    </div>
  );
}

function DoneState({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
      <p className="text-base font-semibold">今日の復習、完了！</p>
      <p className="mt-1 text-xs text-muted-foreground">AIが次の出題タイミングを調整しました。</p>
      <button onClick={onAgain} className="mt-4 rounded-full border border-border px-4 py-2 text-xs">
        もう一度チェック
      </button>
    </div>
  );
}
