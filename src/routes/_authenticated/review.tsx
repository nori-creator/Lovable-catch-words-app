import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  getDueReviews,
  gradeReview,
  getOverallMemoryStats,
  getSpeakingFeedback,
  type DueReviewCard,
  type SpeakingFeedback,
} from "@/lib/reviews.functions";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import {
  Eye,
  Sparkles,
  Check,
  X,
  Volume2,
  Brain,
  Mic,
  Square,
  Lightbulb,
  Loader2,
  Video,
  Repeat,
  ArrowRight,
  Clock,
  MapPin,
} from "lucide-react";

// ---- prefs -------------------------------------------------------------------
// Review mode (speaking/choice) lives in profiles.review_mode (DB) so it
// follows the user across devices. Video recording stays per-device
// (localStorage) since camera availability is a device property.
const VIDEO_KEY = "review-video-v1";
function readBool(key: string, def = false) {
  if (typeof window === "undefined") return def;
  const v = localStorage.getItem(key);
  return v == null ? def : v === "1";
}

// ---- speech helpers --------------------------------------------------------
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

// ---- POS color map ---------------------------------------------------------
const POS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  S: { bg: "bg-sky-100", text: "text-sky-900", label: "主語" },
  V: { bg: "bg-rose-100", text: "text-rose-900", label: "動詞" },
  O: { bg: "bg-emerald-100", text: "text-emerald-900", label: "目的語" },
  M: { bg: "bg-amber-100", text: "text-amber-900", label: "修飾" },
  C: { bg: "bg-violet-100", text: "text-violet-900", label: "接続" },
};

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "復習 — Catchwords" },
      { name: "description", content: "自分の写真を見て、その単語で一言。AIが添削と型を返します。" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const fetchDue = useServerFn(getDueReviews);
  const fetchStats = useServerFn(getOverallMemoryStats);
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateMyProfile);
  const qc = useQueryClient();
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

  const [idx, setIdx] = useState(0);
  // §6/§10-3: speaking is the default; 4択 stays as "light mode".
  // Stored in profiles.review_mode; the header toggle flips it optimistically.
  const lightMode =
    (profile as { review_mode?: string } | null | undefined)?.review_mode === "choice";
  function toggleLight() {
    const next = lightMode ? "speaking" : "choice";
    qc.setQueryData(["profile"], (old: unknown) =>
      old ? { ...(old as Record<string, unknown>), review_mode: next } : old,
    );
    void updateProfileFn({ data: { review_mode: next as "speaking" | "choice" } })
      .catch(() => {})
      .finally(() => qc.invalidateQueries({ queryKey: ["profile"] }));
  }

  const current: DueReviewCard | undefined = cards?.[idx];
  const done = cards && idx >= cards.length;

  const progress = useMemo(() => {
    if (!cards?.length) return 0;
    return Math.round((idx / cards.length) * 100);
  }, [cards, idx]);

  return (
    <AppShell title="復習">
      <section className="mb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">きょうの復習</h1>
          <div className="flex items-center gap-3">
            {cards && (
              <span className="text-xs text-muted-foreground">
                {Math.min(idx, cards.length)} / {cards.length}
              </span>
            )}
            <button
              onClick={toggleLight}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${lightMode ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
              title="声を出せない場所用の4択モード"
            >
              ライト {lightMode ? "ON" : "OFF"}
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {isLoading || isFetching ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">今日の出題を準備中…</p>
        </div>
      ) : !cards?.length ? (
        <EmptyState />
      ) : done ? (
        <DoneState onAgain={() => { setIdx(0); refetch(); }} />
      ) : current ? (
        lightMode ? (
          <LightModeCard
            key={current.review_id}
            card={current}
            onNext={() => setIdx((i) => i + 1)}
          />
        ) : (
          <SpeakingCard
            key={current.review_id}
            card={current}
            onNext={() => setIdx((i) => i + 1)}
          />
        )
      ) : null}

      {/* Memory graph lives BELOW the cards, collapsed — the first thing on
          this screen is always the review itself (no scrolling to start). */}
      {memStats && memStats.total_cards > 0 && (
        <details className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Brain className="h-4 w-4 text-primary" /> 記憶の状態
            </span>
            <span className="text-xs text-muted-foreground">
              平均 <span className="font-semibold text-foreground">{memStats.avg_retention}%</span> · 復習待ち {memStats.due_now}
            </span>
          </summary>
          <div className="mt-3">
            <MiniRetentionGraph series={memStats.series} />
          </div>
        </details>
      )}
    </AppShell>
  );
}

