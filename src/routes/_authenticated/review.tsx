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
import { memoryLevel, MEMORY_LEVELS } from "@/lib/memory";
import { usePhoneticPref, pickReading } from "@/lib/phonetic";
import { ChunkPills, ChunkLegend } from "@/components/ChunkPills";
import { CachedImg } from "@/lib/image-cache";
import { useT } from "@/lib/i18n";
import { SwipeCard } from "@/components/SwipeCard";
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
  const t = useT();
  const fetchDue = useServerFn(getDueReviews);
  const fetchStats = useServerFn(getOverallMemoryStats);
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateMyProfile);
  const qc = useQueryClient();
  const { data: cards, isLoading, refetch } = useQuery({
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
  const [memListOpen, setMemListOpen] = useState(false);
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
    <AppShell title={t("title.review")}>
      <section className="mb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold leading-[1.1] tracking-[-0.02em]">{t("review.today")}</h1>
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
                {t("review.speak")}
              </button>
              <button
                role="tab"
                aria-selected={lightMode}
                onClick={() => setMode("choice")}
                title="声を出せない場所用の4択モード"
                className={`relative z-10 w-[4.5rem] rounded-full py-1 text-center transition-colors ${lightMode ? "text-foreground" : "text-muted-foreground"}`}
              >
                {t("review.choice")}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        {/* 記憶レベルの全体サマリー: 開いた瞬間に色分けと件数が見え、
            バーをタップすると単語ごとの状態リストが開く(下部の別ブロックは廃止)。 */}
        {memOverview && memOverview.words.length > 0 && (
          <>
            <button
              onClick={() => setMemListOpen((v) => !v)}
              aria-expanded={memListOpen}
              className="w-full text-left"
            >
              <MemoryLevelSummary words={memOverview.words} />
            </button>
            {memListOpen && (
              <div className="mt-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                <MemoryOverviewPanel overview={memOverview} onOpenWord={(w) => setMemModal(w)} />
                <div className="mt-3 border-t border-border pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    全体の記憶率(前後2週間)
                  </p>
                  {memStats && <MiniRetentionGraph series={memStats.series} />}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">{t("review.preparing")}</p>
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
            onOpenMemory={() => setMemModal(memWordOf(current))}
          />
        ) : (
          <SpeakingCard
            key={current.review_id}
            card={current}
            onNext={() => setIdx((i) => i + 1)}
            onOpenMemory={() => setMemModal(memWordOf(current))}
          />
        )
      ) : null}

      {memModal && <ForgettingCurveModal word={memModal} onClose={() => setMemModal(null)} />}
    </AppShell>
  );
}

// ---- 記憶ビジュアライズ(6段階レベル: src/lib/memory.ts) ----------------------

/** 出題中カードから忘却曲線モーダル用の MemoryWord を組み立てる。 */
function memWordOf(card: DueReviewCard): MemoryWord {
  return {
    sticker_id: card.sticker_id,
    headword: card.headword,
    retention: card.retention,
    interval_days: card.interval_days,
    repetitions: card.repetitions,
    due_at: null,
    days_until_forgot: null,
    fresh: card.repetitions <= 2,
    long_term: card.interval_days >= 30,
    anchor_at: card.taken_at,
    stability_days: Math.max(0.5, card.interval_days * Math.max(1, card.ease)),
    ease: card.ease,
  };
}

/** 記憶レベル6段階の帯+件数チップ(復習ページを開いた瞬間に見える)。 */
function MemoryLevelSummary({ words }: { words: MemoryWord[] }) {
  const t = useT();
  const counts = MEMORY_LEVELS.map(
    (lv) => words.filter((w) => memoryLevel(w.retention, w.interval_days, w.repetitions).level === lv.level).length,
  );
  const total = words.length || 1;
  return (
    <div className="mt-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        {MEMORY_LEVELS.map((lv, i) =>
          counts[i] > 0 ? (
            <div key={lv.level} className={lv.bar} style={{ width: `${(counts[i] / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {MEMORY_LEVELS.map((lv, i) =>
          counts[i] > 0 ? (
            <span key={lv.level} className={`inline-flex items-center gap-1 ${lv.text}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${lv.bar}`} />
              {t(lv.labelKey)} <b>{counts[i]}</b>
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** 出題カード右上の記憶バッジ — この単語の今の状態がパッと見え、タップで曲線へ。 */
function CardMemoryBadge({ card, onOpen }: { card: DueReviewCard; onOpen?: () => void }) {
  const t = useT();
  const lv = memoryLevel(card.retention, card.interval_days, card.repetitions);
  return (
    <button
      onClick={onOpen}
      aria-label={`${t(lv.labelKey)} ${card.retention}%`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${lv.chip} active:scale-95`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${lv.bar}`} />
      {t(lv.labelKey)} {card.retention}%
    </button>
  );
}

function MemoryOverviewPanel({
  overview,
  onOpenWord,
}: {
  overview: { danger: number; fuzzy: number; solid: number; words: MemoryWord[] };
  onOpenWord: (w: MemoryWord) => void;
}) {
  const t = useT();
  if (overview.words.length === 0) return null;
  return (
    <div className="mt-3">
      {/* 危険な語から順に(タップで忘却曲線) */}
      <ul className="mt-1 max-h-64 space-y-1.5 overflow-y-auto">
        {overview.words.slice(0, 60).map((w) => {
          const lv = memoryLevel(w.retention, w.interval_days, w.repetitions);
          return (
            <li key={w.sticker_id}>
              <button
                onClick={() => onOpenWord(w)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary/60"
              >
                <span className="w-14 shrink-0 truncate text-sm font-medium">{w.headword}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span className={`absolute inset-y-0 left-0 ${lv.bar}`} style={{ width: `${w.retention}%` }} />
                </span>
                <span className={`w-9 shrink-0 text-right text-[11px] font-semibold ${lv.text}`}>{w.retention}%</span>
                <span className={`w-[3.8rem] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-medium ${lv.chip}`}>
                  {t(lv.labelKey)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        タップで単語ごとの忘却曲線と「いつ忘れるか」の予測が見られます
      </p>
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
  const t = useT();
  const lv = memoryLevel(word.retention, word.interval_days, word.repetitions);

  /**
   * 記憶保持率のモデル(Ebbinghaus × SM-2):
   *   R(t) = exp(-t / S)      S = 安定度(日) = interval_days × ease
   * 復習した瞬間に R は 100% へ垂直回復し、正解ほど S が伸びる(坂が緩む)。
   * **復習履歴が無くても** 「出会った日(taken_at)」を起点に実線を描く —
   * これが「まだテストしてないのに線が出ない」問題の原因だった。
   */
  const { series, reviewDays, forgetDay, bestDay } = useMemo(() => {
    const nowMs = Date.now();
    const day = 86400_000;
    const stabilityOf = (interval: number, ease: number) => Math.max(0.5, interval * Math.max(1, ease));

    const hist = (data?.history ?? [])
      .slice()
      .sort((a, b) => new Date(a.reviewed_at).getTime() - new Date(b.reviewed_at).getTime());
    const cur = data?.current;

    // 記憶イベント列: 復習履歴があればそれ、無ければ「出会った日」1点。
    const events: Array<{ t: number; stability: number }> = hist.map((h) => ({
      t: new Date(h.reviewed_at).getTime(),
      stability: stabilityOf(h.interval_days_after, h.ease_after),
    }));
    if (events.length === 0) {
      const anchorIso = cur?.last_reviewed_at ?? data?.taken_at ?? word.anchor_at;
      if (anchorIso) {
        events.push({
          t: new Date(anchorIso).getTime(),
          stability: word.stability_days || stabilityOf(word.interval_days, word.ease),
        });
      }
    }
    if (events.length === 0) {
      return { series: [], reviewDays: [], forgetDay: null, bestDay: null } as {
        series: Array<{ d: number; r: number | null }>;
        reviewDays: number[];
        forgetDay: number | null;
        bestDay: number | null;
      };
    }

    const revDays = events.map((e) => Math.round((e.t - nowMs) / day));
    const firstD = Math.max(-45, Math.min(0, revDays[0]));
    const out: Array<{ d: number; r: number | null }> = [];
    let forget: number | null = null;
    for (let d = firstD; d <= 45; d++) {
      const at = nowMs + d * day;
      let last: { t: number; stability: number } | null = null;
      for (const e of events) if (e.t <= at) last = e;
      if (!last) { out.push({ d, r: null }); continue; }
      const dt = Math.max(0, (at - last.t) / day);
      const r = Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-dt / last.stability))));
      out.push({ d, r: revDays.includes(d) ? 100 : r });
      if (forget == null && d >= 0 && r < 50) forget = d;
    }

    // 最適な復習日 = 保持率 ≒ 85%(想起にひと手間かかるが失敗しない)。
    // 「思い出す努力」が最大の定着を生む desirable difficulty の狙い目。
    const lastEvent = events[events.length - 1];
    const targetDay = Math.round(
      (lastEvent.t - nowMs) / day + lastEvent.stability * Math.log(1 / 0.85),
    );
    return { series: out, reviewDays: revDays, forgetDay: forget, bestDay: targetDay };
  }, [data, word]);

  const dueAt = word.due_at ?? data?.current?.due_at ?? null;
  const dueLabel = dueAt
    ? new Date(dueAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
    : "—";
  const daysUntilForgot = word.days_until_forgot ?? forgetDay;
  const bestLabel =
    bestDay == null ? null : bestDay <= 0 ? t("memory.today") : `${bestDay}${t("memory.daysLater")}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-bold">{word.headword}</h3>
          <button onClick={onClose} aria-label="閉じる" className="rounded-full p-1 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 現在の状態 */}
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${lv.chip}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${lv.bar}`} />
            {t(lv.labelKey)} · {word.retention}%
          </span>
          <span className="text-muted-foreground">
            {t("memory.reviews")} <b className="text-foreground">{word.repetitions}</b> {t("memory.times")}
          </span>
        </div>

        {series.length > 0 ? (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,0.28)" />
                <XAxis
                  dataKey="d"
                  tickFormatter={(v: number) => (v === 0 ? "今日" : v > 0 ? `+${v}d` : `${v}d`)}
                  stroke="#64748b"
                  fontSize={10}
                />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#64748b" fontSize={10} />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, "記憶保持率"]}
                  labelFormatter={(l: number) => (l === 0 ? "今日" : l > 0 ? `${l}日後` : `${-l}日前`)}
                  contentStyle={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(120,130,150,0.28)", borderRadius: 12, fontSize: 12 }}
                />
                {/* 忘却ライン(50%)と、最適な復習ゾーン(85%) */}
                <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 4" />
                <ReferenceLine y={85} stroke="#10b981" strokeDasharray="2 4" />
                <ReferenceLine x={0} stroke="#2563eb" strokeDasharray="2 4" />
                {bestDay != null && bestDay >= 0 && bestDay <= 45 && (
                  <ReferenceLine x={bestDay} stroke="#10b981" strokeWidth={1.5} />
                )}
                {reviewDays.map((d) => (
                  <ReferenceDot key={d} x={d} y={100} r={3.5} fill="#2563eb" stroke="#fff" />
                ))}
                <Line
                  type="monotone"
                  dataKey="r"
                  stroke="#2563eb"
                  strokeWidth={2.4}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">{t("review.memoryLoading")}</p>
        )}

        {/* 数字で読める予測 */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/60 p-2">
            <div className="text-[9px] text-muted-foreground">{t("memory.bestReview")}</div>
            <div className="text-sm font-bold text-emerald-600">{bestLabel ?? "—"}</div>
          </div>
          <div className="rounded-xl bg-secondary/60 p-2">
            <div className="text-[9px] text-muted-foreground">{t("memory.forgetIn")}</div>
            <div className={`text-sm font-bold ${daysUntilForgot != null && daysUntilForgot <= 2 ? "text-red-600" : ""}`}>
              {daysUntilForgot != null ? `${daysUntilForgot}${t("memory.daysLater")}` : "—"}
            </div>
          </div>
          <div className="rounded-xl bg-secondary/60 p-2">
            <div className="text-[9px] text-muted-foreground">{t("memory.nextDue")}</div>
            <div className="text-sm font-bold">{dueLabel}</div>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          曲線は保持率 R = e<sup>−t/S</sup>(S = 間隔 × 定着度)。● の復習ごとに 100% へ回復し、
          正解すると S が伸びて坂が緩やかになります。
          {" "}
          <b className="text-emerald-600">緑の線(85%)</b>付近が、思い出す努力が効く一番おいしい復習タイミングです。
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Speaking-output card (§6)
// ============================================================================
function SpeakingCard({
  card,
  onNext,
  onOpenMemory,
}: {
  card: DueReviewCard;
  onNext: () => void;
  onOpenMemory?: () => void;
}) {
  const grade = useServerFn(gradeReview);
  const feedbackFn = useServerFn(getSpeakingFeedback);
  const scaffoldFn = useServerFn(getSpeakingScaffold);
  const t = useT();
  const phonetic = usePhoneticPref();

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
  const videoStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // **audio: false が必須**(2026-07-28)。
      // getUserMedia でマイクを掴むと Android Chrome / iOS Safari では
      // SpeechRecognition が結果を1文字も返さなくなり、「録画だけされて
      // 文字が出ない」状態になっていた。開始順を入れ替えても直らなかった。
      // 音声認識(=学習の本体)を優先し、録画は映像だけにする。
      // 発音は認識結果のテキストとAI添削で確認できる。
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
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
    if (videoStartTimer.current) { clearTimeout(videoStartTimer.current); videoStartTimer.current = null; }
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
    rec.onend = () => {
      setListening(false);
      stopVideo();
      // 1文字も取れなかった時は黙って終わらせない(録画だけ回って
      // 気づかない、が一番困る)。テキスト欄で直せることを伝える。
      if (!finalText.trim()) {
        setError("音声を聞き取れませんでした。もう一度話すか、下の欄に直接入力してください。");
      }
    };
    rec.onerror = () => { setListening(false); stopVideo(); };
    recogRef.current = rec;
    startedAt.current = Date.now();
    setListening(true);
    // 音声認識が先。マイクは認識だけが使う。
    rec.start();
    // 録画は音声トラックを取らない(startVideo 参照)ので、マイクの
    // 取り合いは起きない。待たずに同時に始めて録り逃しを無くす。
    if (videoOn) void startVideo();
  }

  function stopListen() {
    if (videoStartTimer.current) { clearTimeout(videoStartTimer.current); videoStartTimer.current = null; }
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
    <SwipeCard
      enabled={!loading}
      onSwipe={() => commitAndNext(feedback ? "success" : "skip")}
    >
    <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          <Mic className="h-3.5 w-3.5" /> {isPhrase ? t("review.roleplayTag") : t("review.speakTag")}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {isPhrase ? t("review.promptPhrase") : t("review.promptSpeak")}
          </span>
          <CardMemoryBadge card={card} onOpen={onOpenMemory} />
        </div>
      </div>

      {/* Photo — the word itself stays hidden until hint */}
      <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
        {heroUrl ? (
          <CachedImg
            src={heroUrl}
            alt="復習対象"
            className={`h-full w-full object-contain p-4 ${isGhostImage ? "opacity-70 grayscale" : ""}`}
          />
        ) : (
          <span className="text-5xl">📦</span>
        )}
        {isGhostImage && (
          <span className="absolute left-2 top-2 rounded-full bg-foreground/60 px-2 py-0.5 text-[10px] font-semibold text-background">
            {t("review.tempImage")}
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
          <span className="text-xs text-muted-foreground">{t("review.scene")}</span>
          {card.caption}
        </p>
      )}

      {/* 今日の型 (§6/B7): ゼロから例文を作るのは難しい — ネイティブがよく
          使う型を1つ指定して、その型で言わせる。単語部分は伏せ字にして
          思い出す練習は守る。ヒント後は全体を表示。 */}
      {!isPhrase && card.prompt_pattern && (
        <div className="mb-3 rounded-xl bg-primary/5 p-3 text-center ring-1 ring-primary/15">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{t("review.todaysPattern")}</div>
          <div className="mt-1 text-lg font-bold tracking-wide">
            {hintShown
              ? card.prompt_pattern.zh
              : card.prompt_pattern.zh.split(card.headword).join("◯".repeat(Math.max(1, card.headword.length)))}
          </div>
          {card.prompt_pattern.ja && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">{card.prompt_pattern.ja}</div>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">{t("review.usePattern")}</div>
        </div>
      )}

      {/* B4 足場: 先生からの質問 + 組み立てパーツ(MTC式)。真っ白から作らず、
          パーツを組み合わせて質問に答える。 */}
      {!isPhrase && scaffold && !feedback && (
        <div className="mb-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800">{t("review.teacherQ")}</div>
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

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-sky-800">{t("review.hintsLabel")}</div>
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
              {t("review.yourNote")}「{scaffold.caption_seed}」{t("review.mixFeeling")}
            </p>
          )}
          <p className="mt-1.5 text-[10px] text-sky-800/70">{t("review.buildYourOwn")}</p>
        </div>
      )}

      {/* Hint reveal */}
      {hintShown && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30">
          <div className="text-xl font-bold">{card.headword}</div>
          <div className="text-xs text-muted-foreground">
            {pickReading(phonetic, card.reading_zhuyin, card.pinyin)}
          </div>
          <button
            onClick={() => playAudio(card)}
            className="ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
            aria-label="発音を再生"
          >
            <Volume2 className="h-4 w-4" />
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
              className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-2 text-[11px] ${hintShown ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300" : "border-border bg-background text-muted-foreground hover:bg-accent/40"}`}
            >
              <Lightbulb className="h-5 w-5" />
              {hintShown ? t("review.hintUsed") : t("review.hint")}
            </button>
          </div>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={listening ? t("scan.listening") : t("review.recognitionHint")}
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
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t("review.grading")}</span>
              ) : (
                t("review.submit")
              )}
            </button>
            <button
              onClick={() => commitAndNext("skip")}
              className="rounded-xl border border-border bg-background px-3 text-xs text-muted-foreground"
            >
              {t("review.skip")}
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
    </SwipeCard>
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
  const t = useT();
  const goodTarget = feedback.used_target;
  const score = feedback.natural_score;
  return (
    <div className="mt-5 space-y-4">
      {/* Header verdict */}
      <div className={`rounded-2xl p-3 ${goodTarget && score >= 4 ? "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30" : goodTarget && score >= 3 ? "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30" : "bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-400/30"}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {goodTarget && score >= 4
              ? t("review.natural")
              : goodTarget
                ? t("review.almost")
                : `「${card.headword}」${t("review.useTarget")}`}
          </span>
          <span className="text-xs text-muted-foreground">{t("review.naturalness")} {score}/5</span>
        </div>
      </div>

      {/* Your recording — video only; the mic belongs to speech recognition */}
      {videoUrl && (
        <div className="rounded-2xl bg-secondary/50 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("review.watchYourself")}
          </div>
          <video src={videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {t("review.videoNoAudio")}
          </p>
        </div>
      )}

      {/* Your line vs corrected */}
      <div className="space-y-2 rounded-2xl bg-secondary/50 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("review.you")}</div>
        <div className="text-sm">{transcript}</div>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("review.corrected")}</div>
        <div className="flex items-start gap-2">
          <div className="flex-1 text-base font-medium">{feedback.corrected}</div>
          <button
            onClick={() => speakZhTW(feedback.corrected)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
            aria-label="添削文を聞く"
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{feedback.correction_note}</p>
      </div>

      {/* 文の組み立て: 添削文をパーツ分解(V1/V2等の詳しい役割つき)+語順ルール */}
      <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("review.sentenceBuild")}</span>
          {feedback.unlocked_branch && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {t("review.newBranch")}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{feedback.chunk_note}</span>
        </div>
        <ChunkPills parts={feedback.chunk} />
        <ChunkLegend />
        {feedback.word_order_rule && (
          <div className="mt-2.5 rounded-xl bg-secondary/60 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("review.whyOrder")}</div>
            <p className="mt-0.5 text-xs leading-relaxed">{feedback.word_order_rule}</p>
          </div>
        )}
      </div>

      {/* Native feel */}
      <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:ring-indigo-400/30">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">{t("review.nativeFeel")}</div>
        <p className="text-sm text-indigo-950 dark:text-indigo-100">{feedback.native_note}</p>
      </div>

      {/* Model answers */}
      <div className="space-y-2 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">{t("review.model")}</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm">{feedback.model_answer}</div>
          <button onClick={() => speakZhTW(feedback.model_answer)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" aria-label="お手本を聞く">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">{t("review.altWay")}{feedback.alt_answer}</div>
          <button onClick={() => speakZhTW(feedback.alt_answer)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" aria-label="別の言い方を聞く">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {round === 1 && (
          <button
            onClick={onRetry}
            className="flex-1 rounded-xl border border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary"
          >
            <Repeat className="mr-1 inline h-4 w-4" /> {t("review.retryPattern")}
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
function LightModeCard({
  card,
  onNext,
  onOpenMemory,
}: {
  card: DueReviewCard;
  onNext: () => void;
  onOpenMemory?: () => void;
}) {
  const grade = useServerFn(gradeReview);
  const t = useT();
  const phonetic = usePhoneticPref();
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

  const infos = card.headword_choice_infos?.length
    ? card.headword_choice_infos
    : card.headword_choices.map((h) => ({ headword: h, zhuyin: null, pinyin: null }));

  return (
    <SwipeCard enabled={!!picked} onSwipe={onNext}>
    <article className="rounded-3xl border border-border bg-card p-4 shadow-lg shadow-primary/10">
      {/* スクロールなしで4択まで見えるコンパクトレイアウト:
          写真は左の小さなサムネにして、問いと選択肢を最初の画面に収める。 */}
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-foreground">
          {t("review.quizTag")}
        </span>
        <CardMemoryBadge card={card} onOpen={onOpenMemory} />
      </div>
      {/* 画像は大きく見せたい / でも4択はスクロールなしで見せたい。
          画面高に連動させ(最大32vh)、小さい端末でも選択肢が隠れない。 */}
      <div className="mb-2 max-h-[32vh] min-h-[8rem] w-full overflow-hidden rounded-2xl bg-secondary">
        {card.cutout_url ?? card.placeholder_url ? (
          <CachedImg
            src={(card.cutout_url ?? card.placeholder_url)!}
            alt="復習対象"
            className={`h-full max-h-[32vh] w-full object-contain ${!card.cutout_url ? "opacity-70 grayscale" : ""}`}
          />
        ) : (
          <div className="grid h-32 w-full place-items-center text-4xl">📦</div>
        )}
      </div>
      <div className="mb-2.5 text-center">
        <div className="text-base font-semibold leading-snug">「{card.meaning_ja}」はどれ?</div>
      </div>
      <ul className="space-y-1.5">
        {infos.map((info) => {
          const c = info.headword;
          const isAnswer = c === card.headword;
          const isPicked = picked === c;
          const showGreen = picked != null && isAnswer;
          const showRed = isPicked && !isAnswer;
          const reading = pickReading(phonetic, info.zhuyin, info.pinyin);
          return (
            <li key={c} className="flex items-stretch gap-2">
              <button
                disabled={!!picked}
                onClick={() => submit(c)}
                className={`flex min-w-0 flex-1 items-center justify-between rounded-xl border px-4 py-2 text-left transition-all
                  ${!picked ? "border-border bg-background hover:border-primary/60 hover:bg-accent/40" : ""}
                  ${showGreen ? "border-green-500/60 bg-green-500/10" : ""}
                  ${showRed ? "border-red-500/60 bg-red-500/10" : ""}
                  ${picked && !isPicked && !isAnswer ? "opacity-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-medium">{c}</span>
                  {reading && (
                    <span className="block truncate text-[11px] text-muted-foreground">{reading}</span>
                  )}
                </span>
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
        <div className="mt-4 rounded-2xl bg-secondary/60 p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold">{correct ? t("review.correct") : t("review.tryAgain")}</span>
            {score != null && <span className="text-xs text-muted-foreground">{t("review.naturalness")} {score}/5</span>}
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">{card.headword}</span>
            <span className="text-xs text-muted-foreground">
              {pickReading(phonetic, card.reading_zhuyin, card.pinyin)}
            </span>
            <button
              onClick={() => playAudio(card)}
              className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary"
              aria-label="発音を再生"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          {card.example_sentence && (
            <div>
              <div className="text-sm">{card.example_sentence}</div>
              <div className="text-xs text-muted-foreground">{card.example_translation}</div>
            </div>
          )}
          <button
            onClick={onNext}
            className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
          >
            {t("review.next")}
          </button>
        </div>
      )}
    </article>
    </SwipeCard>
  );
}

// ============================================================================
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid } from "recharts";

