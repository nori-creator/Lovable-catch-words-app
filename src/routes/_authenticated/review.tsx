import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { batchKey, readMark, writeMark, EMPTY_MARK } from "@/lib/review-session";
import { packBatch, readBatch, REVIEW_CACHE_KEY, REVIEW_CACHE_USER_KEY } from "@/lib/review-cache";
import { countsAsRemembered, speakingResult } from "@/lib/speaking-grade";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/AppShell";
import { usePrefetchSpeech, usePronounce } from "@/lib/use-pronounce";
import { PronounceButton } from "@/components/PronounceButton";
import { BadgeIcon } from "@/components/SectionIcon";
import { BADGE_ICON_NAME } from "@/lib/section-icon";
import { getMyStats } from "@/lib/stats.functions";
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
  getReviewCapState,
} from "@/lib/reviews.functions";
import { stabilityOf } from "@/lib/srs";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { compareByMemory, memoryLevel, MEMORY_LEVELS } from "@/lib/memory";
import { usePhoneticPref, pickReadingOf, Reading } from "@/lib/phonetic";
import { Term } from "@/components/Term";
import { useTargetLang } from "@/lib/target-lang-pref";
import { targetProfile } from "@/lib/target-profile";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { resolvePrefer, usePhotoPref } from "@/lib/photo-pref";
import {
  normalizeReviewMode,
  reviewFormatFor,
  saidTarget,
  type ReviewModePref,
} from "@/lib/review-format";
import { ChunkPills, ChunkLegend } from "@/components/ChunkPills";
import { CachedImg } from "@/lib/image-cache";
import { toast } from "sonner";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { formatCount } from "@/lib/count";
import { SwipeCard } from "@/components/SwipeCard";
import { LoadFailed } from "@/components/LoadFailed";
import { RetakeSuggestion } from "@/components/RetakeSuggestion";
import { useReviewMode, setStoredReviewMode } from "@/lib/review-mode-pref";
// このファイルには復習用の `EmptyState` が既にあるので別名で受ける。
import { EmptyState as EmptyStateCard } from "@/components/EmptyState";
import { batchEndKind, type ReviewBatchState } from "@/lib/review-batch";
import {
  Eye,
  Sparkles,
  BookMarked,
  CheckCircle2,
  Check,
  X,
  Volume2,
  Brain,
  Mic,
  Square,
  Loader2,
  Video,
  Repeat,
  ArrowRight,
  Clock,
  MapPin,
  CalendarCheck,
  ChevronDown,
} from "lucide-react";
import { tStatic } from "@/lib/i18n";

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
// **この画面が自前の `speakZhTW` を持っていた。** 条件が `/^zh/` だったので
// 台湾の声が無い端末では**大陸の普通話**を掴み、しかも毎回選び直すので
// 回ごとに声が変わっていた(オーナー指摘「音声の声がたまに異なる。
// 様々な別のソフトの声がする」)。声の選び方は `lib/speak.ts` の1箇所だけ。
/**
 * **鳴らす道はここに書かない。**
 *
 * この画面は自前の `playAudio` / `playText` を持っていた。作り置きの
 * 署名付きURL(`card.audio_url`)があればそれを、無ければ**すぐ端末の声**に
 * 落ちる形で、サーバの合成を1度も使わない。つまり作り置きの無い語は
 * ずっと端末の声で、他の画面と発音が食い違っていた。しかも URL を
 * 毎回ネットから取り直すので、押すたびに待ちが入る。
 *
 * いまは `PronounceButton` / `usePronounce` の1本に寄せてある
 * (`tts-store.ts` が端末に音を貯める)。作り置きの URL は
 * `usePrefetchSpeech` の `urls` から流し込むので、**サーバ関数を1回も
 * 呼ばずに**端末へ落ちる。
 */