// ============================================================================
// Speaking-output card (§6)
// ============================================================================
function SpeakingCard({ card, onNext }: { card: DueReviewCard; onNext: () => void }) {
  const grade = useServerFn(gradeReview);
  const feedbackFn = useServerFn(getSpeakingFeedback);

  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState(false);
  const [round, setRound] = useState<1 | 2>(1);
  const [graded, setGraded] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const isPhrase = card.entry_type === "phrase";
  // Ghost cards (§5.3): the placeholder stands in until a real photo exists.
  const heroUrl = card.cutout_url ?? card.placeholder_url;
  const isGhostImage = !card.cutout_url && !!card.placeholder_url;
  const takenLabel = card.taken_at
    ? new Date(card.taken_at).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
    : null;

  useEffect(() => { setVideoOn(readBool(VIDEO_KEY, false)); }, []);
  useEffect(() => () => {
    stopVideo();
    recogRef.current?.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phrase roleplay (§5.2): the partner line IS the question — play it.
  useEffect(() => {
    if (!isPhrase) return;
    const t = setTimeout(() => playAudio(card), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.review_id]);

  async function startVideo() {
    if (!videoOn) return;
    try {
      // audio:true — without it every recording was silent. SpeechRecognition
      // and MediaRecorder can share the mic on all supported browsers.
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setVideoUrl(URL.createObjectURL(blob));
      };
      rec.start();
      recorderRef.current = rec;
    } catch { /* denied */ }
  }
  function stopVideo() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  function startListen() {
    if (listening) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setError("このブラウザは音声認識に非対応です。テキスト欄に直接入力してください。");
      return;
    }
    setError(null);
    const rec = new SR() as {
      lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void;
      onend: () => void; onerror: () => void; start: () => void; stop: () => void;
    };
    rec.lang = "cmn-Hant-TW";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i] as unknown as { 0: { transcript: string }; isFinal: boolean };
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onend = () => { setListening(false); stopVideo(); };
    rec.onerror = () => { setListening(false); stopVideo(); };
    recogRef.current = rec;
    startedAt.current = Date.now();
    setListening(true);
    startVideo();
    rec.start();
  }

  function stopListen() {
    recogRef.current?.stop();
    setListening(false);
    stopVideo();
  }

  function useHint() {
    setHintShown(true);
    playAudio(card);
  }

  async function submit() {
    if (!transcript.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const fb = await feedbackFn({
        data: { sticker_id: card.sticker_id, transcript: transcript.trim(), hint_used: hintShown },
      });
      setFeedback(fb);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AIフィードバックに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function commitAndNext(kind: "success" | "skip") {
    if (graded) { onNext(); return; }
    setGraded(true);
    // §6 3-level SRS: success=5 / hint=2 (失念) / skip・不成立=1.
    // "Success" additionally requires the AI's objective check (used the
    // target word, natural enough) — the honest-grading idea from main.
    const objectiveOk =
      !!feedback && feedback.used_target && feedback.natural_score >= 3;
    const result: "success" | "hint" | "skip" =
      kind === "skip" ? "skip" : hintShown ? "hint" : objectiveOk ? "success" : "skip";
    try {
      await grade({
        data: {
          review_id: card.review_id,
          correct: result === "success",
          blur_seen: hintShown,
          response_ms: Date.now() - startedAt.current,
          result,
        },
      });
    } catch { /* keep flow moving */ }
    onNext();
  }

  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          <Mic className="h-3.5 w-3.5" /> {isPhrase ? "ロールプレイ" : "はなす"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {isPhrase ? "この場面、どう返す?" : "この時のことを、単語を使って一文で"}
        </span>
      </div>

      {/* Photo — the word itself stays hidden until hint */}
      <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt="復習対象"
            className={`h-full w-full object-contain p-4 ${isGhostImage ? "opacity-70 grayscale" : ""}`}
          />
        ) : (
          <span className="text-5xl">📦</span>
        )}
        {isGhostImage && (
          <span className="absolute left-2 top-2 rounded-full bg-foreground/60 px-2 py-0.5 text-[10px] font-semibold text-background">
            👻 仮の画像
          </span>
        )}
      </div>

      {/* When & where the memory was made (§6-1: 場所・日時つき) */}
      {(takenLabel || card.location_name) && (
        <div className="mb-3 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
          {takenLabel && (
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {takenLabel}</span>
          )}
          {card.location_name && (
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {card.location_name}</span>
          )}
        </div>
      )}

      {/* Phrase cards: the scene is the front of the card (§5.2) */}
      {isPhrase && card.caption && (
        <p className="mb-3 rounded-xl bg-secondary/60 p-3 text-center text-sm">
          <span className="text-xs text-muted-foreground">シーン: </span>
          {card.caption}
        </p>
      )}

      {/* Hint reveal */}
      {hintShown && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
          <div className="text-xl font-bold">{card.headword}</div>
          <div className="text-xs text-muted-foreground">
            {card.reading_zhuyin} {card.pinyin && `· ${card.pinyin}`}
          </div>
          <button
            onClick={() => playAudio(card)}
            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-label="発音"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Video preview (opt-in) */}
      {videoOn && listening && (
        <video ref={videoRef} autoPlay muted playsInline className="mx-auto mb-3 h-24 w-24 rounded-full object-cover ring-2 ring-primary" />
      )}
      {videoUrl && !listening && (
        <video src={videoUrl} controls className="mx-auto mb-3 h-32 rounded-xl bg-black" />
      )}

      {/* Recording controls */}
      {!feedback && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={listening ? stopListen : startListen}
              disabled={loading}
              className={`lift flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-colors ${
                listening ? "bg-red-500 text-white shadow-red-500/30 animate-pulse" : "bg-primary text-primary-foreground shadow-primary/30"
              }`}
              aria-label={listening ? "停止" : "録音"}
            >
              {listening ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
            </button>
            <button
              onClick={useHint}
              disabled={hintShown || loading}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-2 text-[11px] ${hintShown ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-background text-muted-foreground hover:bg-accent/40"}`}
            >
              <Lightbulb className="h-5 w-5" />
              {hintShown ? "ヒント使用" : "ヒント"}
            </button>
          </div>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={listening ? "聞き取り中…" : "音声認識のミスはここで直せます（直接入力もOK）"}
            className="min-h-[72px] w-full resize-y rounded-2xl border border-border bg-background p-3 text-base"
            dir="auto"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!transcript.trim() || loading}
              className="lift flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> AIが添削中…</span>
              ) : (
                "送信してフィードバック"
              )}
            </button>
            <button
              onClick={() => commitAndNext("skip")}
              className="rounded-xl border border-border bg-background px-3 text-xs text-muted-foreground"
            >
              スキップ
            </button>
          </div>
        </div>
      )}

      {/* AI feedback */}
      {feedback && (
        <FeedbackView
          card={card}
          feedback={feedback}
          round={round}
          transcript={transcript}
          videoUrl={videoUrl}
          onRetry={() => {
            setRound(2);
            setFeedback(null);
            setTranscript("");
            setVideoUrl(null);
          }}
          onNext={() => commitAndNext("success")}
        />
      )}
    </article>
  );
}