function MiniRetentionGraph({ series }: { series: Array<{ day_offset: number; avg_retention: number }> }) {
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,0.28)" />
          <XAxis dataKey="day_offset" tickFormatter={(v) => (v === 0 ? "今日" : `${v > 0 ? "+" : ""}${v}d`)} stroke="#64748b" fontSize={10} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#64748b" fontSize={10} />
          <Tooltip
            formatter={(v: number) => [`${v}%`, "平均記憶率"]}
            labelFormatter={(l) => (l === 0 ? "今日" : `${l > 0 ? "+" : ""}${l}日`)}
            contentStyle={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(120,130,150,0.28)", borderRadius: 12, fontSize: 12 }}
          />
          <ReferenceLine x={0} stroke="#2563eb" strokeDasharray="4 4" />
          <ReferenceLine y={80} stroke="#64748b" strokeDasharray="2 4" />
          <Line type="monotone" dataKey="avg_retention" stroke="#2563eb" strokeWidth={2.4} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">{t("review.empty")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("review.emptyHint")}</p>
      <Link to="/capture" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
        {t("review.goCatch")}
      </Link>
    </div>
  );
}

function DoneState({ onAgain }: { onAgain: () => void }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
      <p className="text-sm font-medium">{t("review.doneTitle")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("review.doneHint")}</p>
      <button onClick={onAgain} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
        {t("review.again")}
      </button>
      <div className="mt-2 text-[10px] text-muted-foreground">
        <Video className="mr-1 inline h-3 w-3" />
        {t("review.videoTip")}
      </div>
    </div>
  );
}
