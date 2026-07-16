import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { claimAudio, stopOtherAudio } from "@/lib/audio";
import {
  getDueReviews,
  gradeReview,
  getOverallMemoryStats,
  getMemoryOverview,
  getStickerMemoryHistory,
  getSpeakingFeedback,
  getSpeakingScaffold,
  type DueReviewCard,
  type SpeakingFeedback,
  type MemoryWord,
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
  stopOtherAudio();
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
    claimAudio(sharedAudio);
    sharedAudio.src = card.audio_url;
    sharedAudio.play().catch(() => speakZhTW(card.headword));
  } else {
    speakZhTW(card.headword);
  }
}

/** A3: 任意のテキスト/音声URLを排他再生(4択の選択肢🔊用)。 */
function playText(text: string, audioUrl?: string | null) {
  if (audioUrl) {
    if (!sharedAudio) sharedAudio = new Audio();
    claimAudio(sharedAudio);
    sharedAudio.src = audioUrl;
    sharedAudio.play().catch(() => speakZhTW(text));
  } else {
    speakZhTW(text);
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
  const fetchMemOverview = useServerFn(getMemoryOverview);
  const { data: memOverview } = useQuery({
    queryKey: ["memory-overview"],
    queryFn: () => fetchMemOverview(),
    staleTime: 60_000,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });

  const [idx, setIdx] = useState(0);
  const [memModal, setMemModal] = useState<MemoryWord | null>(null);
  // §6/§10-3: speaking is the default; 4択 stays as "light mode".
  // Stored in profiles.review_mode; the header toggle flips it optimistically.
  const lightMode =
    (profile as { review_mode?: string } | null | undefined)?.review_mode === "choice";
  function setMode(next: "speaking" | "choice") {
    if ((lightMode ? "choice" : "speaking") === next) return;
    qc.setQueryData(["profile"], (old: unknown) =>
      old ? { ...(old as Record<string, unknown>), review_mode: next } : old,
    );
    void updateProfileFn({ data: { review_mode: next } })
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
            <div
              className="relative flex rounded-full border border-border bg-secondary p-0.5 text-[11px] font-semibold"
              role="tablist"
              aria-label="復習モード"
            >
              <span
                aria-hidden
                className={`absolute inset-y-0.5 w-1/2 rounded-full bg-background shadow transition-transform duration-200 ${lightMode ? "translate-x-full" : "translate-x-0"}`}
              />
              <button
                role="tab"
                aria-selected={!lightMode}
                onClick={() => setMode("speaking")}
                className={`relative z-10 w-[4.5rem] rounded-full py-1 text-center transition-colors ${!lightMode ? "text-foreground" : "text-muted-foreground"}`}
              >
                🎤 発音
              </button>
              <button
                role="tab"
                aria-selected={lightMode}
                onClick={() => setMode("choice")}
                title="声を出せない場所用の4択モード"
                className={`relative z-10 w-[4.5rem] rounded-full py-1 text-center transition-colors ${lightMode ? "text-foreground" : "text-muted-foreground"}`}
              >
                👆 4択
              </button>
            </div>
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

      {/* Memory state lives BELOW the cards, collapsed — the first thing on
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
          {memOverview && (
            <MemoryOverviewPanel overview={memOverview} onOpenWord={(w) => setMemModal(w)} />
          )}
          <div className="mt-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              全体の記憶率(前後2週間)
            </p>
            <MiniRetentionGraph series={memStats.series} />
          </div>
        </details>
      )}

      {memModal && <ForgettingCurveModal word={memModal} onClose={() => setMemModal(null)} />}
    </AppShell>
  );
}

// ---- B5 記憶ビジュアライズ --------------------------------------------------
function retColor(retention: number): { bar: string; text: string; dot: string } {
  if (retention < 50) return { bar: "bg-red-500", text: "text-red-600", dot: "🔴" };
  if (retention <= 80) return { bar: "bg-amber-500", text: "text-amber-600", dot: "🟡" };
  return { bar: "bg-emerald-500", text: "text-emerald-600", dot: "🟢" };
}

function MemoryOverviewPanel({
  overview,
  onOpenWord,
}: {
  overview: { danger: number; fuzzy: number; solid: number; words: MemoryWord[] };
  onOpenWord: (w: MemoryWord) => void;
}) {
  const total = overview.danger + overview.fuzzy + overview.solid;
  if (total === 0) return null;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="mt-3">
      {/* 信号色サマリー */}
      <div className="flex gap-3 text-xs">
        <span className="text-red-600">🔴 危険 <b>{overview.danger}</b></span>
        <span className="text-amber-600">🟡 うろ覚え <b>{overview.fuzzy}</b></span>
        <span className="text-emerald-600">🟢 定着 <b>{overview.solid}</b></span>
      </div>
      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="bg-red-500" style={{ width: `${pct(overview.danger)}%` }} />
        <div className="bg-amber-500" style={{ width: `${pct(overview.fuzzy)}%` }} />
        <div className="bg-emerald-500" style={{ width: `${pct(overview.solid)}%` }} />
      </div>

      {/* 危険な語から順に(タップで忘却曲線) */}
      <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
        {overview.words.slice(0, 40).map((w) => {
          const c = retColor(w.retention);
          return (
            <li key={w.sticker_id}>
              <button
                onClick={() => onOpenWord(w)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary/60"
              >
                <span className="w-14 shrink-0 truncate text-sm font-medium">{w.headword}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span className={`absolute inset-y-0 left-0 ${c.bar}`} style={{ width: `${w.retention}%` }} />
                </span>
                <span className={`w-9 shrink-0 text-right text-[11px] font-semibold ${c.text}`}>{w.retention}%</span>
                {w.fresh ? (
                  <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] text-sky-700">覚えたて</span>
                ) : w.long_term ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] text-emerald-700">長期定着</span>
                ) : (
                  <span className="w-[3.5rem] shrink-0" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ForgettingCurveModal({ word, onClose }: { word: MemoryWord; onClose: () => void }) {
  const histFn = useServerFn(getStickerMemoryHistory);
  const { data } = useQuery({
    queryKey: ["sticker-memory", word.sticker_id],
    queryFn: () => histFn({ data: { sticker_id: word.sticker_id } }),
    staleTime: 60_000,
  });
  const c = retColor(word.retention);
  // 現在→将来の忘却曲線(既存式で30日先まで)。
  const series = useMemo(() => {
    const cur = data?.current;
    if (!cur?.last_reviewed_at) return [] as Array<{ day_offset: number; avg_retention: number }>;
    const lastMs = new Date(cur.last_reviewed_at).getTime();
    const stability = Math.max(0.5, cur.interval_days * Math.max(1, cur.ease));
    const now = Date.now();
    const out: Array<{ day_offset: number; avg_retention: number }> = [];
    for (let d = 0; d <= 30; d++) {
      const at = now + d * 86400_000;
      const dt = (at - lastMs) / 86400_000;
      out.push({ day_offset: d, avg_retention: Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-dt / stability)))) });
    }
    return out;
  }, [data]);
  const dueLabel = word.due_at
    ? new Date(word.due_at).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
    : "—";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-bold">{word.headword}</h3>
          <button onClick={onClose} aria-label="閉じる" className="rounded-full p-1 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className={c.text}>{c.dot} 記憶率 <b>{word.retention}%</b></span>
          <span className="text-muted-foreground">次の復習: <b className="text-foreground">{dueLabel}</b></span>
          {word.days_until_forgot != null && (
            <span className="text-muted-foreground">
              あと <b className={word.days_until_forgot <= 2 ? "text-red-600" : "text-foreground"}>{word.days_until_forgot}日</b> で忘却ライン(50%)
            </span>
          )}
        </div>
        {series.length > 0 ? (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day_offset" tickFormatter={(v) => (v === 0 ? "今日" : `+${v}d`)} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip formatter={(v: number) => [`${v}%`, "記憶率"]} labelFormatter={(l) => (l === 0 ? "今日" : `${l}日後`)} />
                <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="avg_retention" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">まだ復習履歴がありません。</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {word.long_term
            ? "長期記憶に入りつつあります。間隔をあけて思い出すほど定着します。"
            : word.fresh
              ? "覚えたてです。数日以内にもう一度会うと記憶が固定されます。"
              : "赤い線(50%)を切る前に復習すると、少ない回数で長く覚えられます。"}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Speaking-output card (§6)
// ============================================================================
function SpeakingCard({ card, onNext }: { card: DueReviewCard; onNext: () => void }) {
  const grade = useServerFn(gradeReview);
  const feedbackFn = useServerFn(getSpeakingFeedback);
  const scaffoldFn = useServerFn(getSpeakingScaffold);

  // B4: 「白紙で話して」を避ける足場。写真の下にAIの質問+組み立てパーツを出す。
  // フレーズカードはロールプレイなので対象外。lazyに取得し失敗は無視。
  const { data: scaffold } = useQuery({
    queryKey: ["speaking-scaffold", card.sticker_id],
    queryFn: () => scaffoldFn({ data: { sticker_id: card.sticker_id } }),
    enabled: card.entry_type !== "phrase",
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

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

      {/* 今日の型 (§6/B7): ゼロから例文を作るのは難しい — ネイティブがよく
          使う型を1つ指定して、その型で言わせる。単語部分は伏せ字にして
          思い出す練習は守る。ヒント後は全体を表示。 */}
      {!isPhrase && card.prompt_pattern && (
        <div className="mb-3 rounded-xl bg-primary/5 p-3 text-center ring-1 ring-primary/15">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">今日の型</div>
          <div className="mt-1 text-lg font-bold tracking-wide">
            {hintShown
              ? card.prompt_pattern.zh
              : card.prompt_pattern.zh.split(card.headword).join("◯".repeat(Math.max(1, card.headword.length)))}
          </div>
          {card.prompt_pattern.ja && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">{card.prompt_pattern.ja}</div>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">この型を入れて一文話してみよう</div>
        </div>
      )}

      {/* B4 足場: 先生からの質問 + 組み立てパーツ(MTC式)。真っ白から作らず、
          パーツを組み合わせて質問に答える。 */}
      {!isPhrase && scaffold && !feedback && (
        <div className="mb-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800">先生の質問</div>
          <div className="mt-0.5 flex items-start gap-2">
            <p className="flex-1 text-sm font-semibold text-sky-950">{scaffold.question_zh}</p>
            <button
              onClick={() => playText(scaffold.question_zh)}
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-700"
              aria-label="質問を読み上げ"
            >
              <Volume2 className="h-3 w-3" />
            </button>
          </div>
          <p className="text-[11px] text-sky-800/80">{scaffold.question_ja}</p>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-sky-800">使えるパーツ</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {scaffold.parts.map((p, i) => (
              <button
                key={i}
                onClick={() => playText(p.zh)}
                className="rounded-full bg-white px-2.5 py-1 text-left text-[12px] shadow-sm ring-1 ring-sky-200 active:scale-95"
                title="タップで発音"
              >
                <span className="font-medium">{p.zh}</span>
                <span className="ml-1 text-[10px] text-muted-foreground">{p.ja}</span>
              </button>
            ))}
          </div>
          {scaffold.caption_seed && (
            <p className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] text-sky-900/80">
              💭 あなたのメモ:「{scaffold.caption_seed}」— この気持ちも混ぜてみよう
            </p>
          )}
        </div>
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
  const [score, setScore] = useState<number | null>(null);
  const startedAt = useRef<number>(Date.now());
  // 正誤はクライアントで即時判定する。以前はサーバー応答を待つ間
  // `!showResult?.correct` が true になり、正解タップでも一瞬❌が出ていた。
  const correct = picked != null && picked === card.headword;

  function submit(pickedValue: string) {
    if (picked) return;
    setPicked(pickedValue);
    playAudio(card);
    void grade({
      data: {
        review_id: card.review_id,
        correct: pickedValue === card.headword,
        blur_seen: false,
        response_ms: Date.now() - startedAt.current,
      },
    })
      .then((res) => setScore(res.score))
      .catch(() => {});
  }

  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-foreground">
          4択クイズ
        </span>
        <span className="text-[11px] text-muted-foreground">台湾華語を選ぼう</span>
      </div>
      <div className="relative mx-auto mb-3 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
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
      <div className="mb-4 text-center text-base font-semibold">
        「{card.meaning_ja}」はどれ？
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
        {card.headword_choices.map((c) => {
          const isAnswer = c === card.headword;
          const isPicked = picked === c;
          const showGreen = picked != null && isAnswer;
          const showRed = isPicked && !isAnswer;
          return (
            <li key={c} className="flex items-stretch gap-2">
              <button
                disabled={!!picked}
                onClick={() => submit(c)}
                className={`flex min-w-0 flex-1 items-center justify-between rounded-xl border px-4 py-3 text-left text-base transition-all
                  ${!picked ? "border-border bg-background hover:border-primary/60 hover:bg-accent/40" : ""}
                  ${showGreen ? "border-green-500/60 bg-green-500/10" : ""}
                  ${showRed ? "border-red-500/60 bg-red-500/10" : ""}
                  ${picked && !isPicked && !isAnswer ? "opacity-50" : ""}`}
              >
                <span className="truncate font-medium">{c}</span>
                {showGreen && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                {showRed && <X className="h-4 w-4 shrink-0 text-red-600" />}
              </button>
              <button
                onClick={() => playText(c, isAnswer ? card.audio_url : null)}
                className="inline-flex w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground active:scale-95"
                aria-label={`${c}の発音`}
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {picked && (
        <div className="mt-5 rounded-2xl bg-secondary/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{correct ? "正解！" : "もう一度覚えよう"}</span>
            {score != null && <span className="text-xs text-muted-foreground">スコア {score}/5</span>}
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