function FeedbackView({
  card,
  feedback,
  round,
  transcript,
  videoUrl,
  onRetry,
  onNext,
}: {
  card: DueReviewCard;
  feedback: SpeakingFeedback;
  round: 1 | 2;
  transcript: string;
  videoUrl: string | null;
  onRetry: () => void;
  onNext: () => void;
}) {
  const goodTarget = feedback.used_target;
  const score = feedback.natural_score;
  return (
    <div className="mt-5 space-y-4">
      {/* Header verdict */}
      <div className={`rounded-2xl p-3 ${goodTarget && score >= 4 ? "bg-emerald-50 ring-1 ring-emerald-200" : goodTarget && score >= 3 ? "bg-amber-50 ring-1 ring-amber-200" : "bg-rose-50 ring-1 ring-rose-200"}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {goodTarget && score >= 4 ? "自然！" : goodTarget ? "通じるけど、もう一歩" : `「${card.headword}」を使ってみよう`}
          </span>
          <span className="text-xs text-muted-foreground">自然さ {score}/5</span>
        </div>
      </div>

      {/* Your recording — watch yourself say it (with sound) */}
      {videoUrl && (
        <div className="rounded-2xl bg-secondary/50 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            自分の発話を見返す
          </div>
          <video src={videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
        </div>
      )}

      {/* Your line vs corrected */}
      <div className="space-y-2 rounded-2xl bg-secondary/50 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">あなた</div>
        <div className="text-sm">{transcript}</div>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">添削</div>
        <div className="flex items-start gap-2">
          <div className="flex-1 text-base font-medium">{feedback.corrected}</div>
          <button
            onClick={() => speakZhTW(feedback.corrected)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-label="添削文を聞く"
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{feedback.correction_note}</p>
      </div>

      {/* Chunk = 型 with POS colors (+ word-tree unlock, §6) */}
      <div className="rounded-2xl bg-white p-3 ring-1 ring-border">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">型</span>
          {feedback.unlocked_branch && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              🌿 新しい枝が解禁
            </span>
          )}
          <span className="text-xs text-muted-foreground">{feedback.chunk_note}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {feedback.chunk.map((c, i) => {
            const st = POS_STYLE[c.pos] ?? POS_STYLE.M;
            return (
              <span key={i} className={`rounded-lg px-2 py-1 text-sm font-medium ${st.bg} ${st.text}`} title={st.label}>
                {c.text}
                <span className="ml-1 text-[9px] opacity-60">{c.pos}</span>
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          {Object.entries(POS_STYLE).map(([k, s]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${s.bg}`} />{k}={s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Native feel */}
      <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-200">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-900">ネイティブの気持ち</div>
        <p className="text-sm text-indigo-950">{feedback.native_note}</p>
      </div>

      {/* Model answers */}
      <div className="space-y-2 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900">お手本</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm">{feedback.model_answer}</div>
          <button onClick={() => speakZhTW(feedback.model_answer)} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-emerald-700" aria-label="お手本を聞く">
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm text-emerald-900/80">別の言い方: {feedback.alt_answer}</div>
          <button onClick={() => speakZhTW(feedback.alt_answer)} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-emerald-700" aria-label="別の言い方を聞く">
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {round === 1 && (
          <button
            onClick={onRetry}
            className="flex-1 rounded-xl border border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary"
          >
            <Repeat className="mr-1 inline h-4 w-4" /> 型を使ってもう一度
          </button>
        )}
        <button
          onClick={onNext}
          className="lift flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          次へ <ArrowRight className="ml-1 inline h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Light-mode: original 4-choice card (kept for silent situations)
// ============================================================================
function LightModeCard({ card, onNext }: { card: DueReviewCard; onNext: () => void }) {
  const grade = useServerFn(gradeReview);
  const [picked, setPicked] = useState<string | null>(null);
  const [showResult, setShowResult] = useState<{ correct: boolean; score: number } | null>(null);
  const startedAt = useRef<number>(Date.now());

  async function submit(correct: boolean, pickedValue: string) {
    if (picked) return;
    setPicked(pickedValue);
    const res = await grade({
      data: {
        review_id: card.review_id,
        correct,
        blur_seen: false,
        response_ms: Date.now() - startedAt.current,
      },
    });
    setShowResult({ correct, score: res.score });
    playAudio(card);
  }

  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-foreground">
          ライトモード（4択）
        </span>
        <span className="text-[11px] text-muted-foreground">意味を選ぼう</span>
      </div>
      <div className="relative mx-auto mb-4 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
        {card.cutout_url ?? card.placeholder_url ? (
          <img
            src={(card.cutout_url ?? card.placeholder_url)!}
            alt="復習対象"
            className={`h-full w-full object-contain p-4 ${!card.cutout_url ? "opacity-70 grayscale" : ""}`}
          />
        ) : (
          <span className="text-5xl">📦</span>
        )}
      </div>
      {picked && (
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="text-3xl font-bold tracking-tight">{card.headword}</div>
            <button
              onClick={() => playAudio(card)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"
              aria-label="発音"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {card.reading_zhuyin} {card.pinyin && `· ${card.pinyin}`}
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {card.choices.map((c) => {
          const isPicked = picked === c;
          const isCorrect = picked && c === card.meaning_ja;
          const wrong = isPicked && !showResult?.correct;
          return (
            <li key={c}>
              <button
                disabled={!!picked}
                onClick={() => submit(c === card.meaning_ja, c)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-all
                  ${!picked ? "border-border bg-background hover:border-primary/60 hover:bg-accent/40" : ""}
                  ${isCorrect ? "border-green-500/60 bg-green-500/10" : ""}
                  ${wrong ? "border-red-500/60 bg-red-500/10" : ""}
                  ${picked && !isPicked && c !== card.meaning_ja ? "opacity-50" : ""}`}
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
            <span className="text-sm font-semibold">{showResult.correct ? "正解！" : "もう一度覚えよう"}</span>
            <span className="text-xs text-muted-foreground">スコア {showResult.score}/5</span>
          </div>
          {card.example_sentence && (
            <div>
              <div className="text-sm">{card.example_sentence}</div>
              <div className="text-xs text-muted-foreground">{card.example_translation}</div>
            </div>
          )}
          <button
            onClick={onNext}
            className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            次へ
          </button>
        </div>
      )}
    </article>
  );
}

// ============================================================================
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
      <p className="text-sm font-medium">今日のノルマ、達成！</p>
      <p className="mt-1 text-xs text-muted-foreground">また明日の復習で会いましょう。</p>
      <button onClick={onAgain} className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
        もう一度出す
      </button>
      <div className="mt-2 text-[10px] text-muted-foreground">
        <Video className="mr-1 inline h-3 w-3" />
        設定で「録画」をONにすると、話した時の自撮り動画も残せます
      </div>
    </div>
  );
}
