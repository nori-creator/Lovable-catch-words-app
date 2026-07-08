import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Lightbulb, Loader2, MapPin, Mic, Send, Sparkles, Square, Volume2 } from "lucide-react";
import { gradeReview, type DueReviewCard } from "@/lib/reviews.functions";
import { getSpeakingFeedback, type SpeakingFeedback, type PatternPart } from "@/lib/speaking.functions";

/**
 * Speaking-output review (spec §6): look at YOUR photo, say one sentence
 * with the word. The word itself is hidden until the hint is used.
 *
 *   ask(record/type) → submit → feedback (correction + pattern + model)
 *                    → hint   → same flow, graded as a lapse
 *                    → skip   → answer reveal, graded as a failure
 */

type Phase = "ask" | "feedback" | "reveal";

function speechRecognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

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
function playCardAudio(card: DueReviewCard) {
  if (card.audio_url) {
    if (!sharedAudio) sharedAudio = new Audio();
    sharedAudio.src = card.audio_url;
    sharedAudio.play().catch(() => speakZhTW(card.headword));
  } else {
    speakZhTW(card.headword);
  }
}

const ROLE_STYLE: Record<PatternPart["role"], string> = {
  S: "bg-sky-100 text-sky-900 ring-sky-200",
  V: "bg-rose-100 text-rose-900 ring-rose-200",
  O: "bg-amber-100 text-amber-900 ring-amber-200",
  M: "bg-violet-100 text-violet-900 ring-violet-200",
};

const ROLE_LABEL: Record<PatternPart["role"], string> = {
  S: "主語",
  V: "動詞",
  O: "目的語",
  M: "修飾",
};

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

