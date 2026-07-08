import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SpeakingReviewCard } from "@/components/SpeakingReviewCard";
import { getDueReviews, gradeReview, getOverallMemoryStats, type DueReviewCard, type ReviewMode } from "@/lib/reviews.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { Eye, Sparkles, Check, X, Volume2, Brain, Mic, Ear, MessageSquareText, Square } from "lucide-react";

function speakZhTW(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const v =
    voices.find((vo) => /zh-TW|zh-Hant|cmn-Hant/i.test(vo.lang)) ??
    voices.find((vo) => /^zh/i.test(vo.lang));
  if (v) u.voice = v;
  u.lang = v?.lang ?? "zh-TW";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

let sharedAudio: HTMLAudioElement | null = null;
function playAudio(card: DueReviewCard) {
  if (card.audio_url) {
    if (!sharedAudio) sharedAudio = new Audio();
    sharedAudio.src = card.audio_url;
    sharedAudio.play().catch(() => speakZhTW(card.headword));
  } else {
    speakZhTW(card.headword);
  }
}

function speechRecognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

const MODE_META: Record<ReviewMode, { label: string; hint: string; icon: typeof Eye }> = {
  recognition: { label: "みる", hint: "写真と単語から意味を選ぼう", icon: Eye },
  listening: { label: "きく", hint: "音だけを聞いて意味を選ぼう", icon: Ear },
  reverse: { label: "おもいだす", hint: "意味から単語を選ぼう", icon: MessageSquareText },
  production: { label: "はなす", hint: "写真を見て、声に出して言おう", icon: Mic },
};

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
  const fetchStats = useServerFn(getOverallMemoryStats);
  const fetchProfile = useServerFn(getMyProfile);
  const { data: cards, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["reviews-due"],
    queryFn: () => fetchDue(),
    staleTime: 0,
  });
  const { data: memStats } = useQuery({
    queryKey: ["memory-stats"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });
  // §6/§10-3: speaking-output review is the default; the classic quiz
  // remains as "light mode" (choice) selectable in settings.
  const speakingMode =
    (profile as { review_mode?: string } | null | undefined)?.review_mode !== "choice";

  const [idx, setIdx] = useState(0);
  const [blurSeen, setBlurSeen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [showResult, setShowResult] = useState<{ correct: boolean; score: number } | null>(null);
  const startedAt = useRef<number>(Date.now());

  const current: DueReviewCard | undefined = cards?.[idx];
  const done = cards && idx >= cards.length;

  // Production needs speech recognition; degrade to reverse without it.
  const mode: ReviewMode | undefined = useMemo(() => {
    if (!current) return undefined;
    if (current.mode === "production" && !speechRecognitionAvailable()) return "reverse";
    return current.mode;
  }, [current]);

  useEffect(() => {
    startedAt.current = Date.now();
    setBlurSeen(false);
    setPicked(null);
    setShowResult(null);
  }, [idx]);

  // Listening mode: the audio IS the question, so it plays automatically.
  // (Choice mode only — in speaking mode the word must stay hidden, §6-1.)
  useEffect(() => {
    if (speakingMode || !current || mode !== "listening" || picked) return;
    const t = setTimeout(() => playAudio(current), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.review_id, mode, speakingMode]);

  async function submit(correct: boolean, pickedValue: string) {
    if (!current || picked) return;
    setPicked(pickedValue);
    const res = await grade({
      data: {
        review_id: current.review_id,
        correct,
        blur_seen: blurSeen,
        response_ms: Date.now() - startedAt.current,
      },
    });
    setShowResult({ correct, score: res.score });
    if (mode !== "listening") playAudio(current); // reinforce with native audio on reveal
  }

  const progress = useMemo(() => {
    if (!cards?.length) return 0;
    return Math.round((idx / cards.length) * 100);
  }, [cards, idx]);

  const meta = mode ? MODE_META[mode] : null;

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

      {memStats && memStats.total_cards > 0 && (
        <section className="mb-5 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">記憶の状態</h2>
            </div>
            <div className="text-xs text-muted-foreground">
              平均 <span className="font-semibold text-foreground">{memStats.avg_retention}%</span> · 復習待ち {memStats.due_now}
            </div>
          </div>
          <MiniRetentionGraph series={memStats.series} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            点線（80%）を下回ったら復習タイミング。今日復習すると曲線がリセットされます。
          </p>
        </section>
      )}

      {isLoading || isFetching ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">今日の出題を準備中…</p>
        </div>
      ) : !cards?.length ? (
        <EmptyState />
      ) : done ? (
        <DoneState onAgain={() => { setIdx(0); refetch(); }} />
      ) : current && speakingMode ? (
        <SpeakingReviewCard card={current} onFinished={() => setIdx((i) => i + 1)} />
      ) : current && mode && meta ? (
        <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
              <meta.icon className="h-3.5 w-3.5" /> {meta.label}
            </span>
            <span className="text-[11px] text-muted-foreground">{meta.hint}</span>
          </div>

          {/* --- Question area, varies by mode --- */}
          {mode === "listening" && !picked ? (
            <div className="mx-auto mb-4 grid aspect-square w-full max-w-xs place-items-center rounded-2xl bg-secondary">
              <button
                onClick={() => playAudio(current)}
                className="lift grid h-24 w-24 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30"
                aria-label="もう一度聞く"
              >
                <Volume2 className="h-10 w-10" />
              </button>
            </div>
          ) : (
            <div className="relative mx-auto mb-4 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
              {current.cutout_url ? (
                <img
                  src={current.cutout_url}
                  alt="復習対象"
                  className={`h-full w-full object-contain p-4 transition-[filter] duration-300 ${
                    mode !== "recognition" || blurSeen || picked ? "blur-0" : "blur-md scale-105"
                  }`}
                />
              ) : (
                <span className="text-5xl">📦</span>
              )}
              {mode === "recognition" && !picked && (
                <button
                  onClick={() => setBlurSeen(true)}
                  className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur hover:bg-background"
                >
                  <Eye className="h-3 w-3" /> ぼかしを剥がす{blurSeen && "（-1点）"}
                </button>
              )}
            </div>
          )}

          <div className="mb-4 text-center">
            {(mode === "recognition" || ((mode === "listening" || mode === "production") && picked)) && (
              <div className="inline-flex items-center gap-2">
                <div className="text-3xl font-bold tracking-tight">{current.headword}</div>
                <button
                  type="button"
                  onClick={() => playAudio(current)}
                  className="lift inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"
                  aria-label="発音を聞く"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
            )}
            {(mode === "reverse" || mode === "production") && (
              <div className="text-2xl font-bold tracking-tight">{current.meaning_ja}</div>
            )}
            {(mode === "recognition" || !!picked) && (
              <div className="mt-1 text-xs text-muted-foreground">
                {current.reading_zhuyin} {current.pinyin && `· ${current.pinyin}`}
              </div>
            )}
          </div>

          {/* --- Answer area --- */}
          {mode === "production" ? (
            <ProductionAnswer
              card={current}
              disabled={!!picked}
              onResult={(correct, heard) => submit(correct, heard || "(音声)")}
            />
          ) : (
            <ul className="space-y-2">
              {(mode === "reverse" ? current.headword_choices : current.choices).map((c) => {
                const correctValue = mode === "reverse" ? current.headword : current.meaning_ja;
                const isPicked = picked === c;
                const isCorrect = picked && c === correctValue;
                const wrong = isPicked && !showResult?.correct;
                return (
                  <li key={c}>
                    <button
                      disabled={!!picked}
                      onClick={() => submit(c === correctValue, c)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-all
                        ${!picked ? "border-border bg-background hover:border-primary/60 hover:bg-accent/40" : ""}
                        ${isCorrect ? "border-green-500/60 bg-green-500/10" : ""}
                        ${wrong ? "border-red-500/60 bg-red-500/10" : ""}
                        ${picked && !isPicked && c !== correctValue ? "opacity-50" : ""}`}
                    >
                      <span>{c}</span>
                      {isCorrect && <Check className="h-4 w-4 text-green-600" />}
                      {wrong && <X className="h-4 w-4 text-red-600" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

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

/**
 * Production stage: say the word out loud. Uses the Web Speech API; the page
 * only renders this when recognition is available (otherwise the card falls
 * back to reverse mode).
 */
function ProductionAnswer({
  card,
  disabled,
  onResult,
}: {
  card: DueReviewCard;
  disabled: boolean;
  onResult: (correct: boolean, heard: string | null) => void;
}) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const recogRef = useRef<{ stop: () => void } | null>(null);

  function start() {
    if (disabled || listening) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = "cmn-Hant-TW";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.continuous = false;
    rec.onresult = (e) => {
      const alternatives: string[] = [];
      const result = e.results[0];
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript.trim());
      const text = alternatives[0] ?? "";
      setHeard(text);
      const ok = alternatives.some((a) => a.includes(card.headword) || card.headword.includes(a));
      onResult(ok, text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec;
    setHeard(null);
    setListening(true);
    rec.start();
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => (listening ? recogRef.current?.stop() : start())}
        disabled={disabled}
        className={`lift mx-auto flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-colors ${
          listening ? "bg-red-500 text-white shadow-red-500/30" : "bg-primary text-primary-foreground shadow-primary/30"
        } ${disabled ? "opacity-50" : ""}`}
        aria-label={listening ? "停止" : "発音する"}
      >
        {listening ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        {listening ? "聞き取り中… 台湾華語で言ってみよう" : heard ? `聞こえた: ${heard}` : "マイクをタップして発音"}
      </p>
      {!disabled && (
        <button
          onClick={() => onResult(false, null)}
          className="mx-auto block text-[11px] text-muted-foreground underline"
        >
          言えなかった（スキップ）
        </button>
      )}
    </div>
  );
}

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";

function MiniRetentionGraph({ series }: { series: Array<{ day_offset: number; avg_retention: number }> }) {
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day_offset" tickFormatter={(v) => (v === 0 ? "今日" : `${v > 0 ? "+" : ""}${v}d`)} stroke="hsl(var(--muted-foreground))" fontSize={10} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="hsl(var(--muted-foreground))" fontSize={10} />
          <Tooltip
            formatter={(v: number) => [`${v}%`, "平均記憶率"]}
            labelFormatter={(l) => (l === 0 ? "今日" : `${l > 0 ? "+" : ""}${l}日`)}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
          />
          <ReferenceLine x={0} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
          <ReferenceLine y={80} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" />
          <Line type="monotone" dataKey="avg_retention" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
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