export const Route = createFileRoute("/_authenticated/review")({
  /**
   * `?sticker=<id>` — その1枚を先頭に置いて始める。
   * 場所の知らせを押したときの行き先。押した人は**その言葉**を思い出したくて
   * 押しているので、今日の順番の先頭に割り込ませる。
   */
  validateSearch: (search: Record<string, unknown>): { sticker?: string } => {
    return typeof search.sticker === "string" && search.sticker ? { sticker: search.sticker } : {};
  },
  head: () => ({
    meta: [
      { title: tStatic("page.review") },
      {
        name: "description",
        content: "自分の写真を見て、その単語で一言。AIが添削と型を返します。",
      },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const t = useT();
  const navigate = useNavigate();
  const fetchDue = useServerFn(getDueReviews);
  const fetchStats = useServerFn(getOverallMemoryStats);
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateMyProfile);
  const qc = useQueryClient();
  // 場所の知らせから来たときは、その1枚を先頭に置いて始める。
  const { sticker: wantedSticker } = Route.useSearch();
  /**
   * 端末に書き留めてある束。**最初の描画で読む**（後から読むと、一瞬
   * 「準備中」が出てから差し替わる = いちばん落ち着かない見え方）。
   * 誰の束か・古すぎないかの判断は `lib/review-cache.ts`。
   */
  const [cachedBatch] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return readBatch<DueReviewCard>(
        localStorage.getItem(REVIEW_CACHE_KEY),
        localStorage.getItem(REVIEW_CACHE_USER_KEY) ?? "",
        wantedSticker ?? null,
        Date.now(),
      );
    } catch {
      return null;
    }
  });
  const {
    data: cards,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    // 名指しの1枚は列の中身を変えるので、**鍵にも入れる**。
    // 入れないと、前に読んだ普通の列がそのまま出てくる。
    queryKey: ["reviews-due", wantedSticker ?? null],
    queryFn: () => fetchDue(wantedSticker ? { data: { sticker_id: wantedSticker } } : undefined),
    /**
     * **一度出した束を、画面に戻るたび作り直さない**(オーナー報告
     * 2026-08-26「あのページに移ると問題が消え、また一から問題を
     * 表示するまでのラグが発生する」)。
     *
     * ここは `staleTime: 0` だった。React Query は古いと見なした
     * 問い合わせを**画面に戻るたび投げ直す**ので、`getDueReviews` —
     * 期限切れを全部読んで、写真の署名URLを作り、4択を組み、音を
     * 用意する、この app でいちばん重い問い合わせ — が毎回走っていた。
     *
     * 束は「今日出す10枚」なので、数分のあいだ同じで構わない。
     * 採点し終えて「もう一度」を押したときは `refetch()` が明示的に
     * 読み直すので、古い束が残ることはない。
     */
    staleTime: 5 * 60_000,
    // 画面に戻ってきただけで投げ直さない(上と同じ理由)。
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    /**
     * **前に出した束を、アプリを閉じても出せるようにする**(オーナー報告
     * 2026-09-15「他のページやアプリを一旦閉じたりすると毎回準備中と
     * 表示されストレスです」)。
     *
     * 上の `staleTime` は**メモリに束が在る間**しか効かない。React Query の
     * 持ち物はメモリの上だけなので、アプリを閉じる・Android が背面の
     * アプリを畳む・`gcTime`(既定5分)を過ぎる、のどれが起きても束は消え、
     * 次に開いたときは何も無い所から `getDueReviews` をやり直す。
     * あれはこの app でいちばん重い問い合わせ（期限切れを全部読み、
     * 写真と音声の署名URLを作り、4択を組み、辞書から囮を引く）なので、
     * 毎回そのぶんの「準備中…」が出ていた。
     *
     * 端末に書き留めた束をここで渡すと、**開いた瞬間に前の束が出る**。
     * 新しいかどうかは React Query が `initialDataUpdatedAt` から判じ、
     * 古ければ裏で読み直して差し替える（下の一度きりの読み直し）。
     */
    initialData: () => cachedBatch?.cards,
    initialDataUpdatedAt: cachedBatch?.at,
  });
  // 続いている日数。ヘッダーの記録の面と鍵を揃えてあるので、
  // どちらを先に開いても読み直しは起きない。
  const fetchMyStats = useServerFn(getMyStats);
  const { data: myStats } = useQuery({
    queryKey: ["my-stats"],
    queryFn: () => fetchMyStats(),
    staleTime: 60_000,
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
  /**
   * 束を出し切ったときに「まだ出せるのか / 上限で止まったのか /
   * 本当に終わりか」を決める数。**`DoneState` ではなくここで聞く** —
   * あちらで問い合わせると検査の雛形が描けず、3つの分岐のうち
   * 1つしか絵に残らない(実際そうなっていた)。
   *
   * `staleTime: 0` — たった今10枚採点した直後で、60秒前の数は必ず古い。
   */
  const capFn = useServerFn(getReviewCapState);
  const { data: cap } = useQuery({
    queryKey: ["review-cap"],
    queryFn: () => capFn(),
    staleTime: 0,
  });

  /**
   * 何枚目まで進んだか。**画面の状態だけにしない**(オーナー報告
   * 2026-08-26)。画面が外れた瞬間に 0 へ戻るので、別の頁から帰ると
   * 1枚目からやり直しになっていた。続きは `review-session.ts` が持つ。
   */
  const batch = batchKey(cards, wantedSticker ?? null);
  const [idx, setIdx] = useState(0);
  /**
   * この回の成績。**完了の面で見せるためだけ**に数える。
   *
   * 1問ごとの採点はサーバへ送っているのに、画面側では捨てていたので、
   * 「今日の復習、終わりました」以上のことが言えなかった
   * (独立監査: 直前まで数えていた情報が完了の瞬間に消えている)。
   */
  const [tally, setTally] = useState({ answered: 0, correct: 0 });
  /**
   * 束が届いた（または入れ替わった）ら、その束の続きを読み直す。
   *
   * **束の目印が変わったときだけ**動かす。毎回動かすと、いま進めた
   * ぶんを憶えた値で上書きしてしまう。
   */
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!batch || restoredFor.current === batch) return;
    restoredFor.current = batch;
    const mark = readMark(batch);
    setIdx(mark.idx);
    setTally({ answered: mark.answered, correct: mark.correct });
  }, [batch]);
  /**
   * 届いた束を端末に書き留める。**次に開いたときの「準備中」を消すため。**
   *
   * 名指しの1枚（`?sticker=`）で来た回の束は**書き留めない** — あれは
   * その場限りの並びなので、次に普通に開いたときに出てくると話が合わない。
   * `readBatch` 側でも名指しが違えば弾くが、そもそも書かない。
   */
  useEffect(() => {
    if (!cards?.length || wantedSticker) return;
    try {
      const uid = localStorage.getItem(REVIEW_CACHE_USER_KEY);
      if (!uid) return;
      const packed = packBatch(cards, uid, null, Date.now());
      if (packed) localStorage.setItem(REVIEW_CACHE_KEY, JSON.stringify(packed));
    } catch {
      // 置き場所がいっぱい・内緒のタブ。書けなくても今までと同じ動き。
    }
  }, [cards, wantedSticker]);
  /**
   * 書き留めた束から始めた回だけ、**一度だけ**裏で読み直す。
   *
   * `refetchOnMount: false` のままなので、放っておくと最大4時間前の束を
   * 出し続けることになる。かといって毎回読み直すと、上の直し
   * （2026-08-26「別の頁へ行って戻ると一から」）が元に戻る。
   *
   * **まだ1枚も答えていないときだけ**にするのが肝。解いている最中に
   * 束が入れ替わると、`batchKey` が変わって続きの位置が捨てられ、
   * **やっている途中で1枚目へ戻される**。それはラグより悪い。
   */
  /**
   * いま束を**入れ替えている**最中か（「もう一度」を押した後）。
   * 裏での読み直しと区別するために持つ。詳しくは下の分岐の注。
   */
  const replacing = useRef(false);
  useEffect(() => {
    if (!isFetching) replacing.current = false;
  }, [isFetching, cards]);
  const revalidated = useRef(false);
  useEffect(() => {
    if (revalidated.current || !cachedBatch) return;
    if (idx !== 0 || tally.answered !== 0) return;
    if (Date.now() - cachedBatch.at <= 5 * 60_000) return;
    revalidated.current = true;
    void refetch();
  }, [cachedBatch, idx, tally.answered, refetch]);
  // 進んだら憶える。**別の頁へ行っても消えない**(`sessionStorage`)。
  useEffect(() => {
    if (!batch || restoredFor.current !== batch) return;
    writeMark(batch, { idx, answered: tally.answered, correct: tally.correct });
  }, [batch, idx, tally]);
  /**
   * 記憶の集計を読み直す。
   *
   * **これが無いと「復習したのに記憶率が動かない」ように見える。**
   * どちらの問い合わせも `staleTime: 60_000` で、誰も無効化していなかったので、
   * 1枚採点しても上のバッジも下の折れ線も採点前の値のままだった。
   *
   * 1枚ごとには呼ばない — どちらもその人の復習を全部読む問い合わせなので、
   * 20枚やれば20往復になる。**見せる直前**(束を終えたとき / 一覧を開いたとき)
   * にだけ読み直す。
   */
  const refreshMemory = () => {
    void qc.invalidateQueries({ queryKey: ["memory-stats"] });
    void qc.invalidateQueries({ queryKey: ["memory-overview"] });
    void qc.invalidateQueries({ queryKey: ["my-stats"] });
    // 束を出し切った面が「あと何枚出せるか」を聞くので、ここで古くする。
    void qc.invalidateQueries({ queryKey: ["review-cap"] });
  };
  const advance = (correct?: boolean) => {
    // **更新関数の中で副作用を起こさない**(StrictMode で2回走る)。
    const next = idx + 1;
    setIdx(next);
    if (cards && next >= cards.length) refreshMemory();
    if (correct !== undefined) {
      setTally((v) => ({ answered: v.answered + 1, correct: v.correct + (correct ? 1 : 0) }));
    }
  };
  const [memModal, setMemModal] = useState<MemoryWord | null>(null);
  const [memListOpen, setMemListOpen] = useState(false);
  // §6/§10-3: speaking is the default; 4択 stays as "light mode".
  //
  // **`hybrid` は「1枚ずつ形が変わる」ので真偽値に潰せない。**
  // ここを boolean にしていたせいで、サーバが毎回送っている `card.mode` を
  // 画面が受け取る場所そのものが無かった(`lib/review-format.ts` の注釈)。
  //
  // **選んだ形は端末が持つ**(オーナー報告「AIが選ぶを押したらエラーが出た」)。
  // DB の列には `'hybrid'` を許す移行が要るので、当たっていない間は保存が
  // 制約違反で落ち、つまみが戻っていた。DB は他の端末へ持っていくための
  // 控えに格下げして、控えが失敗しても選んだ形はこの端末で効くようにする
  // (`src/lib/review-mode-pref.ts`)。
  const mode = useReviewMode((profile as { review_mode?: string } | null | undefined)?.review_mode);
  function setMode(next: ReviewModePref) {
    if (mode === next) return;
    // まず端末に書く。**ここが本命**なので、この先が全部失敗しても効く。
    setStoredReviewMode(next);
    qc.setQueryData(["profile"], (old: unknown) =>
      old ? { ...(old as Record<string, unknown>), review_mode: next } : old,
    );
    // 控えの保存。**失敗しても選択は戻さない** — 戻すと「押したのに戻った」
    // になる。移行がまだ当たっていない場合だけ、その旨を静かに知らせる。
    void updateProfileFn({ data: { review_mode: next } }).catch(() =>
      toast(t("review.modeLocalOnly")),
    );
  }

  const current: DueReviewCard | undefined = cards?.[idx];
  const done = cards && idx >= cards.length;

  /**
   * 4択で見える可能性がある音を、束が届いた時点で端末へ入れる。
   * 各ボタンも自分の音を確認するが、ここでまとめて始めれば問題を読む間に
   * IndexedDB まで届く。同じ語は `ensureAudio` の inflight と cache が束ねる。
   */
  const choiceAudio = useMemo(() => {
    const words = new Set<string>();
    const urls: Record<string, string | null> = {};
    for (const reviewCard of cards ?? []) {
      words.add(reviewCard.headword);
      urls[reviewCard.headword] = reviewCard.audio_url;
      const choices = reviewCard.headword_choice_infos?.length
        ? reviewCard.headword_choice_infos.map((choice) => choice.headword)
        : reviewCard.headword_choices;
      for (const choice of choices) words.add(choice);
    }
    return { words: [...words], urls };
  }, [cards]);
  usePrefetchSpeech(choiceAudio.words, {
    language: cards?.[0]?.language ?? undefined,
    enabled: choiceAudio.words.length > 0,
    urls: choiceAudio.urls,
  });

  /**
   * **この1枚をどの形で出すか。** 「AIが選ぶ」のときだけ札ごとに変わる。
   * 根拠は記憶レベル — すぐ隣に出ているバッジと同じ関数から決まるので、
   * 「忘れかけ」と赤で出ている札にいちばん難しい作文発話が来ることはない。
   */
  const format = current
    ? // **場所の知らせから来た1枚は、必ず4択にする**(オーナー指摘 2026-08-20)。
      //
      // 知らせの文面は「『タピオカミルクティー』は台湾華語で?」という
      // 問いなので、押した先が発話や作文だと問いと答えが噛み合わない。
      // 4択は既に「写真+意味 → 台湾華語を選ぶ」向きなので、形だけ揃える。
      wantedSticker && current.sticker_id === wantedSticker
      ? "choice"
      : reviewFormatFor({
          pref: mode,
          retention: current.retention,
          intervalDays: current.interval_days,
          repetitions: current.repetitions,
          entryType: current.entry_type,
        })
    : null;

  const progress = useMemo(() => {
    if (!cards?.length) return 0;
    return Math.round((idx / cards.length) * 100);
  }, [cards, idx]);

  return (
    <AppShell
      title={t("title.review")}
      fixedViewport={format === "choice" && !memListOpen && !done && !isLoading && !isError}
    >
      <section className={`${format === "choice" && !memListOpen ? "mb-2" : "mb-4"} shrink-0`}>
        <ReviewHeader
          answered={cards ? Math.min(idx, cards.length) : null}
          total={cards?.length ?? null}
          progress={progress}
          mode={mode}
          onMode={setMode}
          reviewStreak={myStats?.review_streak ?? null}
        />
        {/* 記憶レベルの全体サマリー: 開いた瞬間に色分けと件数が見え、
            バーをタップすると単語ごとの状態リストが開く(下部の別ブロックは廃止)。 */}
        {memOverview && memOverview.words.length > 0 && (
          <>
            <button
              onClick={() => {
                if (!memListOpen) refreshMemory();
                setMemListOpen((v) => !v);
              }}
              aria-expanded={memListOpen}
              className="w-full text-left"
            >
              <MemoryLevelSummary words={memOverview.words} expanded={memListOpen} />
            </button>
            {memListOpen && (
              <div className="mt-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                <MemoryOverviewPanel overview={memOverview} onOpenWord={(w) => setMemModal(w)} />
                <div className="mt-3 border-t border-border pt-2">
                  <p className="mb-1 text-caption font-semibold label-caps text-muted-foreground">
                    {t("rv.overallTitle")}
                  </p>
                  {memStats && <MiniRetentionGraph series={memStats.series} />}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {isLoading ? (
        <ReviewPreparing />
      ) : isError ? (
        // 空ではなく**失敗**。ここを EmptyState にしていたせいで、
        // 200枚溜まっていても「今日の復習はありません」と出ていた。
        <LoadFailed
          onRetry={() => void refetch()}
          retrying={isFetching}
          what={t("err.whatReview")}
        />
      ) : !cards?.length ? (
        <EmptyState />
      ) : done ? (
        <DoneState
          answered={tally.answered}
          correct={tally.correct}
          batch={cap}
          onAgain={() => {
            // **憶えた続きも捨てる。** 新しい束が届くので、古い位置を
            // 残すと「3枚目から始まる」になる。
            writeMark(null, EMPTY_MARK);
            restoredFor.current = null;
            setIdx(0);
            setTally({ answered: 0, correct: 0 });
            replacing.current = true;
            void refetch();
          }}
        />
      ) : replacing.current && isFetching ? (
        /**
         * **束を「入れ替えている」間だけ待たせる。**
         *
         * ここは `isFetching` だけを見ていた。理由は正しくて、「もう一度」を
         * 押した直後は採点済みの1枚目がまだ残っており、そのまま押せると
         * **同じ札を二重に採点して記憶の予定を壊す**。
         *
         * ただし `isFetching` は**裏での読み直し**でも立つ。端末に書き留めた
         * 束から始めた回は、古ければ裏で1回読み直すので、そのたびに
         * 画面が「準備中…」へ戻っていた — オーナー報告
         * 「他のページやアプリを一旦閉じたりすると毎回準備中と表示され」の
         * もう半分がこれ。**入れ替えるつもりのときだけ**待たせる。
         */
        <ReviewPreparing />
      ) : current ? (
        <>
          {format === "choice" ? (
            <LightModeCard
              key={current.review_id}
              card={current}
              onNext={advance}
              onOpenMemory={() => setMemModal(memWordOf(current))}
            />
          ) : (
            <SpeakingCard
              key={current.review_id}
              card={current}
              format={format === "say" ? "say" : "compose"}
              onNext={advance}
              onOpenMemory={() => setMemModal(memWordOf(current))}
            />
          )}
          {/* 「どうしても覚えられない語は、もう一度撮ってみよう」(オーナー指摘)。
              出す形は3つあるので、**札の外に1度だけ**置く。中に入れると
              4択・発話・作文の3箇所に同じ判断を書くことになり、
              いずれ食い違う。条件は `src/lib/retake.ts` が持つ。 */}
          <RetakeSuggestion
            headword={current.headword}
            reviewCount={current.review_count}
            lapses={current.lapses}
            intervalDays={current.interval_days}
            retention={current.retention}
            photoCount={current.photo_count}
            onRetake={() => void navigate({ to: "/capture", search: { retake: current.headword } })}
          />
        </>
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
    stability_days: Math.max(0.5, Math.max(1, card.interval_days) * Math.max(1, card.ease)),
    ease: card.ease,
  };
}

/*
 * ここから下のいくつかは `export` している。**画面の検査
 * (`npm run ui:audit`)から本物を描くため**で、ほかから使うためではない。
 * 検査したいのはここに書かれている markup そのものなので、ハーネス側に
 * 似たHTMLを書き写すのではなく、これをそのまま描く
 * (書き写すと「直しても画像が変わらない検査」に戻る)。
 */

/** 記憶レベル6段階の帯+件数チップ(復習ページを開いた瞬間に見える)。 */
/**
 * 出題を組み立てている間の面。**この画面でいちばん先に見る面**なのに、
 * ルートの三項の中に直書きで、しかも**同じ5行が2箇所に複製**されていた
 * (最初の読み込みと、「もう一度」で取り直している間)。
 * 片方だけ直せば静かにずれる形なので、1つにまとめて雛形から呼べるようにする。
 */
export function ReviewPreparing() {
  const t = useT();
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <Sparkles className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />
      <p className="text-body text-muted-foreground">{t("review.preparing")}</p>
    </div>
  );
}

/**
 * 記憶の段ごとの内訳(色の帯と凡例)。
 *
 * `expanded` を渡すと**開閉の印(山形)を出す**。これを渡さないと、
 * 押せる帯なのに押せると分かる印が何も無い絵になる。実際そうなっていて、
 * 実物では `<button>` で包んで `aria-expanded` まで付いていたのに、
 * 目で見える手掛かりは1つも無かった(読み上げには在るのに、見えている
 * 人にだけ無い、という逆さまの状態)。
 */
export function MemoryLevelSummary({
  words,
  expanded,
}: {
  words: MemoryWord[];
  expanded?: boolean;
}) {
  const t = useT();
  const counts = MEMORY_LEVELS.map(
    (lv) =>
      words.filter(
        (w) => memoryLevel(w.retention, w.interval_days, w.repetitions).level === lv.level,
      ).length,
  );
  const total = words.length || 1;
  return (
    <div className="mt-3">
      {/* 印は帯の**右端**に置く。凡例は折り返すので、そちらの末尾に付けると
          行によって位置が変わり、開閉の印に見えなくなる。 */}
      <div className="flex items-center gap-2">
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
          {MEMORY_LEVELS.map((lv, i) =>
            counts[i] > 0 ? (
              <div
                key={lv.level}
                className={lv.bar}
                style={{ width: `${(counts[i] / total) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        {expanded !== undefined && (
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        )}
      </div>
      {expanded && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-caption">
          {MEMORY_LEVELS.map((lv, i) =>
            counts[i] > 0 ? (
              <span key={lv.level} className={`inline-flex items-center gap-1 ${lv.text}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${lv.bar}`} />
                {t(lv.labelKey)} <b>{counts[i]}</b>
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

/** 出題カード右上の記憶バッジ — この単語の今の状態がパッと見え、タップで曲線へ。 */
export function CardMemoryBadge({ card, onOpen }: { card: DueReviewCard; onOpen?: () => void }) {
  const t = useT();
  const lv = memoryLevel(card.retention, card.interval_days, card.repetitions);
  return (
    <button
      onClick={onOpen}
      aria-label={`${t(lv.labelKey)} ${card.retention}%`}
      // 見た目は小さな印のままでいい(カードの隅の飾りなので、44px の塊に
      // すると主役の写真より重くなる)。**当たり判定だけ広げる。**
      // 実寸は 82x19 で、指の下限を割っていた。
      className={`relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${lv.chip} before:absolute before:-inset-y-3 before:-inset-x-2 before:content-[''] active:scale-95`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${lv.bar}`} />
      {/* **段の名前だけを出す。** 「定着中 72%」と並べていたので、
          同じ画面の帯にある「定着中 1(語)」と読み比べたときに
          *定着中 = 72%* と読めてしまい、段の名前なのか比率なのかが
          解けなかった(独立監査「語義が二重」)。
          数字は曲線の中で、何の数字かと一緒に出す。押せば開く。 */}
      {t(lv.labelKey)}
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
  // 一覧に並ぶのは学習言語の語だけ(server 側で絞ってある)。字もその言語で。
  const targetLanguage = useTargetLang();
  if (overview.words.length === 0) return null;
  return (
    <div className="mt-3">
      {/**
       * 危険な語から順に(タップで忘却曲線)。
       *
       * **1語も切らない**（オーナー報告 2026-08-26「記憶の状態のバーには
       * 長期記憶があるが、下にスクロールすると『覚えた』までの単語しか
       * なく、長期記憶の単語がない。記憶の状態で表示されてるものを
       * すべて表示して」）。
       *
       * ここは `slice(0, 60)` で切っていた。並びは**危険な語が上**なので、
       * 切られるのは必ず**いちばん覚えている語**の側 — つまり上のバーが
       * 数えている「長期記憶」だけが、一覧から抜け落ちる並びだった。
       * バーと一覧は同じ `words` を見るのだから、数が食い違ってはいけない。
       */}
      <ul className="mt-1 max-h-80 space-y-1.5 overflow-y-auto">
        {/* **並べ替えはここで1回だけ**（`lib/memory.ts` の `compareByMemory`）。
            取得の側は記憶率だけで並べていて、100% が続く所では段が混ざる。 */}
        {[...overview.words].sort(compareByMemory).map((w) => {
          const lv = memoryLevel(w.retention, w.interval_days, w.repetitions);
          return (
            <li key={w.sticker_id}>
              <button
                onClick={() => onOpenWord(w)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary/60"
              >
                <Term
                  lang={targetLanguage}
                  className="w-14 shrink-0 truncate text-body font-medium"
                >
                  {w.headword}
                </Term>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={`absolute inset-y-0 left-0 ${lv.bar}`}
                    style={{ width: `${w.retention}%` }}
                  />
                </span>
                <span className={`w-9 shrink-0 text-right text-caption font-semibold ${lv.text}`}>
                  {w.retention}%
                </span>
                <span
                  className={`w-[3.8rem] shrink-0 rounded-full px-1.5 py-0.5 text-center text-caption font-medium ${lv.chip}`}
                >
                  {t(lv.labelKey)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-caption text-muted-foreground">{t("rv.tapForCurve")}</p>
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
   * **履歴が要る語は、届くまで線を引かない。**（オーナー指摘 2026-09-15
   * 「初めに1回も復習をしてないグラフが表示されてその後切り替わる」）
   *
   * 下の計算は、履歴が空なら「出会った日から一度も復習していない」形の
   * 曲線を描く。ところが問い合わせが返るまで履歴は**必ず空**なので、
   * 4回復習した語でも**まず未復習の坂が描かれ、あとから本物の鋸歯に
   * 差し変わる**。録画のコマで確認した（-25d から単調に落ちる線 →
   * -44d と -28d に立ち上がりのある線）。
   *
   * **一度も復習していない語は待つ必要が無い**（履歴が空なのが正しい姿）。
   * 待つのは `repetitions > 0` の語だけ。ふつうは一瞬で届く。
   */
  const needsHistory = word.repetitions > 0;
  const ready = !needsHistory || data != null;

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
    // 安定度の式は src/lib/srs.ts のもの**だけ**を使う。
    // ここには同じ式が写してあった。いまは同じでも、どちらかを直した
    // ときにもう片方が取り残されて、**同じ画面の中でグラフと定着度の
    // 数字が食い違う**(隣に並んでいるので、見た人はどちらが本当か
    // 分からなくなる)。

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
      if (!last) {
        out.push({ d, r: null });
        continue;
      }
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

  const dueLocale = localeOf(useUiLang());
  const dueAt = word.due_at ?? data?.current?.due_at ?? null;
  const dueLabel = dueAt
    ? new Date(dueAt).toLocaleDateString(dueLocale, { month: "short", day: "numeric" })
    : "—";
  const daysUntilForgot = word.days_until_forgot ?? forgetDay;
  const bestLabel =
    bestDay == null
      ? null
      : bestDay <= 0
        ? t("memory.today")
        : `${bestDay}${t("memory.daysLater")}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 lang="zh-Hant" className="text-headline font-bold">
            {word.headword}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-full p-1 text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 現在の状態 */}
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${lv.chip}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${lv.bar}`} />
            {t(lv.labelKey)} · {word.retention}%
          </span>
          <span className="text-muted-foreground">
            {t("memory.reviews")} <b className="text-foreground">{word.repetitions}</b>{" "}
            {t("memory.times")}
          </span>
        </div>

        {!ready ? (
          // 待っている間。**間違った形の線を出すくらいなら、線を出さない。**
          // 枠の高さは同じにして、届いた時に面が跳ねないようにする。
          <div
            className="h-44 w-full animate-pulse rounded-xl bg-secondary/60"
            role="status"
            aria-label={t("common.loading")}
          />
        ) : series.length > 0 ? (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,0.28)" />
                <XAxis
                  dataKey="d"
                  tickFormatter={(v: number) =>
                    v === 0 ? t("rv.today") : v > 0 ? `+${v}d` : `${v}d`
                  }
                  stroke="#64748b"
                  fontSize={10}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  stroke="#64748b"
                  fontSize={10}
                />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, t("rv.retention")]}
                  labelFormatter={(l: number) =>
                    l === 0
                      ? t("rv.today")
                      : l > 0
                        ? t("rv.daysLater", { n: l })
                        : t("rv.daysAgo", { n: -l })
                  }
                  contentStyle={{
                    background: "rgba(255,255,255,0.96)",
                    border: "1px solid rgba(120,130,150,0.28)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
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
          <p className="py-8 text-center text-footnote text-muted-foreground">
            {t("review.memoryLoading")}
          </p>
        )}

        {/* 数字で読める予測 */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/60 p-2">
            <div className="text-caption text-muted-foreground">{t("memory.bestReview")}</div>
            <div className="text-body font-bold text-ok-ink">{bestLabel ?? "—"}</div>
          </div>
          <div className="rounded-xl bg-secondary/60 p-2">
            <div className="text-caption text-muted-foreground">{t("memory.forgetIn")}</div>
            <div
              className={`text-body font-bold ${daysUntilForgot != null && daysUntilForgot <= 2 ? "text-bad-ink" : ""}`}
            >
              {daysUntilForgot != null ? `${daysUntilForgot}${t("memory.daysLater")}` : "—"}
            </div>
          </div>
          <div className="rounded-xl bg-secondary/60 p-2">
            <div className="text-caption text-muted-foreground">{t("memory.nextDue")}</div>
            <div className="text-body font-bold">{dueLabel}</div>
          </div>
        </div>

        <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
          {t("rv.formula1")}
          {t("rv.formula2")} <b className="text-ok-ink">{t("rv.greenLine")}</b>
          {t("rv.formula3")}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Speaking-output card (§6)
// ============================================================================
export function SpeakingCard({
  card,
  format = "compose",
  onNext,
  onOpenMemory,
}: {
  card: DueReviewCard;
  /**
   * `say` = 写真を見てその1語を声に出すだけ(型も足場も出さない)。
   * `compose` = 型を提示して一文を作る(これまでの姿)。
   * 決めているのは `lib/review-format.ts`。
   */
  format?: "say" | "compose";
  onNext: (correct?: boolean) => void;
  onOpenMemory?: () => void;
}) {
  const grade = useServerFn(gradeReview);
  const feedbackFn = useServerFn(getSpeakingFeedback);
  const scaffoldFn = useServerFn(getSpeakingScaffold);
  const t = useT();
  // 鳴らす道は1本(`use-pronounce.tsx`)。作り置きの音は `urls` から
  // 端末へ流し込むので、サーバ関数を1回も呼ばずにそろう。
  const pronounce = usePronounce(card.language ?? undefined);
  usePrefetchSpeech([card.headword], {
    language: card.language ?? undefined,
    urls: { [card.headword]: card.audio_url },
  });
  // 設定で主役を選んでいれば、復習の意図(切り抜き)より優先する。
  const photoPref = usePhotoPref();

  // B4: 「白紙で話して」を避ける足場。写真の下にAIの質問+組み立てパーツを出す。
  // フレーズカードはロールプレイなので対象外。lazyに取得し失敗は無視。
  // 「言うだけ」の段では足場を**取りに行かない**。
  // 見せない物のためにAIを呼ぶのは、費用も待ち時間も丸ごと無駄。
  const isSay = format === "say";
  const { data: scaffold } = useQuery({
    queryKey: ["speaking-scaffold", card.sticker_id],
    queryFn: () => scaffoldFn({ data: { sticker_id: card.sticker_id } }),
    enabled: card.entry_type !== "phrase" && !isSay,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  /** `say` の段の判定。まだ答えていなければ null。 */
  const [saidOk, setSaidOk] = useState<boolean | null>(null);
  /**
   * **この問題で外した回数**(オーナー指示 2026-08-27 ⑦)。
   *
   * > 「言い直して合ってるのは覚えてない、忘れたとしてカウントし直して。」
   *
   * 画面は最後の1回しか見ていなかった（`setSaidOk` / `setFeedback` が
   * 上書きする）ので、3回外して4回目に言えた語も、1回で言えた語と
   * まったく同じ「正解」として記録されていた。判断は
   * `speaking-grade.ts` に置いてあるが、**何回外したかを憶えるのは
   * 画面の仕事**なので、ここで数える。
   */
  const [failedAttempts, setFailedAttempts] = useState(0);
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
  // **切り抜き優先だが、無ければ撮った元の写真に落ちる。**
  // ここは `cutout ?? placeholder` だけを見ていたので、切り抜きの無い札
  // (かざして撮った札)は写真なしで出題されていた。
  const heroUrl = stickerPhotoUrl(card, { prefer: resolvePrefer(photoPref, "cutout") });
  const takenLocale = localeOf(useUiLang());
  const takenLabel = card.taken_at
    ? new Date(card.taken_at).toLocaleDateString(takenLocale, { month: "short", day: "numeric" })
    : null;

  useEffect(() => {
    setVideoOn(readBool(VIDEO_KEY, false));
  }, []);
  useEffect(
    () => () => {
      stopVideo();
      recogRef.current?.stop();
    },
    // アンマウント時の後片付けだけなので依存は無し。
    [],
  );

  // Phrase roleplay (§5.2): the partner line IS the question — play it.
  useEffect(() => {
    if (!isPhrase) return;
    const t = setTimeout(() => void pronounce(card.headword), 400);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
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
    } catch {
      /* denied */
    }
  }
  function stopVideo() {
    if (videoStartTimer.current) {
      clearTimeout(videoStartTimer.current);
      videoStartTimer.current = null;
    }
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
      setError(t("rv.noAsr"));
      return;
    }
    setError(null);
    const rec = new SR() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      continuous: boolean;
      onresult: (e: {
        results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number };
      }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
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
        setError(t("rv.notHeard"));
      }
    };
    rec.onerror = () => {
      setListening(false);
      stopVideo();
    };
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
    if (videoStartTimer.current) {
      clearTimeout(videoStartTimer.current);
      videoStartTimer.current = null;
    }
    recogRef.current?.stop();
    setListening(false);
    stopVideo();
  }

  async function submit() {
    if (!transcript.trim() || loading) return;
    // 1語言うだけの段は**その場で判定する**(理由は `saidTarget` の注釈)。
    if (isSay) {
      setError(null);
      const ok = saidTarget(transcript, card.headword);
      if (!ok) setFailedAttempts((n) => n + 1);
      setSaidOk(ok);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fb = await feedbackFn({
        data: { sticker_id: card.sticker_id, transcript: transcript.trim(), hint_used: false },
      });
      // **通らなかった回もここで数える。** 「もう一度」を押した回だけを
      // 数えると、通らないまま次へ送った回が抜ける。
      if (!fb.used_target || fb.natural_score < 3) setFailedAttempts((n) => n + 1);
      setFeedback(fb);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rv.feedbackFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function commitAndNext(kind: "success" | "skip") {
    if (graded) {
      // 既に採点済み(2回目の「次へ」)。**数え直さない** —
      // 同じ問題を2回数えると成績が実際より良く見える。
      onNext();
      return;
    }
    setGraded(true);
    // §6 3-level SRS: success=5 / hint=2 (失念) / skip・不成立=1.
    // "Success" additionally requires the AI's objective check (used the
    // target word, natural enough) — the honest-grading idea from main.
    const objectiveOk = isSay
      ? saidOk === true
      : !!feedback && feedback.used_target && feedback.natural_score >= 3;
    /**
     * **言い直して当てた語は「覚えていた」に数えない**（オーナー指示
     * 2026-08-27 ⑦）。決め方は `speaking-grade.ts` に1つだけ置いてある —
     * ここに書くと、記憶の状態のグラフが読む `correct` と食い違う。
     */
    const result = speakingResult({ kind, objectiveOk, failedAttempts });
    try {
      await grade({
        data: {
          review_id: card.review_id,
          // グラフが読む値も同じ所から出す。`result === "success"` と
          // 別々に書くと、SRS は失念として扱うのにグラフだけが正解と
          // 数える、が起きる。
          correct: countsAsRemembered(result),
          blur_seen: false,
          response_ms: Date.now() - startedAt.current,
          result,
        },
      });
    } catch {
      // Keep the session flowing, but don't let the user believe it was saved —
      // an unrecorded review simply comes up again next time.
      toast.error(t("review.gradeFailed"));
    }
    onNext(countsAsRemembered(result));
  }

  // 横スワイプは**答え合わせのあとだけ**。回答前に払うと黙って「skip」
  // (最低評価)で記録され、写真をなぞっただけの人が記憶度を落としていた。
  // 4択の札と同じく、結果が出てから次へ送る。
  /** 答え終わったか。**形が2つあるので、真偽の出所を1つに絞る。** */
  const answered = isSay ? saidOk !== null : !!feedback;

  return (
    <SwipeCard enabled={!loading && answered} onSwipe={() => commitAndNext("success")}>
      <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-caption font-semibold text-primary-ink">
            <Mic className="h-3.5 w-3.5" />{" "}
            {isPhrase ? t("review.roleplayTag") : t("review.speakTag")}
          </span>
          <div className="flex items-center gap-2">
            {/* **求めている物を2つ書かない。** 下に「写真を見て、声に出す」と
                出しているのに、ここが「単語を使って一文で」のままだった
                (検査の絵で気づいた)。同じ画面で違う指示が2つ出ていたら、
                人はどちらに従えばいいか分からない。 */}
            <span className="text-caption text-muted-foreground">
              {isPhrase
                ? t("review.promptPhrase")
                : isSay
                  ? t("rv.promptSay")
                  : t("review.promptSpeak")}
            </span>
            <CardMemoryBadge card={card} onOpen={onOpenMemory} />
          </div>
        </div>

        {/* Photo — the word itself stays hidden until hint */}
        <div className="relative mx-auto mb-2 grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-2xl bg-secondary">
          {heroUrl ? (
            <CachedImg
              src={heroUrl}
              alt={t("rv.targetAlt")}
              className="h-full w-full object-contain p-4"
            />
          ) : (
            <span className="px-3 text-center text-headline font-semibold text-muted-foreground">
              {card.meaning_ja}
            </span>
          )}
        </div>

        {/* When & where the memory was made (§6-1: 場所・日時つき) */}
        {(takenLabel || card.location_name) && (
          <div className="mb-3 flex items-center justify-center gap-3 text-caption text-muted-foreground">
            {takenLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {takenLabel}
              </span>
            )}
            {card.location_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {card.location_name}
              </span>
            )}
          </div>
        )}

        {/* Phrase cards: the scene is the front of the card (§5.2) */}
        {isPhrase && card.caption && (
          <p className="mb-3 rounded-xl bg-secondary/60 p-3 text-center text-body">
            <span className="text-footnote text-muted-foreground">{t("review.scene")}</span>
            {card.caption}
          </p>
        )}

        {/* 今日の型 (§6/B7): ゼロから例文を作るのは難しい — ネイティブがよく
          使う型を1つ指定して、その型で言わせる。単語部分は伏せ字のまま
          (答えを見せない)。答え合わせは添削画面で。 */}
        {!isPhrase && !isSay && card.prompt_pattern && (
          <div className="mb-3 rounded-xl bg-primary/5 p-3 text-center ring-1 ring-primary/15">
            <div className="text-caption font-semibold label-caps text-primary-ink">
              {t("review.todaysPattern")}
            </div>
            <div lang="zh-Hant" className="mt-1 text-title font-bold leading-snug tracking-wide">
              {card.prompt_pattern.zh
                .split(card.headword)
                .join("◯".repeat(Math.max(1, card.headword.length)))}
            </div>
            {card.prompt_pattern.ja && (
              <div className="mt-0.5 text-caption text-muted-foreground">
                {card.prompt_pattern.ja}
              </div>
            )}
            <div className="mt-1 text-caption text-muted-foreground">{t("review.usePattern")}</div>
          </div>
        )}

        {/* 「言うだけ」の段。**何を求められているかを1行で言う** —
          型も質問も出ていない面で、いきなり録音ボタンだけ在ると
          「何を話せばいいのか」が分からない。 */}
        {isSay && !answered && (
          <div className="mb-3 rounded-xl bg-primary/5 p-3 text-center ring-1 ring-primary/15">
            <div className="text-body font-semibold text-primary-ink">{t("rv.formatSay")}</div>
            <div className="mt-0.5 text-caption text-muted-foreground">{t("rv.formatSayHint")}</div>
          </div>
        )}

        {isSay && saidOk !== null && (
          <SayResult
            card={card}
            ok={saidOk}
            heard={transcript}
            retried={failedAttempts > 0}
            onRetry={() => {
              setSaidOk(null);
              setTranscript("");
              setVideoUrl(null);
            }}
            onNext={() => commitAndNext(saidOk ? "success" : "skip")}
          />
        )}

        {/* B4 足場: 先生からの質問 + 組み立てパーツ(MTC式)。真っ白から作らず、
          パーツを組み合わせて質問に答える。 */}
        {!isPhrase && scaffold && !answered && (
          <div className="mb-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
            <div className="text-caption font-semibold label-caps text-sky-800">
              {t("review.teacherQ")}
            </div>
            <div className="mt-0.5 flex items-start gap-2">
              <p className="flex-1 text-body font-semibold text-sky-950">{scaffold.question_zh}</p>
              <button
                onClick={() => void pronounce(scaffold.question_zh)}
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-700"
                aria-label={t("rv.readQuestion")}
              >
                <Volume2 className="h-3 w-3" />
              </button>
            </div>
            <p className="text-caption text-sky-800/80">{scaffold.question_ja}</p>

            <div className="mt-2 text-caption font-semibold label-caps text-sky-800">
              {t("review.hintsLabel")}
            </div>
            {/* ①②③ で1つずつ。中国語は大きく、品詞ごとの色分けは
              単語詳細のチャンクと同じ体系(ChunkPills)で統一する。 */}
            <ol className="mt-1.5 space-y-2">
              {scaffold.parts.map((p, i) => (
                <li key={i} className="rounded-xl bg-white/90 p-2.5 shadow-sm ring-1 ring-sky-200">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-500 text-caption font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-caption font-semibold label-caps text-sky-700">
                      {t(`review.partKind.${p.kind}`)}
                    </span>
                    <button
                      onClick={() => void pronounce(p.zh)}
                      className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-500/10 text-sky-700 active:scale-95"
                      aria-label={t("review.playHint")}
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5">
                    {p.chunks.length > 0 ? (
                      <ChunkPills
                        parts={p.chunks.map((c) => ({ text: c.text, pos: c.pos }))}
                        size="lg"
                        lang={card.language}
                      />
                    ) : (
                      <Term
                        lang={card.language}
                        className="text-headline font-bold leading-snug tracking-wide"
                      >
                        {p.zh}
                      </Term>
                    )}
                  </div>
                  {p.ja && (
                    <p className="mt-1 text-caption leading-relaxed text-sky-900/70">{p.ja}</p>
                  )}
                </li>
              ))}
            </ol>
            <ChunkLegend
              parts={scaffold.parts.flatMap((p) =>
                p.chunks.map((c) => ({ text: c.text, pos: c.pos })),
              )}
            />
            {scaffold.caption_seed && (
              <p className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-caption text-sky-900/80">
                {t("review.yourNote")}「{scaffold.caption_seed}」{t("review.mixFeeling")}
              </p>
            )}
            <p className="mt-1.5 text-caption text-sky-800/70">{t("review.buildYourOwn")}</p>
          </div>
        )}

        {/* 「ヒント(答えを見る)」ボタンは廃止(2026-07-28)。
          答えが出てしまうと思い出す練習にならない。代わりに上の①②③の
          足場(型・コロケーション・文法)だけで自分の言葉を組み立てる。 */}

        {/* Video preview (opt-in) */}
        {videoOn && listening && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="mx-auto mb-3 h-24 w-24 rounded-full object-cover ring-2 ring-primary"
          />
        )}
        {videoUrl && !listening && (
          <video src={videoUrl} controls className="mx-auto mb-3 h-32 rounded-xl bg-black" />
        )}

        {/* Recording controls */}
        {!answered && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={listening ? stopListen : startListen}
                disabled={loading}
                className={`lift flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-colors ${
                  listening
                    ? "bg-bad text-white shadow-bad/30 animate-pulse"
                    : "bg-primary text-primary-foreground shadow-primary/30"
                }`}
                aria-label={listening ? t("rv.stop") : t("rv.record")}
              >
                {listening ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
              </button>
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={listening ? t("scan.listening") : t("review.recognitionHint")}
              className="min-h-[72px] w-full resize-y rounded-2xl border border-border bg-background p-3 text-field"
              dir="auto"
            />
            {error && <p className="text-footnote text-bad-ink">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={!transcript.trim() || loading}
                className="lift flex-1 rounded-xl bg-primary py-3 text-body font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("review.grading")}
                  </span>
                ) : isSay ? (
                  // ここは AI に投げない(`saidTarget` がその場で見る)ので、
                  // 「送信してフィードバック」とは名乗らない。
                  t("rv.sayCheck")
                ) : (
                  t("review.submit")
                )}
              </button>
              <button
                onClick={() => commitAndNext("skip")}
                className="rounded-xl border border-border bg-background px-3 text-footnote text-muted-foreground"
              >
                {t("review.skip")}
              </button>
            </div>
          </div>
        )}

        {/* AI feedback */}
        {!isSay && feedback && (
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

/**
 * 「言うだけ」の段の答え合わせ。
 *
 * 添削の面(`FeedbackView`)を使い回さない。あちらは**文**を直す画面で、
 * 1語しか言っていない人に「自然さ 2/5」「語順の決まり」を並べても、
 * 直す所が無いことを長く説明されるだけになる。
 *
 * ここで見せるのは3つだけ — 通じたか、正しい語と読み、そして音。
 */
export function SayResult({
  card,
  ok,
  heard,
  retried = false,
  onRetry,
  onNext,
}: {
  card: DueReviewCard;
  ok: boolean;
  heard: string;
  /**
   * この問題で一度でも外したか。**言えたことは言えたので「正解」と
   * 出すが、記録は失念**（オーナー指示 2026-08-27 ⑦）なので、
   * 明日また出る理由をその場で言う。黙って明日出すと、
   * 「正解したのになぜ？」になる。
   */
  retried?: boolean;
  onRetry: () => void;
  onNext: () => void;
}) {
  const t = useT();
  // 作り置きの音を端末へ流し込む(サーバ関数は呼ばない)。
  usePrefetchSpeech([card.headword], {
    language: card.language ?? undefined,
    urls: { [card.headword]: card.audio_url },
  });
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {/* 判定は**面で伝える**。色が読めない人にも文字で伝わるようにする
          (4択の面で直したのと同じ理由)。 */}
      <div className={`-mx-4 mb-2 px-4 py-1.5 ${ok ? "bg-ok/12" : "bg-bad/12"}`} role="status">
        <span className={`text-body font-bold ${ok ? "text-ok-ink" : "text-bad-ink"}`}>
          {ok ? t("review.correct") : t("review.tryAgain")}
        </span>
        {ok && retried && (
          <span className="ml-2 text-caption text-muted-foreground">
            {t("review.retriedCountsAsLapse")}
          </span>
        )}
      </div>

      <div className="mb-1.5 flex items-center gap-2">
        <Term
          lang={card.language}
          className="shrink-0 whitespace-nowrap text-title font-bold tracking-tight"
        >
          {card.headword}
        </Term>
        {/* **読みは `Reading` だけが出す**(オーナー報告 2026-08-26)。 */}
        <Reading
          lang={card.language ?? undefined}
          zhuyin={card.reading_zhuyin}
          pinyin={card.pinyin}
          className="min-w-0 truncate text-footnote text-foreground/70"
        />
        {/* **鳴らせるようになってから出る**(オーナー指摘 2026-08-26)。 */}
        <PronounceButton
          text={card.headword}
          language={card.language ?? undefined}
          className="ml-auto"
          label={t("card.playPron")}
        />
      </div>

      {/* **通じなかったときだけ、聞こえた音を見せる。**
          合っているときに「あなた: 面紙」と出しても何も足さない。 */}
      {!ok && heard.trim() && (
        <p className="mb-2 rounded-xl bg-secondary/60 p-2 text-footnote text-muted-foreground">
          {t("review.you")}「{heard.trim()}」
        </p>
      )}

      {/* **塗ってあるボタンは「次にやるべきこと」を指す。**
          通じなかった回に「次へ」を塗ると、画面が「もう一度覚えよう」と
          言った直後に、いちばん目立つボタンが立ち去る側になる
          (完了の面で一度直したのと同じ自己矛盾)。
          外したときは言い直す側を、通じたときは進む側を塗る。 */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onRetry}
          className={`min-h-11 flex-1 rounded-xl py-3 text-body font-semibold active:scale-[0.98] motion-reduce:active:scale-100 ${
            ok ? "border border-border bg-background" : "bg-primary text-primary-foreground"
          }`}
        >
          <Repeat className="mr-1 inline h-4 w-4" />
          {t("rv.sayRetry")}
        </button>
        <button
          onClick={onNext}
          className={`min-h-11 flex-1 rounded-xl py-3 text-body font-semibold active:scale-[0.98] motion-reduce:active:scale-100 ${
            ok ? "bg-primary text-primary-foreground" : "border border-border bg-background"
          }`}
        >
          {t("review.next")}
        </button>
      </div>
    </div>
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
  onNext: (correct?: boolean) => void;
}) {
  const t = useT();
  /**
   * 添削文・手本・言い換えも**カードの読み上げと同じ声**で聞かせる。
   *
   * **その語の学習言語を渡す。** 渡さないと既定(台湾華語)の声で合成
   * されるので、英語を学んでいる人の添削文が中国語の声で読まれ、
   * しかもその音は保存されるので誰かが聞くまで気づけない。
   */
  const pronounceLang = card.language ?? undefined;
  const goodTarget = feedback.used_target;
  const score = feedback.natural_score;
  return (
    <div className="mt-5 space-y-4">
      {/* Header verdict */}
      <div
        className={`rounded-2xl p-3 ${goodTarget && score >= 4 ? "bg-ok/10 ring-1 ring-ok/35" : goodTarget && score >= 3 ? "bg-warn/10 ring-1 ring-warn/35" : "bg-bad/10 ring-1 ring-bad/35"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-body font-semibold">
            {goodTarget && score >= 4
              ? t("review.natural")
              : goodTarget
                ? t("review.almost")
                : `「${card.headword}」${t("review.useTarget")}`}
          </span>
          <span className="text-footnote text-muted-foreground">
            {t("review.naturalness")} {score}/5
          </span>
        </div>
      </div>

      {/* Your recording — video only; the mic belongs to speech recognition */}
      {videoUrl && (
        <div className="rounded-2xl bg-secondary/50 p-3">
          <div className="mb-2 text-caption font-semibold label-caps text-muted-foreground">
            {t("review.watchYourself")}
          </div>
          <video src={videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
          <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
            {t("review.videoNoAudio")}
          </p>
        </div>
      )}

      {/* Your line vs corrected */}
      <div className="space-y-2 rounded-2xl bg-secondary/50 p-3">
        <div className="text-caption font-semibold label-caps text-muted-foreground">
          {t("review.you")}
        </div>
        <div className="text-body">{transcript}</div>
        <div className="mt-2 text-caption font-semibold label-caps text-muted-foreground">
          {t("review.corrected")}
        </div>
        <div lang="zh-Hant" className="flex items-start gap-2">
          <div className="flex-1 text-body font-medium">{feedback.corrected}</div>
          {/* **鳴らせるようになってから出る**(オーナー指摘 2026-08-26)。
              40px は指の下限を割っていたので、そこも 44px に直る。 */}
          <PronounceButton
            text={feedback.corrected}
            language={pronounceLang}
            label={t("rv.hearCorrection")}
          />
        </div>
        <p className="text-footnote text-muted-foreground">{feedback.correction_note}</p>
      </div>

      {/* 文の組み立て: 添削文をパーツ分解(V1/V2等の詳しい役割つき)+語順ルール */}
      <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-caption font-semibold label-caps text-muted-foreground">
            {t("review.sentenceBuild")}
          </span>
          {feedback.unlocked_branch && (
            <span
              lang="zh-Hant"
              className="rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary"
            >
              {t("review.newBranch")}
            </span>
          )}
          <span className="text-footnote text-muted-foreground">{feedback.chunk_note}</span>
        </div>
        <ChunkPills parts={feedback.chunk} lang={card.language} />
        <ChunkLegend parts={feedback.chunk} />
        {feedback.word_order_rule && (
          <div className="mt-2.5 rounded-xl bg-secondary/60 p-2.5">
            <div className="text-caption font-semibold label-caps text-muted-foreground">
              {t("review.whyOrder")}
            </div>
            <p className="mt-0.5 text-footnote leading-relaxed">{feedback.word_order_rule}</p>
          </div>
        )}
      </div>

      {/* Native feel */}
      <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:ring-indigo-400/30">
        <div className="mb-1 text-caption font-semibold label-caps text-indigo-900 dark:text-indigo-200">
          {t("review.nativeFeel")}
        </div>
        <p className="text-body text-indigo-950 dark:text-indigo-100">{feedback.native_note}</p>
      </div>

      {/* Model answers */}
      <div className="space-y-2 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30">
        <div className="text-caption font-semibold label-caps text-emerald-900 dark:text-emerald-200">
          {t("review.model")}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-body">{feedback.model_answer}</div>
          <PronounceButton
            text={feedback.model_answer}
            language={pronounceLang}
            tone="quiet"
            label={t("rv.hearModel")}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-body text-emerald-900/80 dark:text-emerald-200/80">
            {t("review.altWay")}
            {feedback.alt_answer}
          </div>
          <PronounceButton
            text={feedback.alt_answer}
            language={pronounceLang}
            tone="quiet"
            label={t("rv.hearAlt")}
          />
        </div>
      </div>

      <div className="flex gap-2">
        {round === 1 && (
          <button
            onClick={onRetry}
            className="flex-1 rounded-xl border border-primary/40 bg-primary/5 py-3 text-body font-semibold text-primary"
          >
            <Repeat className="mr-1 inline h-4 w-4" /> {t("review.retryPattern")}
          </button>
        )}
        <button
          // 引数を渡さない。ここは話す側の面で、正誤は `commitAndNext` が
          // 既に数えている(二重に数えない)。
          onClick={() => onNext()}
          className="lift flex-1 rounded-xl bg-primary py-3 text-body font-semibold text-primary-foreground"
        >
          {t("rv.nextArrow")} <ArrowRight className="ml-1 inline h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Light-mode: original 4-choice card (kept for silent situations)
// ============================================================================
/**
 * 4択の答え合わせに出す解説。
 *
 * 目的は「意味が分かった」で終わらせず、**その場で口から出せる形**を持ち帰らせる
 * こと。だから順番は「そのまま言える塊 → 一緒に使う語 → 量詞 → 一言」。
 * 塊は品詞で色分け(ChunkPills)して、単語詳細・添削と同じ色体系で見せる —
 * 同じ色は同じ役割、という感覚が画面をまたいで育つ(apple-design §Consistency)。
 *
 * 下部パネルなので、中身が増えても「次へ」が押せなくならないよう
 * ここだけを高さ上限つきでスクロールさせる。
 */
export function AnswerExplain({ card }: { card: DueReviewCard }) {
  const t = useT();
  const ex = card.explain;
  const chunks = ex?.chunks ?? [];
  const related = ex?.related ?? [];
  const measures = ex?.measures ?? [];
  const note = ex?.note ?? "";

  /**
   * 解説がまだ生成されていない語。**それでも空にしない。**
   *
   * オーナー報告 2026-09-15「復習の時に解説がない」。仕組みは在って呼ばれても
   * いたのに、`explain` も `top_chunk` も無い語では `null` を返していたので、
   * 答え合わせの面が「語 ＋ 読み ＋ 次へ」だけになっていた。**その語について
   * 既に持っている物**（意味・例文）を出せば、空にはならない。
   */
  if (!ex) {
    const hasExample = Boolean(card.example_sentence);
    if (!card.top_chunk && !card.meaning_ja && !hasExample) return null;
    return (
      <div className="mb-1 space-y-1.5">
        {card.top_chunk && (
          <div className="rounded-xl bg-secondary/60 px-3 py-2">
            <ExplainLabel>{t("rv.topChunk")}</ExplainLabel>
            <span lang="zh-Hant" className="ml-2 text-body font-semibold">
              {card.top_chunk.zh}
            </span>
            {card.top_chunk.ja && (
              <span className="ml-2 text-footnote text-muted-foreground">{card.top_chunk.ja}</span>
            )}
          </div>
        )}
        {card.meaning_ja && (
          <div className="rounded-xl bg-secondary/60 px-3 py-2">
            <ExplainLabel>{t("rv.meaning")}</ExplainLabel>
            <span className="ml-2 text-body">{card.meaning_ja}</span>
          </div>
        )}
        {hasExample && (
          <div className="rounded-xl bg-secondary/60 px-3 py-2">
            <ExplainLabel tone="indigo">{t("rv.example")}</ExplainLabel>
            <Term lang={card.language} className="mt-1 block text-body font-medium">
              {card.example_sentence}
            </Term>
            {card.example_translation && (
              <span className="mt-0.5 block text-footnote text-muted-foreground">
                {card.example_translation}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-1 max-h-[38vh] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
      {chunks.length > 0 && (
        <section className="rounded-xl bg-secondary/60 px-3 py-2">
          <ExplainLabel>{t("rv.topChunk")}</ExplainLabel>
          <div className="mt-1.5 space-y-1.5">
            {chunks.map((c, i) => (
              <div key={i}>
                <ChunkPills parts={c.parts} size="md" lang={card.language} />
                {c.ja && <p className="mt-0.5 text-caption text-muted-foreground">{c.ja}</p>}
              </div>
            ))}
          </div>
          <ChunkLegend parts={chunks.flatMap((c) => c.parts)} />
        </section>
      )}

      {related.length > 0 && (
        <section className="rounded-xl bg-indigo-50 px-3 py-2 dark:bg-indigo-500/10">
          <ExplainLabel tone="indigo">{t("rv.relatedWords")}</ExplainLabel>
          <ul className="mt-1 space-y-1">
            {related.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                {/* 類義/反義/関連は色だけでなく**記号と語**でも区別する(§2)。 */}
                <span
                  className={`shrink-0 rounded px-1 text-caption font-bold ${
                    r.kind === "ant"
                      ? "bg-rose-200 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100"
                      : r.kind === "syn"
                        ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/30 dark:text-emerald-100"
                        : "bg-slate-200 text-slate-900 dark:bg-slate-500/30 dark:text-slate-100"
                  }`}
                >
                  {r.kind === "ant"
                    ? t("rv.kindAnt")
                    : r.kind === "syn"
                      ? t("rv.kindSyn")
                      : t("rv.kindRel")}
                </span>
                <span lang="zh-Hant" className="text-body font-semibold">
                  {r.word}
                </span>
                {r.note && <span className="text-caption text-muted-foreground">{r.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {measures.length > 0 && (
        <section className="rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
          <ExplainLabel tone="amber">{t("rv.measureWords")}</ExplainLabel>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {measures.map((m, i) => (
              <span key={i} className="flex items-baseline gap-1.5">
                <span lang="zh-Hant" className="text-body font-semibold">
                  {m.word}
                </span>
                {m.note && <span className="text-caption text-muted-foreground">{m.note}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {note && (
        <section className="rounded-xl bg-teal-50 px-3 py-2 dark:bg-teal-500/10">
          <ExplainLabel tone="teal">{t("rv.goodToKnow")}</ExplainLabel>
          <p className="mt-1 text-footnote leading-relaxed">{note}</p>
        </section>
      )}
    </div>
  );
}

function ExplainLabel({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "indigo" | "amber" | "teal";
}) {
  const color =
    tone === "indigo"
      ? "text-indigo-900 dark:text-indigo-200"
      : tone === "amber"
        ? "text-amber-900 dark:text-amber-200"
        : tone === "teal"
          ? "text-teal-900 dark:text-teal-200"
          : "text-muted-foreground";
  return <span className={`text-caption font-semibold label-caps ${color}`}>{children}</span>;
}

export function LightModeCard({
  card,
  onNext,
  onOpenMemory,
}: {
  card: DueReviewCard;
  onNext: (correct?: boolean) => void;
  onOpenMemory?: () => void;
}) {
  const grade = useServerFn(gradeReview);
  const t = useT();
  const phonetic = usePhoneticPref();
  const pronounce = usePronounce(card.language ?? undefined);
  const photoPref = usePhotoPref();
  /** 4択の表に出す1枚。設定で主役を選んでいれば、そちらを先に見る。 */
  const heroUrl = stickerPhotoUrl(card, { prefer: resolvePrefer(photoPref, "cutout") });
  const [picked, setPicked] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  /**
   * 答え合わせの面が覆う高さ。**測った値を使う。**
   *
   * ここは `h-52`(208px)の決め打ちだった。実際の面は band + 見出し語 +
   * よく使う形 + 「次へ」+ 下端の余白で 270px 前後あるので、
   * **いちばん下の選択肢は送り切っても下敷きのままだった**
   * (検査を足したら「雨傘の発音」が出てこないと出た)。
   * 見比べて覚える場面で、外れの選択肢が読めないのは中身が無いのと同じ。
   *
   * 面の高さは言語や語の長さで変わるので、定数では合わせ続けられない。
   * 実寸を観測して、その分だけ逃げ場を作る。
   */
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = useState(0);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) {
      setPanelH(0);
      return;
    }
    // **`contentRect` は使わない。** あれは内容の箱(padding を含まない)なので、
    // この面が持っている下端の余白(safe-area + 下タブぶんの 4.5rem)が
    // 丸ごと抜け落ちる。抜けた 72px ぶん逃げ場が足りず、いちばん下の
    // 選択肢は下敷きのままだった — 定数をやめて測っても、測る所を
    // 間違えれば同じことになる。実際に覆う高さは外枠の高さ。
    const measure = () => setPanelH(el.getBoundingClientRect().height);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [picked]);
  // 正誤はクライアントで即時判定する。以前はサーバー応答を待つ間
  // `!showResult?.correct` が true になり、正解タップでも一瞬❌が出ていた。
  const correct = picked != null && picked === card.headword;

  function submit(pickedValue: string) {
    if (picked) return;
    setPicked(pickedValue);
    void pronounce(card.headword);
    void grade({
      data: {
        review_id: card.review_id,
        correct: pickedValue === card.headword,
        blur_seen: false,
        response_ms: Date.now() - startedAt.current,
      },
    }).catch(() => toast.error(t("review.gradeFailed")));
  }

  const infos = card.headword_choice_infos?.length
    ? card.headword_choice_infos
    : card.headword_choices.map((h) => ({ headword: h, zhuyin: null, pinyin: null }));

  return (
    <SwipeCard enabled={!!picked} onSwipe={onNext} className="min-h-0 flex-1">
      <article className="isolate flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-3 shadow-lg shadow-primary/10">
        {/* スクロールなしで4択まで見えるコンパクトレイアウト:
          写真は左の小さなサムネにして、問いと選択肢を最初の画面に収める。 */}
        <div className="mb-2 flex items-center justify-between">
          {/* **単語の詳細と同じ青い丸**(オーナー指示 2026-08-28 ⑧
              「復習の4択も含めて、すべて単語の詳細の項目の鮮やかな青い
               丸のアイコンに統一して」)。同じ語について語る面が2つあり、
              片方だけ別の目印の付け方をしていた。 */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pl-1 pr-3 text-caption font-semibold text-foreground">
            <BadgeIcon name={BADGE_ICON_NAME.quiz} size="sm" />
            {t("review.quizTag")}
          </span>
          <CardMemoryBadge card={card} onOpen={onOpenMemory} />
        </div>
        {/* 画像は大きく見せたい / でも4択はスクロールなしで見せたい。
          画面高に連動させ(最大32vh)、小さい端末でも選択肢が隠れない。 */}
        {/* 写真が無いときは**枠ごと出さない**。
            以前は灰色の板に意味を書いていたが、そのすぐ下の問いが
            「『(同じ意味)』はどれ?」なので、**同じ文字が縦に2回**並び、
            画面の3分の1を repeat に使っていた。写真が無いなら、問いが主役。 */}
        {heroUrl && (
          /**
           * **写真は余りを受け取る側。**（オーナー報告 2026-09-16
           * 「復習の4択スクロールしないと4択が全て見れないようになってる」）
           *
           * 前はここが `clamp(5rem, 24vh, 14rem)` の固定の高さで、
           * **画面が低いと写真が先に場所を取り、4つ目が外へ出ていた**
           * （実測: 写真のある札は 800px 未満で必ず溢れ、568px では
           *  1つしか見えなかった）。
           *
           * この画面の仕事は「4つから選ぶ」ことで、写真はその手がかり。
           * 選ぶ物が画面に収まることが先で、写真は**残った分だけ**もらう。
           * `flex-1` ＋ `min-h-0` で縮み切れるようにし、上限だけ置く。
           */
          <div className="quiz-photo mb-1.5 min-h-0 w-full flex-1 overflow-hidden rounded-2xl bg-secondary">
            <CachedImg
              src={heroUrl}
              alt={t("rv.targetAlt")}
              className="h-full w-full object-contain"
            />
          </div>
        )}
        <div className="mb-1.5 shrink-0 text-center">
          <div className="text-body font-semibold leading-snug">
            {t("rv.whichIsBefore")}
            {card.meaning_ja}
            {t("rv.whichIsAfter")}
          </div>
        </div>
        {/**
         * **高さで押し込まない。**（オーナー報告 2026-09-15「単語復習すると
         * 注音が潰れて見える」）
         *
         * ここは `grid-rows-4` で、残りの高さを**4等分に押し込んで**いた。
         * 答え合わせの面が下から出ると札の高さが縮むので、1行ぶんの高さが
         * 2行（語＋注音）より小さくなり、**注音が語に重なって潰れる**。
         * 声調記号（ˇ ˊ）は台湾華語でいちばん間違えやすい所なので、
         * ここが読めないのは実害。
         *
         * オーナー指示「必ずしも選択肢をすべて表示する必要はない」に従い、
         * **1つぶんの高さは中身が決め、入らなければ送る**形にした。
         *
         * ## 余った高さは選択肢どうしで分ける（オーナー指摘 2026-09-16
         * 「復讐の四択の下の余白気になる。下までバランスよく大きさを計算して」）
         *
         * 縦に積むだけだと、選択肢は中身のぶんしか伸びないので、**余りが
         * 全部いちばん下に溜まる**（実測 390×844 で札の中に 292px の空き）。
         *
         * `minmax(3.5rem, 1fr)` の格子にすると、余りは行数で分けられ、かつ
         * **3.5rem より縮むことは絶対に無い**。上の「押し込まない」約束は
         * 守ったまま、余白だけが消える（`repeat(N, 1fr)` に戻すと、また
         * 注音が潰れる）。入り切らない回はこれまでどおり送れる。
         *
         * **上限は置かない。** 一度 `5.5rem` で頭を止めてみたが、写真の無い
         * 語（文字で入れた語）ではその上限ぶんがそのまま下の空きに戻り、
         * 932px の画面で 236px 空いた — 直したかった物がそのまま残る。
         * 写真がある回は上の枠が先に取る（`24vh`）ので、選択肢だけが
         * 伸びすぎることはない。
         */}
        <ul
          className="grid min-h-0 gap-1.5 overflow-y-auto overscroll-contain"
          style={{ gridTemplateRows: `repeat(${infos.length}, minmax(3rem, 4.25rem))` }}
        >
          {infos.map((info) => {
            const c = info.headword;
            const isAnswer = c === card.headword;
            const isPicked = picked === c;
            const showGreen = picked != null && isAnswer;
            const showRed = isPicked && !isAnswer;
            // **学習言語に在る表記だけ**(オーナー報告 2026-08-26)。
            // `pickReading` は台湾華語の決め打ちだったので、英語の4択にも
            // 注音・拼音が出ていた。
            const reading = pickReadingOf(targetProfile(card.language), phonetic, {
              zhuyin: info.zhuyin,
              pinyin: info.pinyin,
            });
            // `scroll-mb-56` — 答え合わせの面は画面下端に貼り付くので、
            // 鍵盤で送ってきた焦点がその**裏に入る**。ブラウザは焦点を
            // 「画面の中」には入れるが、貼り付いた面をよけてはくれない。
            // 下マージンを持たせると、その分だけ上に送ってよけてくれる
            // (検査では、押したあとの発音ボタンが 1.00:1 = 変化なし として
            // 出ていた — 見えていないのだから当然だった)。
            // **箱を右端まで広げ、音声は箱の中**(オーナー指示 2026-09-13)。
            // 以前は選択肢の外に音声ボタンが並んでいたので、選ぶ面が 44px
            // ぶん狭く、しかも「押す物が2つ横に並ぶ」形だった。押す物の中に
            // 押す物は入れられないので、箱は敷いたまま音声だけ上に重ねる。
            return (
              <li key={c} className="relative flex min-h-0 scroll-mb-56 items-stretch">
                <button
                  disabled={!!picked}
                  onClick={() => submit(c)}
                  // `transition-all` は**焦点の輪郭まで遷移させる**。
                  // 押した瞬間の色の変化だけが欲しいのに、輪郭が 0px から
                  // 育つので、鍵盤で送った直後は「どこに居るか見えない」
                  // 状態が続く(検査が実測 1.00:1 で落とした)。
                  // 変えたいものだけ名指しする。
                  className={`flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border py-1 pl-3 pr-[3.75rem] text-left transition-colors
                  ${!picked ? "border-border bg-background hover:border-primary/60 hover:bg-accent/40" : ""}
                  ${showGreen ? "border-ok/60 bg-ok/10" : ""}
                  ${showRed ? "border-bad/60 bg-bad/10" : ""}
                  ${
                    /* **答え合わせの瞬間に、外れた選択肢を薄くしない。**
                        `opacity-50` を掛けていたので、文字が 2.14:1 まで落ち、
                        注音に至っては読めなくなっていた。ここは「捷運はMRTか」と
                        **見比べて覚える**場面で、外れの3つこそ読ませたい。
                        選ばれたものは色と枠で分かるので、薄さは要らない。 */ ""
                  }
                  ${picked && !isPicked && !isAnswer ? "border-border/60" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium">{c}</span>
                    {/* 注音は**装飾ではなく学習対象そのもの**。台湾華語で
                        日本語話者がいちばん間違えるのは声調で、その記号
                        (ˇ ˊ)は 11px の最も薄い階調では判読の瀬戸際だった
                        (独立監査)。一段大きく、一段濃くする。 */}
                    {reading && (
                      <span
                        lang="zh-Hant"
                        className="block truncate text-footnote text-foreground/70"
                      >
                        {reading}
                      </span>
                    )}
                  </span>
                  {showGreen && <Check className="h-4 w-4 shrink-0 text-ok" />}
                  {showRed && <X className="h-4 w-4 shrink-0 text-bad" />}
                </button>
                {/* **鳴らせるようになってから出る**(オーナー指摘 2026-08-26)。
                    4つ並ぶので、押しても鳴らないボタンが並ぶと
                    いちばん壊れて見える。
                    見た目は単語の詳細と同じ**鮮やかな青い丸**に統一
                    (オーナー指示 2026-09-13)。 */}
                <span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center">
                  <span className="pointer-events-auto">
                    <PronounceButton
                      text={c}
                      language={card.language ?? undefined}
                      tone="hero"
                      size="sm"
                      label={t("rv.pronOf", { c })}
                    />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {/* 答え合わせの面が下から覆う分の逃げ場。**これが無いと、覆われた
            選択肢はスクロールしても出てこない** — 見比べて覚える場面で
            外れの選択肢が読めなくなる(薄くするのをやめたのと同じ理由)。 */}
        {picked && <div aria-hidden style={{ height: panelH, flexShrink: 0 }} />}
        {/* 答え合わせ。以前はここが選択肢の下に伸びていき、「次へ」を押すのに
            毎回スクロールが必要だった。画面下部に固定して親指の届く位置に置く
            (apple-design §1 thumb-first / §11)。採点(自然さ n/5)は4択には
            意味がないので出さない。例文は長くて読まれないため、
            「ネイティブが最もよく一緒に使う形」1つに絞る。 */}
        {/* **`document.body` へ出す。ここに置いたままでは画面に貼り付かない。**
            この面は `SwipeCard` の中に在り、`SwipeCard` は指で運ぶために
            `will-change: transform` を立てている。CSS では `transform` と
            同じく `will-change: transform` も **`position: fixed` の基準を
            ビューポートからその要素に変える**。つまりこの面は「画面の下端
            から 4.5rem」ではなく「**カードの下端**から 4.5rem」に置かれ、
            4つ目の選択肢のちょうど上に降りていた(実測: 画面 844px の所で
            面の下端が 772 ではなく 660、4つ目は 436〜507 なので 59px 潜る)。

            しかも `SwipeCard` の `enabled` は `!!picked` なので、
            **答えた瞬間に基準が切り替わる**。押すまでは画面基準で正しく、
            押した瞬間だけ狂うので、絵を並べても原因に辿り着けない
            (roadmap で2回「直した」ことになっているのはこれ)。

            逃げ場(`panelH`)の計算は最初から正しかった。**基準が違った**。 */}
        {picked &&
          createPortal(
            <div
              ref={panelRef}
              className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40"
            >
              {/* 半透明(app-sheet)だと後ろの選択肢が透けて読みにくかった
                  (NORI指定)。答え合わせは**不透明**な面にして、上辺の境界と
                  影で浮いていることを示す。 */}
              <div
                className={`isolate mx-auto max-w-3xl overflow-hidden rounded-t-3xl border-t bg-card px-4 pb-3 shadow-xl ${
                  correct ? "border-ok" : "border-bad"
                }`}
              >
                {/* 正誤は**面で伝える**。以前は 13px の色付き文字だけで、
                    この瞬間の唯一の重要情報がパネル内で**いちばん小さい字**
                    だった(独立監査)。上辺に色の帯を敷き、判定そのものも
                    本文と同じ大きさまで上げる。色が読めない人にも、
                    帯の有無ではなく**文字**で伝わる。 */}
                <div
                  className={`-mx-4 mb-2 px-4 py-1.5 ${correct ? "bg-ok/12" : "bg-bad/12"}`}
                  role="status"
                >
                  <span
                    className={`text-body font-bold ${correct ? "text-ok-ink" : "text-bad-ink"}`}
                  >
                    {correct ? t("review.correct") : t("review.tryAgain")}
                  </span>
                </div>
                {/* 語は**行を分ける**。1行に判定+語+読み+音声を詰めていたので、
                    外したときのラベル(「もう一度覚えよう」)が長い分だけ幅を奪い、
                    **語が「珍珠奶 / 茶」と割れて**いた。中国語を教える画面で
                    語を割るのはいちばんやってはいけない。 */}
                <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5">
                  <Term
                    lang={card.language}
                    className="min-w-0 break-keep text-title font-bold tracking-tight"
                  >
                    {card.headword}
                  </Term>
                  <PronounceButton
                    text={card.headword}
                    language={card.language ?? undefined}
                    className="row-span-2"
                    label={t("card.playPron")}
                  />
                  <Reading
                    lang={card.language ?? undefined}
                    zhuyin={card.reading_zhuyin}
                    pinyin={card.pinyin}
                    className="min-w-0 text-footnote leading-snug text-foreground/70"
                  />
                </div>

                <AnswerExplain card={card} />

                <button
                  // **`onClick={onNext}` と書かない。** クリックの event が
                  // 第1引数に渡り、`correct` として truthy に見えるので、
                  // 不正解も正解として数えられてしまう。
                  onClick={() => onNext(correct)}
                  className="mt-2 min-h-11 w-full rounded-xl bg-primary py-3 text-body font-semibold text-primary-foreground active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  {t("review.next")}
                </button>
              </div>
            </div>,
            document.body,
          )}
      </article>
    </SwipeCard>
  );
}

// ============================================================================
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  CartesianGrid,
} from "recharts";

/**
 * 全体の記憶率(前後2週間)。
 *
 * **過去は記録から作った実際の値**で、未来だけが予測。
 * 以前はここが「いまの状態を過去へ投げ返した線」だったので、
 * 復習した瞬間に過去14日が全部 100% に跳ね上がっていた。
 *
 * その日に**まだ無かった**語しか無い日は `null` が来る — 0% ではないので、
 * 線をそこで切る(`connectNulls` を付けない)。
 */
function MiniRetentionGraph({
  series,
}: {
  series: Array<{ day_offset: number; avg_retention: number | null; counted?: number }>;
}) {
  const t = useT();
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,0.28)" />
          <XAxis
            dataKey="day_offset"
            tickFormatter={(v) => (v === 0 ? t("rv.today") : `${v > 0 ? "+" : ""}${v}d`)}
            stroke="#64748b"
            fontSize={10}
          />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#64748b" fontSize={10} />
          <Tooltip
            formatter={(v) => [v == null ? "—" : `${v}%`, t("rv.avgRetention")]}
            labelFormatter={(l) =>
              l === 0 ? t("rv.today") : t("rv.dayN", { n: `${l > 0 ? "+" : ""}${l}` })
            }
            contentStyle={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(120,130,150,0.28)",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <ReferenceLine x={0} stroke="#2563eb" strokeDasharray="4 4" />
          <ReferenceLine y={80} stroke="#64748b" strokeDasharray="2 4" />
          <Line
            type="monotone"
            dataKey="avg_retention"
            stroke="#2563eb"
            strokeWidth={2.4}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 出す語が無いときの画面。
 *
 * **「今日の分は終わり」と「そもそも出る語が無い」は別物。**
 * 以前はどちらも「今日復習する単語はありません」と出していたので、
 * 期限切れが180枚溜まっていても同じ文面だった。上限に当たったとは
 * 一言も書かれず、上限を上げる導線も無い。図鑑では「全N件のうち…
 * まだ出せていません」と正直に書いているのに、ここだけ「無い」と
 * 言っていた(独立監査の指摘)。
 */
export function EmptyState() {
  const t = useT();
  const capFn = useServerFn(getReviewCapState);
  // 一覧が空だったときにだけ聞く。ふだんは1回も走らない。
  const { data: cap } = useQuery({
    queryKey: ["review-cap"],
    queryFn: () => capFn(),
    staleTime: 60_000,
  });

  if (cap?.capped) {
    return (
      <EmptyStateCard
        icon={CheckCircle2}
        title={t("review.cappedTitle")}
        /**
         * **下の細かい説明文は出さない**（オーナー指示 2026-09-15
         * 「今日の分は終わりです。の下の小さな細かい説明文消して」）。
         * やれることは下のボタンが持っているので、同じことを二度言わない。
         */
        action={
          <Link
            to="/settings"
            className="lift inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
          >
            {t("review.cappedCta")}
          </Link>
        }
      />
    );
  }

  // **図鑑・ホームと同じ部品を使う。** ここだけ左寄せ・角丸2xl・
  // 見出し15pxで、3画面が別々の形をしていた。左寄せにしていたのは
  // 「中央揃えの和文は末尾が孤立する」ためだったが、その原因は
  // `text-balance` + `ja-phrase` で潰してあるので揃えられる。
  return (
    <EmptyStateCard
      icon={CalendarCheck}
      title={t("review.empty")}
      hint={t("review.emptyHint")}
      action={
        <Link
          to="/capture"
          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
        >
          {t("review.goCatch")}
        </Link>
      }
    />
  );
}

/**
 * 復習の見出し — 「今日の復習」・**いま何問目か**・出題の型の切替・進捗バー。
 *
 * ## なぜ切り出したか
 * 検査の場面が**札だけ**を描いていて、この見出しが入っていなかった。
 * その絵を見た独立監査が「クイズに進捗(3/12)が無い」と指摘した —
 * 実物には最初からあるのに。**雛形が実物の一部しか描いていないと、
 * 監査も自分も「無い」と誤って判断する。**
 *
 * ルートに直書きのままでは場面から描けないので、ここへ出す。
 * (復習・ホーム・設定で同じことを何度もやっている。)
 */
/**
 * 見出しの切替の並び。**設定画面と同じ順**にしておく —
 * 同じ選択肢が画面ごとに違う順で出ると、押し間違いを誘う。
 */
const MODE_TABS: ReadonlyArray<{
  id: ReviewModePref;
  labelKey: string;
  titleKey?: string;
}> = [
  { id: "hybrid", labelKey: "review.auto", titleKey: "rv.autoMode" },
  { id: "speaking", labelKey: "review.speak" },
  { id: "choice", labelKey: "review.choice", titleKey: "rv.quietMode" },
];

export function ReviewHeader({
  answered,
  total,
  progress,
  mode,
  onMode,
  reviewStreak,
}: {
  /** 何問終わったか。まだ取得できていなければ null(件数を出さない)。 */
  answered: number | null;
  total: number | null;
  /** 0〜100。 */
  progress: number;
  /** いま選ばれている出題モード。`hybrid` は札ごとに形が変わる。 */
  mode: ReviewModePref;
  onMode: (m: ReviewModePref) => void;
  /**
   * 復習した日が何日続いているか。まだ届いていなければ null。
   * **0 のときは出さない** — 「0日続いている」は続いていないことの遠回しな
   * 言い方で、読む人に何も足さない。
   */
  reviewStreak?: number | null;
}) {
  const t = useT();
  /**
   * **切替は畳んでおく**(オーナー指示 2026-08-26「復習の4択、話す、自動は
   * 単語の項目の順番を選ぶのと同様に右上に表示してたたんで」)。
   *
   * 3つの札が横いっぱいに並んでいて、この画面でいちばん目を引く塊が
   * 「どの形で出すか」になっていた。**開いた理由は復習であって、
   * 形を選ぶことではない。** 単語の詳細の並べ替えと同じ形にする —
   * 右上の小さなボタン、押したときだけ開く。
   */
  const [modeOpen, setModeOpen] = useState(false);
  const current = MODE_TABS.find((m) => m.id === mode);
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <h1 className="text-title font-semibold leading-[1.1] tracking-[-0.02em]">
            {t("review.today")}
          </h1>
          {/* 続いていることは、今日ここを開いた理由そのもの。
              数字は `review_history` を数えたもので、1日の上限と同じ出所。 */}
          {typeof reviewStreak === "number" && reviewStreak > 0 && (
            <p className="mt-0.5 text-footnote text-muted-foreground">
              {t("rv.streakLine", { n: formatCount(reviewStreak) })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          {answered !== null && total !== null && (
            <span className="text-footnote text-muted-foreground">
              {formatCount(answered)} / {formatCount(total)}
            </span>
          )}
          <Link
            to="/wordbooks"
            aria-label={t("wb.openShelf")}
            title={t("wb.openShelf")}
            className="lift-soft grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card text-primary-ink"
          >
            <BookMarked className="h-5 w-5" aria-hidden />
          </Link>
          {/* いま選ばれている形を**名前で**出す。印だけにすると、
              押すまで何が選ばれているのか分からない。
              当たり判定は 44px（`::before` ではなく箱そのもの）。 */}
          <button
            onClick={() => setModeOpen((v) => !v)}
            aria-expanded={modeOpen}
            aria-label={t("rv.modeAria")}
            className={`lift-soft inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-caption font-semibold ${
              modeOpen ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
            }`}
          >
            {current ? t(current.labelKey) : t("rv.modeAria")}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${modeOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {/* **切替は見出しと同じ行に置かない。**
          2つのときは見出しの隣に収まっていたが、3つ目を足した絵では
          「おまか / せ」と札の中で折れ、押し出された見出しまで
          「きょうの復 / 習」と割れた(検査の絵で気づいた)。
          日本語と英語で語の幅が違う以上、**固定幅に賭けない** —
          行を分けて、3つで等分する。

          滑る丸は「今どれか」を**位置で**示すので、札の数と分母を必ず
          一致させる。2つ用の `w-1/2` のまま3つ目を足すと、
          丸が最後の札の半分しか覆わない。 */}
      <div
        hidden={!modeOpen}
        className="relative mt-2 flex rounded-full border border-border bg-secondary p-0.5 text-caption font-semibold"
        role="tablist"
        aria-label={t("rv.modeAria")}
      >
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-0.5 rounded-full bg-background shadow transition-transform duration-200"
          style={{
            width: `calc((100% - 0.25rem) / ${MODE_TABS.length})`,
            transform: `translateX(${MODE_TABS.findIndex((m) => m.id === mode) * 100}%)`,
          }}
        />
        {/* 当たり判定は 44px を下回らせない。この画面の主要な切替なのに、
            雛形が見出しを描いていなかったので**一度も測られていなかった**
            ことがある(実測 72×25px)。 */}
        {MODE_TABS.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => {
              onMode(m.id);
              // 選んだら畳む。開いたままだと、押した結果が見えない。
              setModeOpen(false);
            }}
            title={m.titleKey ? t(m.titleKey) : undefined}
            className={`relative z-10 min-h-11 flex-1 rounded-full px-1 text-center leading-tight transition-colors ${mode === m.id ? "text-foreground" : "text-muted-foreground"}`}
          >
            {t(m.labelKey)}
          </button>
        ))}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </>
  );
}

/**
 * 今日ぶんが終わった面。
 *
 * ## 直した3つ(独立監査)
 * ・**画面が自己矛盾していた。** 「また明日会いましょう」と言った直後に、
 *   唯一の塗りボタンが「もう一度出す」。文章は終わりと言い、ボタンは
 *   まだやれと言っていた。主ボタンは**図鑑へ**、続けるほうは副次に。
 * ・**図鑑へ戻る導線が無かった。** 終わったのに行き先が無い。
 * ・**達成の瞬間に設定の宣伝**が入っていた(録画をONに…)。削除。
 * ・文章は中央揃えをやめる。日本語の中央揃え2行組みは、末尾の1〜2文字が
 *   必ず孤立する(3画面で同じ事故が出ていた)。
 */
export function DoneState({
  onAgain,
  answered = 0,
  correct = 0,
  batch,
}: {
  onAgain: () => void;
  /** この回に答えた数。0 なら成績は出さない(数えていない回)。 */
  answered?: number;
  correct?: number;
  /**
   * **「終わり」と言っていいのかを決める数。**
   *
   * `getDueReviews` は1回に最大10枚しか返さないので、ここに来た理由は
   * 「今日の分が尽きた」とは限らない — **10枚の束を出し切っただけ**の
   * ことが多い。それを区別せずに「今日の復習、終わりました」と出して
   * いたので、上限を無制限にした人にも10枚ごとに同じ文面が出て、
   * 「枚数の設定が効いていない」ようにしか見えなかった(オーナー報告)。
   *
   * **数を props で受ける**のは、ここで問い合わせると検査の雛形が
   * この部品を描けず、3つの分岐のうち1つしか写らないから。実際に
   * 最初はここで `useQuery` していて、**絵の検査は合格したのに
   * 新しい2つの面が1枚も撮られていなかった**。
   */
  batch?: ReviewBatchState;
}) {
  const t = useT();
  const kind = batch ? batchEndKind(batch) : "done";
  const score =
    answered > 0 ? (
      <p className="mt-2 text-title font-semibold">
        {t("review.doneScore", { n: formatCount(answered), c: formatCount(correct) })}
      </p>
    ) : null;
  const toDex = (
    <Link
      to="/dex"
      className="lift inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-body font-semibold text-primary-ink"
    >
      {t("review.toDex")}
    </Link>
  );

  // まだ出せる語がある。**祝わない。** 主ボタンは「続ける」。
  if (kind === "more") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <CheckCircle2 className="mb-2 h-6 w-6 text-ok" aria-hidden />
        <p className="text-body font-semibold">{t("review.moreTitle")}</p>
        {score}
        <p className="mt-1 max-w-[22em] text-body text-muted-foreground">
          {t("review.moreHint", { n: formatCount(batch?.dueRemaining ?? 0) })}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={onAgain}
            className="lift inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
          >
            {t("review.moreCta")}
          </button>
          {toDex}
        </div>
      </div>
    );
  }

  // 自分で決めた上限で止まっている。上げる導線を出す。
  if (kind === "capped") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <CheckCircle2 className="mb-2 h-6 w-6 text-ok" aria-hidden />
        <p className="text-body font-semibold">{t("review.cappedTitle")}</p>
        {score}
        {/* 下の細かい説明文は出さない（オーナー指示 2026-09-15）。
            枚数を変える導線は下のボタンが持っている。 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            to="/settings"
            className="lift inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
          >
            {t("review.cappedCta")}
          </Link>
          {toDex}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      {/* ✨ は多くのアプリで**AI生成の印**として定着しているので、
          達成の印には使わない(独立監査「メタファの衝突」)。
          終わったことを言うのは、輪の中のチェック。 */}
      <CheckCircle2 className="mb-2 h-6 w-6 text-ok" />
      <p className="text-body font-semibold">{t("review.doneTitle")}</p>
      {/* **結果を出す。** 1問ごとの採点はサーバへ送っていたのに、
          画面では捨てていたので「終わりました」以上のことが言えなかった
          (独立監査)。数えていない回(0問)では出さない — 「0問中0問正解」は
          達成ではなく故障に見える。 */}
      {answered > 0 && (
        <p className="mt-2 text-title font-semibold">
          {t("review.doneScore", { n: formatCount(answered), c: formatCount(correct) })}
        </p>
      )}
      <p className="mt-1 max-w-[22em] text-body text-muted-foreground">{t("review.doneHint")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          to="/dex"
          className="lift inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
        >
          {t("review.toDex")}
        </Link>
        <button
          onClick={onAgain}
          className="inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-body font-semibold text-primary-ink"
        >
          {t("review.again")}
        </button>
      </div>
    </div>
  );
}