export function SpeakingReviewCard({
  card,
  onFinished,
}: {
  card: DueReviewCard;
  onFinished: () => void;
}) {
  const grade = useServerFn(gradeReview);
  const feedbackFn = useServerFn(getSpeakingFeedback);

  const [phase, setPhase] = useState<Phase>("ask");
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [retryHeard, setRetryHeard] = useState<string | null>(null);
  const recogRef = useRef<SR | null>(null);
  const startedAt = useRef<number>(Date.now());
  const canSpeak = speechRecognitionAvailable();
  const isPhrase = card.entry_type === "phrase";

  // Reset for each new card.
  useEffect(() => {
    setPhase("ask");
    setTranscript("");
    setListening(false);
    setHintUsed(false);
    setSubmitting(false);
    setFeedback(null);
    setFeedbackError(null);
    setRetryHeard(null);
    startedAt.current = Date.now();
    recogRef.current?.stop();
    // Phrase roleplay (§5.2): the partner line is the question — play it.
    if (card.entry_type === "phrase") {
      const t = setTimeout(() => playCardAudio(card), 400);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.review_id]);

  function startRecognition(onText: (t: string) => void) {
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor() as SR;
    rec.lang = "cmn-Hant-TW";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec;
    setListening(true);
    rec.start();
  }

  function toggleRecord() {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    startRecognition((t) => setTranscript(t));
  }

  async function submit() {
    const text = transcript.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setPhase("feedback");
    const result = hintUsed ? ("hint" as const) : ("success" as const);
    // 添削と採点は並行(§6実装ノート: レイテンシを直列で重ねない)
    void grade({
      data: {
        review_id: card.review_id,
        correct: !hintUsed,
        blur_seen: hintUsed,
        response_ms: Date.now() - startedAt.current,
        result,
      },
    }).catch(() => {});
    try {
      const fb = await feedbackFn({
        data: {
          sticker_id: card.sticker_id,
          transcript: text,
          hint_used: hintUsed,
          input_kind: canSpeak ? "voice" : "text",
        },
      });
      setFeedback(fb);
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : "フィードバックの取得に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  function useHint() {
    if (!hintUsed) setHintUsed(true);
    playCardAudio(card);
  }

  async function skip() {
    if (submitting) return;
    setPhase("reveal");
    void grade({
      data: {
        review_id: card.review_id,
        correct: false,
        response_ms: Date.now() - startedAt.current,
        result: "skip",
      },
    }).catch(() => {});
    playCardAudio(card);
  }

  const heroUrl = card.cutout_url;
  const takenLabel = card.taken_at
    ? new Date(card.taken_at).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
    : null;

  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          <Mic className="h-3.5 w-3.5" /> {isPhrase ? "ロールプレイ" : "はなす"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {isPhrase ? "この場面、どう返す?" : "この時の経験を一文で"}
        </span>
      </div>

      {/* Your photo — the word stays hidden (§6-1) */}
      <div className="relative mx-auto mb-3 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
        {heroUrl ? (
          <img src={heroUrl} alt="復習対象の写真" className="h-full w-full object-contain p-4" />
        ) : (
          <span className="text-5xl">📦</span>
        )}
      </div>
      <div className="mb-3 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
        {takenLabel && (
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {takenLabel}</span>
        )}
        {card.location_name && (
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {card.location_name}</span>
        )}
      </div>

      {isPhrase && card.caption && (
        <p className="mb-3 rounded-xl bg-secondary/60 p-3 text-center text-sm">
          <span className="text-xs text-muted-foreground">シーン: </span>
          {card.caption}
        </p>
      )}

      {phase === "ask" && (
        <>
          <p className="mb-3 text-center text-sm font-medium">
            {isPhrase
              ? "音声を聞いて、あなたなら何と返すか言ってみよう"
              : "この時のことを、この単語を使って一文で話してみて"}
          </p>

          {hintUsed && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
              <div className="inline-flex items-center gap-2">
                <span className="text-xl font-bold">{card.headword}</span>
                <button
                  onClick={() => playCardAudio(card)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary"
                  aria-label="発音を聞く"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {card.reading_zhuyin} {card.pinyin && `· ${card.pinyin}`}
              </div>
            </div>
          )}

          {canSpeak && (
            <button
              onClick={toggleRecord}
              className={`lift mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-colors ${
                listening ? "bg-red-500 text-white shadow-red-500/30" : "bg-primary text-primary-foreground shadow-primary/30"
              }`}
              aria-label={listening ? "停止" : "話す"}
            >
              {listening ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
            </button>
          )}
          <p className="mb-2 text-center text-xs text-muted-foreground">
            {canSpeak
              ? listening
                ? "聞き取り中… 台湾華語で話そう"
                : "マイクをタップして話す(下の欄で修正できます)"
              : "このブラウザは音声認識に未対応です。文で書いてみよう"}
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={2}
            placeholder={canSpeak ? "認識結果がここに入ります" : "例: 我在夜市買了芒果"}
            className="mb-3 w-full resize-none rounded-xl border border-border bg-secondary/50 p-3 text-base outline-none focus:ring-2 focus:ring-primary/40"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={useHint}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground active:scale-95"
            >
              <Lightbulb className="h-4 w-4 text-amber-500" />
              ヒント{!hintUsed && <span className="text-[10px]">(失念扱い)</span>}
            </button>
            <button
              onClick={submit}
              disabled={!transcript.trim() || submitting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 active:scale-95 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> 送信
            </button>
          </div>
          <button onClick={skip} className="mx-auto mt-3 block text-[11px] text-muted-foreground underline">
            言えなかった（スキップ）
          </button>
        </>
      )}

      {phase === "reveal" && (
        <div className="rounded-2xl bg-secondary/60 p-4 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold">{card.headword}</span>
            <button
              onClick={() => playCardAudio(card)}
              className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary"
              aria-label="発音を聞く"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {card.reading_zhuyin} {card.pinyin && `· ${card.pinyin}`}
          </div>
          <p className="mt-2 text-base font-medium">{card.meaning_ja}</p>
          {card.example_sentence && (
            <p className="mt-2 text-sm">
              {card.example_sentence}
              <span className="block text-xs text-muted-foreground">{card.example_translation}</span>
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">明日もう一度出題します。</p>
          <button
            onClick={onFinished}
            className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            次へ
          </button>
        </div>
      )}

      {phase === "feedback" && (
        <FeedbackPanel
          transcript={transcript}
          feedback={feedback}
          error={feedbackError}
          hintUsed={hintUsed}
          retryHeard={retryHeard}
          onRetryRecord={() => startRecognition((t) => setRetryHeard(t))}
          listening={listening}
          canSpeak={canSpeak}
          onStopRecord={() => recogRef.current?.stop()}
          onFinished={onFinished}
        />
      )}
    </article>
  );
}

function FeedbackPanel({
  transcript,
  feedback,
  error,
  hintUsed,
  retryHeard,
  listening,
  canSpeak,
  onRetryRecord,
  onStopRecord,
  onFinished,
}: {
  transcript: string;
  feedback: SpeakingFeedback | null;
  error: string | null;
  hintUsed: boolean;
  retryHeard: string | null;
  listening: boolean;
  canSpeak: boolean;
  onRetryRecord: () => void;
  onStopRecord: () => void;
  onFinished: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-secondary/60 p-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">あなたの発話</div>
        <p className="mt-1 text-base">{transcript}</p>
        {hintUsed && <p className="mt-1 text-[11px] text-amber-600">ヒント使用 → SRSは「失念」として記録</p>}
      </div>

      {!feedback && !error && (
        <div className="space-y-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-xs text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> ネイティブコーチが添削中…
          </div>
          <div className="h-3 w-3/4 animate-pulse rounded bg-primary/10" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-primary/10" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button onClick={onFinished} className="mt-2 block w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
            次へ
          </button>
        </div>
      )}

      {feedback && (
        <>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">添削</div>
            <p className="mt-1 text-lg font-semibold">{feedback.correction}</p>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-emerald-900/80">{feedback.feedback_ja}</p>
          </div>

          {feedback.pattern.chunk_zh && (
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-primary">
                <Sparkles className="h-3 w-3" />
                今日の型
                {feedback.unlocked_branch && (
                  <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
                    🌿 新しい枝が解禁
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-lg font-semibold">{feedback.pattern.chunk_zh}</p>
              <p className="text-xs text-muted-foreground">{feedback.pattern.chunk_ja}</p>
              {feedback.pattern.parts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {feedback.pattern.parts.map((p, i) => (
                    <span key={i} className={`rounded-lg px-2 py-1 text-sm font-medium ring-1 ${ROLE_STYLE[p.role]}`}>
                      {p.text}
                      <span className="ml-1 text-[9px] opacity-70">{ROLE_LABEL[p.role]}</span>
                    </span>
                  ))}
                </div>
              )}
              {feedback.native_feeling && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">💭 {feedback.native_feeling}</p>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-secondary/60 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">お手本</div>
            <p className="mt-1 text-base font-medium">{feedback.model_answer}</p>
            {feedback.alternative && (
              <p className="mt-1 text-sm text-muted-foreground">別の言い方: {feedback.alternative}</p>
            )}
            <button
              onClick={() => speakZhTW(feedback.model_answer)}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              <Volume2 className="h-3.5 w-3.5" /> お手本を聞く
            </button>
          </div>

          {canSpeak && (
            <div className="rounded-2xl border border-dashed border-border p-3 text-center">
              <p className="mb-2 text-xs text-muted-foreground">型を使ってもう一度言ってみる(任意)</p>
              <button
                onClick={listening ? onStopRecord : onRetryRecord}
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full shadow ${
                  listening ? "bg-red-500 text-white" : "bg-secondary text-foreground"
                }`}
                aria-label={listening ? "停止" : "もう一度言う"}
              >
                {listening ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              {retryHeard && <p className="mt-2 text-sm">🗣 {retryHeard}</p>}
            </div>
          )}

          <button
            onClick={onFinished}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            次へ
          </button>
        </>
      )}
    </div>
  );
}
