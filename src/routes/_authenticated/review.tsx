import { reportBackgroundFailure } from "@/lib/background-failure";
import { REVIEW_PRACTICE_ENABLED } from "@/lib/product-features";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { batchKey, readMark, writeMark, EMPTY_MARK } from "@/lib/review-session";
import { packBatch, readBatch, REVIEW_CACHE_KEY, REVIEW_CACHE_USER_KEY } from "@/lib/review-cache";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { lazyWithRetry } from "@/lib/chunk-reload";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/AppShell";
import { warmCachedImages } from "@/lib/image-cache";
/**
 * 外したときに開く単語の詳細（オーナー指示 2026-09-27「復習で不正解の場合、
 * 単語の詳細に飛べるボタン」）。**画面を移らずに上に重ねる** — 移ると
 * 今日の復習の途中から外れる。重い部品なので、押すまで読み込まない。
 */
const StickerSheet = lazyWithRetry(() =>
  import("@/components/StickerSheet").then((m) => ({ default: m.StickerSheet })),
);
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
  type DueReviewCard,
  type MemoryWord,
  getReviewCapState,
} from "@/lib/reviews.functions";
import { stabilityOf } from "@/lib/srs";
import { levelOfR } from "@/lib/memory-curve";
import { memoryCurveFrom } from "@/lib/memory-curve-from";
/**
 * **グラフは押したときに読み込む**（recharts・lodash・d3 で起動時の JS の約4割。
 * オーナー指示 2026-09-27「アプリを開いてからホームやカメラが出るまでを限界まで速く」）。
 */
const MemoryCurveChart = lazyWithRetry(() =>
  import("@/components/ForgettingCurveChart").then((m) => ({ default: m.MemoryCurveChart })),
);
const MiniRetentionGraph = lazyWithRetry(() =>
  import("@/components/MiniRetentionGraph").then((m) => ({ default: m.MiniRetentionGraph })),
);
import { compareByMemory, memoryOf, MEMORY_LEVELS } from "@/lib/memory";
import { usePhoneticPref, pickReadingOf, Reading, neutralReadings } from "@/lib/phonetic";
import { Term } from "@/components/Term";
import { ZhuyinWord } from "@/components/ZhuyinWord";
import { pairZhuyin } from "@/lib/zhuyin-layout";
import { getTargetLang, useTargetLang } from "@/lib/target-lang-pref";
import { wordBelongsToTarget } from "@/lib/language-filter";
import { targetProfile } from "@/lib/target-profile";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { resolvePrefer, usePhotoPref } from "@/lib/photo-pref";
import { ChunkLegend, ChunkLine } from "@/components/ChunkPills";
import { chunkSpeechText, chunkTranslation } from "@/lib/extras";
import { CachedImg } from "@/lib/image-cache";
import { toast } from "sonner";
import { useT, useUiLang } from "@/lib/i18n";
import { formatCount } from "@/lib/count";
import { SwipeCard } from "@/components/SwipeCard";
import { LoadFailed } from "@/components/LoadFailed";
// このファイルには復習用の `EmptyState` が既にあるので別名で受ける。
import { EmptyState as EmptyStateCard } from "@/components/EmptyState";
import { batchEndKind, type ReviewBatchState } from "@/lib/review-batch";
import {
  Eye,
  Sparkles,
  CheckCircle2,
  Check,
  X,
  Brain,
  Video,
  CalendarCheck,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import { tStatic } from "@/lib/i18n";
import { readerMeaning, readerText } from "@/lib/note-language";
import { pickReviewExplain, quizPromptMeaning } from "@/lib/review-explain";
import { useReaderMeaningFor } from "@/lib/reader-meanings";
import {
  useReviewReaderExplanations,
  type ReaderReviewView,
} from "@/lib/use-review-reader-explanations";

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
        content: "自分の写真を見て、4択でその単語を思い出します。",
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
      const batch = readBatch<DueReviewCard>(
        localStorage.getItem(REVIEW_CACHE_KEY),
        localStorage.getItem(REVIEW_CACHE_USER_KEY) ?? "",
        wantedSticker ?? null,
        Date.now(),
      );
      /**
       * **別の学習言語で作った束は出さない**（オーナー報告 2026-09-30
       * 「学習言語台湾華語なのに英語の4択が表示されてる」）。束は最大20時間
       * 端末に残るので、英語から台湾華語へ切り替えた後も英語の4択が出ていた。
       * 判定は `language-filter.ts` の1つだけ（サーバの絞りと同じ規則）。
       */
      /*
       * **見出しの字も見る**（オーナー報告 2026-10-02「拿鐵の繁體中文の4択が
       * 3.5秒出てから英語に替わる」）。「拿鐵」は `language = 'en'` で保存
       * されていたので、言語の列だけの確かめを素通りして束ごと出ていた。
       */
      const target = getTargetLang();
      if (batch && !batch.cards.every((c) => wordBelongsToTarget(c, target))) {
        return null;
      }
      return batch;
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
    enabled: REVIEW_PRACTICE_ENABLED,
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
  const { data: myStats, isPending: myStatsPending } = useQuery({
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
  const { data: memOverview, isPending: memOverviewPending } = useQuery({
    queryKey: ["memory-overview"],
    queryFn: () => fetchMemOverview(),
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
  /**
   * **見えている束は入れ替えない。読み直した束は次の回のために端末へ置く**（R17「復習の
   * 画面を開くと４択が表示され、すぐ消え新しい４択が表示されるバグ」）。
   *
   * 前は書き留めた束が5分より古いと `refetch()` で読み直し、**いま見えている4択を別の
   * 4択に差し替えていた**（開いた瞬間に出た問題が消えて、別の問題が出る）。束は最長20時間
   * 前の物だが、期限の来た語を少し早く・遅く出しても学習は壊れない — 目の前の問題が
   * 入れ替わる方が悪い。読み直した束は端末に書き、次に開いた時に出す。
   */
  /** 次の回に出す束（終えた後・書き留めた束を読み直した後に、裏で用意する）。 */
  const nextBatch = useRef<DueReviewCard[] | null>(null);
  const revalidated = useRef(false);
  useEffect(() => {
    if (revalidated.current || !cachedBatch || wantedSticker) return;
    if (Date.now() - cachedBatch.at <= 5 * 60_000) return;
    revalidated.current = true;
    void fetchDue()
      .then((next) => {
        if (!next?.length) return;
        nextBatch.current = next;
        const uid = localStorage.getItem(REVIEW_CACHE_USER_KEY);
        const packed = uid ? packBatch(next, uid, null, Date.now()) : null;
        if (packed) localStorage.setItem(REVIEW_CACHE_KEY, JSON.stringify(packed));
        void warmCachedImages(next.flatMap((c) => [stickerPhotoUrl(c, { prefer: "cutout" })]));
      })
      .catch(() => undefined);
  }, [cachedBatch, wantedSticker, fetchDue]);
  // 進んだら憶える。**アプリを閉じても消えない**(`localStorage`、束と同じ4時間)。
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
  const current: DueReviewCard | undefined = cards?.[idx];
  /**
   * その人向けの解説（単語の詳細と同じ行）。表示言語が英語・繁體中文で、語の意味が別の言語で
   * 作られていたとき、問いの意味と答え合わせの訳をこちらから出す（オーナー報告 2026-10-02）。
   */
  const readerViews = useReviewReaderExplanations(cards, idx, REVIEW_PRACTICE_ENABLED);
  const done = cards && idx >= cards.length;

  /**
   * **束の写真を、届いた時点で全部端末へ**（`warmCachedImages`）。
   * 音は下の `usePrefetchSpeech` が同じことをしている。
   */
  useEffect(() => {
    if (!cards?.length) return;
    void warmCachedImages(
      cards.flatMap((c) => [
        stickerPhotoUrl(c, { prefer: "cutout" }),
        stickerPhotoUrl(c, { prefer: "photo" }),
      ]),
    );
  }, [cards]);

  /**
   * **束を終えたら、次の束をすぐ裏で用意して端末に書き留める**（オーナー指示
   * 2026-09-27「復習のラグを無くす。復習が終わるたびに次の問題を自動保存し、
   * アプリを閉じてもすぐ表示」）。
   *
   * 最後の採点が書き込まれるのを少し待ってから読む（待たないと、いま答えた
   * 札がまた出る）。届いた束は `localStorage` に書き、写真も端末へ落とす。
   * 「もう一度」を押したときは読み直さずにこれを出す — 待ち時間 0。
   * アプリを閉じて次に開いたときも、この束から始まる。
   */
  useEffect(() => {
    if (!done || wantedSticker) return;
    let off = false;
    const timer = window.setTimeout(() => {
      void fetchDue()
        .then((next) => {
          if (off || !next?.length) return;
          nextBatch.current = next;
          try {
            const uid = localStorage.getItem(REVIEW_CACHE_USER_KEY);
            const packed = uid ? packBatch(next, uid, null, Date.now()) : null;
            if (packed) localStorage.setItem(REVIEW_CACHE_KEY, JSON.stringify(packed));
          } catch {
            /* 書けなくても「もう一度」で読み直すだけ */
          }
          void warmCachedImages(next.flatMap((c) => [stickerPhotoUrl(c, { prefer: "cutout" })]));
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      off = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, wantedSticker]);

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

  const progress = useMemo(() => {
    if (!cards?.length) return 0;
    return Math.round((idx / cards.length) * 100);
  }, [cards, idx]);

  return (
    <AppShell
      title={t("title.review")}
      headerless
      fixedViewport={
        REVIEW_PRACTICE_ENABLED && !!current && !memListOpen && !done && !isLoading && !isError
      }
    >
      <ReviewSessionHeader
        compact={!!current && !memListOpen}
        header={{
          progress: REVIEW_PRACTICE_ENABLED ? progress : 0,
          reviewStreak: myStats?.review_streak ?? null,
          streakPending: myStatsPending,
        }}
        memOverview={memOverview}
        memPending={memOverviewPending}
        memListOpen={memListOpen}
        onToggle={() => {
          if (!memListOpen) refreshMemory();
          setMemListOpen((v) => !v);
        }}
        onOpenWord={setMemModal}
        series={memStats?.series}
        practiceEnabled={REVIEW_PRACTICE_ENABLED}
      />

      {!REVIEW_PRACTICE_ENABLED ? null : isLoading ? (
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
            // 用意しておいた次の束があれば、**読み直さずに**そのまま出す。
            const next = nextBatch.current;
            nextBatch.current = null;
            if (next?.length) {
              qc.setQueryData(["reviews-due", null], next);
              return;
            }
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
          <ReviewQuestion
            card={current}
            onNext={advance}
            reader={readerViews.get(current.word_id)}
          />
        </>
      ) : null}

      {memModal && <ForgettingCurveModal word={memModal} onClose={() => setMemModal(null)} />}
    </AppShell>
  );
}

/** Shared review header, progress, memory overview and expanded list. */
export function ReviewSessionHeader({
  header,
  memOverview,
  memListOpen,
  onToggle,
  onOpenWord,
  series,
  compact,
  practiceEnabled = true,
  memPending = false,
}: {
  header: React.ComponentProps<typeof ReviewHeader>;
  memOverview?: React.ComponentProps<typeof MemoryOverviewPanel>["overview"];
  /** 記憶の帯を読み込み中（同じ高さの空の帯で場所を取っておく）。 */
  memPending?: boolean;
  memListOpen: boolean;
  onToggle: () => void;
  onOpenWord: (word: MemoryWord) => void;
  series?: React.ComponentProps<typeof MiniRetentionGraph>["series"];
  compact: boolean;
  practiceEnabled?: boolean;
}) {
  const t = useT();
  return (
    <section className={`${compact ? "mb-2" : "mb-4"} shrink-0`}>
      <ReviewHeader {...header} />
      {/* 記憶レベルの全体サマリー: 開いた瞬間に色分けと件数が見え、
            バーをタップすると単語ごとの状態リストが開く(下部の別ブロックは廃止)。
            帯自体は28pxしかないので、見た目は変えずに before で指の当たり判定
            だけを上下に広げ、44pxの下限を満たす。 */}
      {/* **読み込み中も帯の場所を取っておく**（オーナー報告 2026-09-29「復習のページを開いた
          瞬間、画像の大きさが変化するバグ」）。下の写真は残りの高さをもらう作りなので、帯が
          後から現れると、その分だけ写真が縮んで見えていた。同じ部品の空の帯を先に置く。 */}
      {memPending && !memOverview && (
        <div aria-hidden className="pointer-events-none opacity-60">
          <MemoryLevelSummary words={[]} expanded={false} />
        </div>
      )}
      {memOverview && memOverview.words.length > 0 && (
        <>
          <button
            onClick={onToggle}
            aria-expanded={memListOpen}
            className="relative w-full text-left before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
          >
            <MemoryLevelSummary words={memOverview.words} expanded={memListOpen} />
          </button>
          {(memListOpen || !practiceEnabled) && (
            <div className="mt-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <MemoryOverviewPanel overview={memOverview} onOpenWord={onOpenWord} />
              <div className="mt-3 border-t border-border pt-2">
                <p className="mb-1 text-caption font-semibold label-caps text-muted-foreground">
                  {t("rv.overallTitle")}
                </p>
                {series && (
                  <Suspense fallback={<div className="h-44 w-full" />}>
                    <MiniRetentionGraph series={series} />
                  </Suspense>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** One question and memory-detail interaction, shared with local first-catch data. */
export function ReviewQuestion({
  card,
  onNext,
  practice = false,
  reader,
}: {
  card: DueReviewCard;
  onNext: (correct?: boolean) => void;
  practice?: boolean;
  /** その人向けの解説（`useReviewReaderExplanations`）。 */
  reader?: ReaderReviewView;
}) {
  const [memoryOpen, setMemoryOpen] = useState(false);
  return (
    <>
      <LightModeCard
        key={card.review_id}
        card={card}
        onNext={onNext}
        onOpenMemory={() => setMemoryOpen(true)}
        practice={practice}
        reader={reader}
      />
      {memoryOpen && (
        <ForgettingCurveModal
          word={memWordOf(card)}
          local={practice}
          onClose={() => setMemoryOpen(false)}
        />
      )}
    </>
  );
}

// ---- 記憶ビジュアライズ(6段階レベル: src/lib/memory.ts) ----------------------

/** 出題中カードから忘却曲線モーダル用の MemoryWord を組み立てる。 */
export function memWordOf(card: DueReviewCard): MemoryWord {
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
    // **安定度の式は1か所（`lib/srs.ts`）。** ここに写すと、狙いの定着度を
    // 変えたときにこの画面だけ古い式で動く。
    stability_days: stabilityOf(card.interval_days, card.ease),
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
    (lv) => words.filter((w) => memoryOf(w).level.level === lv.level).length,
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
        {/* **畳んでいる間、この帯には読む字が1つも無い。** 色だけが
            意味を担うので、色を見分けられない人と声の案内には何も届かず、
            包んでいるボタンの名前も空だった(「ボタン」としか読まれない)。
            目に見える形は変えずに、同じ中身を字でも置く。 */}
        {!expanded && (
          <span className="sr-only">
            {t("review.memoryBreakdown")}:{" "}
            {MEMORY_LEVELS.map((lv, i) => (counts[i] > 0 ? `${t(lv.labelKey)} ${counts[i]}` : null))
              .filter(Boolean)
              .join("、")}
          </span>
        )}
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
  const { level: lv, percent } = memoryOf(card);
  return (
    <button
      onClick={onOpen}
      aria-label={`${t(lv.labelKey)} ${percent}%`}
      // 見た目は小さな印のままでいい(カードの隅の飾りなので、44px の塊に
      // すると主役の写真より重くなる)。**当たり判定だけ広げる。**
      // 実寸は 82x19 で、指の下限を割っていた。
      className={`relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${lv.chip} before:absolute before:-inset-y-3 before:-inset-x-2 before:content-[''] active:scale-95`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${lv.bar}`} />
      {/* **段の色と % だけ**（オーナー指示 2026-09-22「画像の右上の記憶の
          状態はその色と数字だけでいい」）。図鑑の印と同じ形・同じ数
          （`MemoryBadge` / `memoryOf`）。段の名前は読み上げにだけ残す
          （上の `aria-label`）。 */}
      <span className="tabular-nums">{percent}%</span>
    </button>
  );
}

/**
 * 記憶の一覧。**オーナーが「%が逆転している」と言った画面そのもの。**
 *
 * `export` にしたのは検査の雛形から描くため。ここまで雛形にあったのは
 * 上の帯（`MemoryLevelSummary`）だけで、**一覧は一度も絵に映っていなかった** —
 * 逆転が起きていたのはこの一覧の側なので、見ていない所で起きていたことになる。
 */
export function MemoryOverviewPanel({
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
          /**
           * **バーも数字も段も、同じ1つの数から出す**（`lib/memory.ts` の
           * `memoryOf` ＝ いま思い出せる確率）。写真の右上・忘却曲線の縦軸と
           * 同じ数（オーナー指示 2026-09-23「単語の数値は1つに統一したい」）。
           */
          const { level: lv, percent } = memoryOf(w);
          return (
            <li key={w.sticker_id}>
              <button
                onClick={() => onOpenWord(w)}
                /**
                 * **行の高さは 44px を割らない**（HIG §11 / 絵の検査で発覚）。
                 *
                 * ここは実測 358×32 だった。一覧は**この画面でいちばん押される
                 * 所**（押すと忘却曲線が開く）なのに、指の下限を 12px 割って
                 * いた。雛形に一覧が無かったので、一度も測られていなかった。
                 */
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary/60"
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
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className={`w-9 shrink-0 text-right text-caption font-semibold ${lv.text}`}>
                  {percent}%
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

export function ForgettingCurveModal({
  word,
  onClose,
  local = false,
}: {
  word: MemoryWord;
  onClose: () => void;
  local?: boolean;
}) {
  const histFn = useServerFn(getStickerMemoryHistory);
  const { data } = useQuery({
    queryKey: ["sticker-memory", word.sticker_id],
    queryFn: () => histFn({ data: { sticker_id: word.sticker_id } }),
    enabled: !local,
    staleTime: 60_000,
  });
  const t = useT();
  const { level: lv, percent } = memoryOf(word);

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
   * **履歴は必ず待つ。** 以前は `repetitions > 0` の語だけ待っていたが、
   * `repetitions` は「続けて正解した回数」で、**一度間違えると 0 に戻る**。
   * 履歴があるのに待たずに「未復習」の線を出してしまう語が残っていた。
   * 問い合わせはふつう一瞬で届き、その間は同じ高さの面を出しておく。
   */
  const ready = local || data != null;

  /**
   * 曲線の形は `memoryCurveFrom`（図鑑の詳細と同じ関数）。
   * 以前はここに別の計算があり、**直近45日で切って日単位に丸めていた**
   * ので、「復習5回なのに点が2つ」になっていた（オーナー指摘 2026-09-22）。
   */
  const nowMs = useMemo(() => Date.now(), []);
  const curve = useMemo(
    () =>
      memoryCurveFrom(
        {
          history: data?.history ?? [],
          takenAt: data?.taken_at ?? (local ? word.anchor_at : null),
          lastReviewedAt: data?.current?.last_reviewed_at ?? null,
          currentEase: data?.current?.ease ?? word.ease,
          currentIntervalDays: data?.current?.interval_days ?? word.interval_days,
          stabilityDays: word.stability_days,
        },
        nowMs,
      ),
    [data, word, nowMs, local],
  );
  /**
   * 「復習 N 回」は**実際に復習した回数**（履歴の行数）。
   * 以前は SM-2 の `repetitions`（**続けて正解した**回数）を出していたので、
   * 一度間違えると数が戻り、グラフの点の数と合わなかった。
   */
  const reviewCount = data ? data.history.length : word.repetitions;

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
            {t(lv.labelKey)} · {percent}%
          </span>
          <span className="text-muted-foreground">
            {t("memory.reviews")} <b className="text-foreground">{reviewCount}</b>{" "}
            {t("memory.times")}
          </span>
        </div>

        {!ready ? (
          // 待っている間。**間違った形の線を出すくらいなら、線を出さない。**
          // 枠の高さは同じにして、届いた時に面が跳ねないようにする。
          <div
            className="h-72 w-full animate-pulse rounded-xl bg-secondary/60"
            role="status"
            aria-label={t("common.loading")}
          />
        ) : curve ? (
          <Suspense
            fallback={<div className="h-72 w-full animate-pulse rounded-xl bg-secondary/60" />}
          >
            <MemoryCurveChart
              curve={curve}
              nowMs={nowMs}
              stickerId={word.sticker_id}
              onReview={onClose}
            />
          </Suspense>
        ) : (
          <p className="py-8 text-center text-footnote text-muted-foreground">
            {t("review.memoryLoading")}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 4択の札
// ============================================================================
/**
 * 4択の答え合わせに出す解説。
 *
 * 目的は「意味が分かった」で終わらせず、**その場で口から出せる形**を持ち帰らせる
 * こと。だから順番は「そのまま言える塊 → 一緒に使う語 → 量詞 → 一言」。
 * 塊は品詞で色分け(ChunkPills)して、単語詳細と同じ色体系で見せる —
 * 同じ色は同じ役割、という感覚が画面をまたいで育つ(apple-design §Consistency)。
 *
 * 下部パネルなので、中身が増えても「次へ」が押せなくならないよう
 * ここだけを高さ上限つきでスクロールさせる。
 */
export function AnswerExplain({
  card,
  meaning,
}: {
  card: DueReviewCard;
  /**
   * 読む人の言語の意味（4択の問いと同じ物 — `quizPromptMeaning`）。渡さなければ共有の意味を
   * 読む人の言語のときだけ出す（英語・繁體中文の人に日本語の意味を出さない。2026-10-02）。
   */
  meaning?: string;
}) {
  const t = useT();
  const uiLang = useUiLang();
  const ex = card.explain;
  const shownMeaning = meaning ?? readerMeaning(card.meaning_ja, uiLang);
  // よく使う形の訳も読む人の言語の物だけ（古い語は作った日の言語のまま残っている）。
  const topChunkGloss = readerMeaning(card.top_chunk?.ja, uiLang);
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
    if (!card.top_chunk && !shownMeaning && !hasExample) return null;
    return (
      <div className="mb-1 space-y-1.5">
        {card.top_chunk && (
          <div className="rounded-xl bg-secondary/60 px-3 py-2">
            <ExplainLabel>{t("rv.topChunk")}</ExplainLabel>
            <span lang="zh-Hant" className="ml-2 text-body font-semibold">
              {card.top_chunk.zh}
            </span>
            {topChunkGloss && (
              <span className="ml-2 text-footnote text-muted-foreground">{topChunkGloss}</span>
            )}
          </div>
        )}
        {shownMeaning && (
          <div className="rounded-xl bg-secondary/60 px-3 py-2">
            <ExplainLabel>{t("rv.meaning")}</ExplainLabel>
            <span className="ml-2 text-body">{shownMeaning}</span>
          </div>
        )}
        {hasExample && (
          <div className="rounded-xl bg-secondary/60 px-3 py-2">
            <ExplainLabel tone="indigo">{t("rv.example")}</ExplainLabel>
            <Term lang={card.language} className="mt-1 block text-body font-medium">
              {card.example_sentence}
            </Term>
            {readerText(card.example_translation, uiLang, card.example_sentence) && (
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
            {/* 単語の詳細のチャンクと**同じ部品**（`ChunkLine`、オーナー指示 2026-09-24）。 */}
            {chunks.map((c, i) => (
              <ChunkLine
                key={i}
                parts={c.parts}
                translation={chunkTranslation(c.ja)}
                lang={card.language}
                headword={card.headword}
                speakText={chunkSpeechText(c, card.language)}
              />
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
  practice = false,
  reader,
}: {
  card: DueReviewCard;
  onNext: (correct?: boolean) => void;
  onOpenMemory?: () => void;
  /** Local first-run exercise: never writes a scheduled review. */
  practice?: boolean;
  /** その人向けの解説（単語の詳細と同じ行。`useReviewReaderExplanations`）。 */
  reader?: ReaderReviewView;
}) {
  const grade = useServerFn(gradeReview);
  const t = useT();
  const uiLang = useUiLang();
  /**
   * 問いの「」に入れる意味（オーナー報告 2026-10-02、絵つき「Which one means
   * “グラタンマカロニ”?」— 英語・繁體中文の表示で日本語の意味が出ていた）。
   * 共有の意味が読む人の言語ならそのまま（日本語の表示は今と同じ）、違えばその人向けの
   * 解説の意味 → 図鑑と同じ覚え置き（無ければ埋めに行く）。どれも無ければ写真で問う。
   */
  // 共有の意味が読む人の言語なら引かない（日本語の表示で日本語の語は、今と同じく問い合わせない）。
  const sharedFits = !!readerMeaning(card.meaning_ja, uiLang).trim();
  const cachedMeaning = useReaderMeaningFor(
    practice || sharedFits ? null : card.word_id,
    uiLang,
    card.meaning_ja,
  );
  const promptMeaning = quizPromptMeaning({
    shared: card.meaning_ja,
    headword: card.headword,
    explanation: reader?.meaning,
    cached: cachedMeaning,
    lang: uiLang,
  });
  /** 答え合わせに出す解説。その人向けの解説に中身があればそちら（`pickReviewExplain`）。 */
  const answerCard: DueReviewCard = {
    ...card,
    explain: pickReviewExplain(card.explain, reader?.explain),
  };
  const phonetic = usePhoneticPref();
  /** 注音を字の右に縦に組むか（注音を選んでいて、学習言語に注音があるとき）。 */
  const zhuyinBeside =
    phonetic === "zhuyin" && targetProfile(card.language).readings.includes("zhuyin");
  const answerUnits = zhuyinBeside ? pairZhuyin(card.headword, card.reading_zhuyin) : null;
  const pronounce = usePronounce(card.language ?? undefined);
  const photoPref = usePhotoPref();
  /** 4択の表に出す1枚。設定で主役を選んでいれば、そちらを先に見る。 */
  const heroUrl = stickerPhotoUrl(card, { prefer: resolvePrefer(photoPref, "cutout") });
  /**
   * 写真も読む人の言語の意味も無い札は、写真で問うこともできない（文字で入れた語）。
   * そのときだけ共有の意味をそのまま出す — 問題として成り立たないよりはまし。
   */
  const promptText = promptMeaning || (heroUrl ? "" : card.meaning_ja);
  const [picked, setPicked] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
    if (practice) return;
    void grade({
      data: {
        review_id: card.review_id,
        correct: pickedValue === card.headword,
        blur_seen: false,
        response_ms: Date.now() - startedAt.current,
      },
    }).catch((e: unknown) => {
      toast.error(t("review.gradeFailed"));
      reportBackgroundFailure("review_grade", e, { mode: "choice" });
    });
  }

  const infos = card.headword_choice_infos?.length
    ? card.headword_choice_infos
    : card.headword_choices.map((h) => ({ headword: h, zhuyin: null, pinyin: null }));

  return (
    <SwipeCard enabled={!!picked} onSwipe={onNext} className="min-h-0 flex-1">
      {/* `data-tour` はチュートリアルの案内が指す印。本物の部品の上に置くので、
          チュートリアル側で包み直す必要が無い（包むと並び方が本物と変わる）。 */}
      <article
        data-tour="review-question"
        className="isolate flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-3 shadow-lg shadow-primary/10"
      >
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
        <div className="mb-1.5 shrink-0 text-center" data-tour="review-prompt">
          <div className="text-body font-semibold leading-snug">
            {promptText ? (
              <>
                {t("rv.whichIsBefore")}
                {promptText}
                {t("rv.whichIsAfter")}
              </>
            ) : (
              t("rv.whichIsThis")
            )}
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
          data-tour="review-choices"
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
            // 選択肢の読みは「読み1・読み2」の2列で来る（英語なら米・英の IPA）。
            // 学習言語の表記へ割り当ててから選ぶ — 注音の鍵のまま渡すと、
            // 英語の語の IPA が「注音」として扱われていた。
            const reading = pickReadingOf(targetProfile(card.language), phonetic, {
              zhuyin: info.zhuyin,
              pinyin: info.pinyin,
              ...neutralReadings(card.language, info.zhuyin, info.pinyin),
            });
            // 注音は**字の右に縦に**（オーナー指示 2026-09-27）。組めない語は下の行。
            const units = zhuyinBeside ? pairZhuyin(c, info.zhuyin) : null;
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
                  className={`quiz-choice relative flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border-[1.5px] px-[3.75rem] py-2 text-center transition-colors
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
                  {/* **語は箱の真ん中に**（オーナー指示 2026-09-27「4択の単語は
                      中央揃え」）。右の発音ボタンと同じ幅を左にも空けて
                      （`px-[3.75rem]`）、見た目の中心と箱の中心を合わせる。
                      正誤の印は左の空きに置く。 */}
                  <span className="flex min-w-0 flex-col items-center">
                    {/* **その語の字で組む**（`Term`）。候補の画面と同じ書体になる
                        — 以前は画面の言語（日本語）の書体で繁体字を出していた。 */}
                    {units ? (
                      // **字と注音の大きさの比は、単語の詳細の見出しと同じ**（オーナー指示
                      // 2026-09-27、絵つき）。見出しは 32px の字に 0.36 倍の注音。4択も
                      // 同じ 32px（長い語は 26px）にして、注音の下限（11px）を外し、比を揃える。
                      <ZhuyinWord
                        units={units}
                        lang={card.language}
                        className={`zy-word--balanced block font-semibold ${
                          units.length > 4 ? "text-[26px]" : "text-hero"
                        }`}
                      />
                    ) : (
                      <Term
                        lang={card.language}
                        className="block max-w-full truncate text-title font-semibold"
                      >
                        {c}
                      </Term>
                    )}
                    {/* 注音は**装飾ではなく学習対象そのもの**。台湾華語で
                        日本語話者がいちばん間違えるのは声調で、その記号
                        (ˇ ˊ)は 11px の最も薄い階調では判読の瀬戸際だった
                        (独立監査)。一段大きく、一段濃くする。 */}
                    {reading && !units && (
                      <span
                        lang="zh-Hant"
                        className="block truncate text-footnote text-foreground/70"
                      >
                        {reading}
                      </span>
                    )}
                  </span>
                  {showGreen && (
                    <Check className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ok" />
                  )}
                  {showRed && (
                    <X className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-bad" />
                  )}
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
              data-tour="review-answer"
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
                  {answerUnits ? (
                    <ZhuyinWord
                      units={answerUnits}
                      lang={card.language}
                      className="min-w-0 text-title font-bold tracking-tight"
                    />
                  ) : (
                    <Term
                      lang={card.language}
                      className="min-w-0 break-keep text-title font-bold tracking-tight"
                    >
                      {card.headword}
                    </Term>
                  )}
                  <PronounceButton
                    text={card.headword}
                    language={card.language ?? undefined}
                    className="row-span-2"
                    label={t("card.playPron")}
                  />
                  {!answerUnits && (
                    <Reading
                      lang={card.language ?? undefined}
                      zhuyin={card.reading_zhuyin}
                      pinyin={card.pinyin}
                      className="min-w-0 text-footnote leading-snug text-foreground/70"
                    />
                  )}
                </div>

                <AnswerExplain card={answerCard} meaning={promptMeaning} />

                <div className="mt-2 flex gap-2">
                  {/* **図鑑のその語へ**（オーナー指示 2026-09-28「復習の4択の正解、不正解の欄に
                      図鑑の該当の単語に飛べるボタンをつける」）。前は外したときだけ出していた。
                      当てたときも見返したい語はある。図鑑の詳細を上に重ねて開くので、閉じれば
                      ここ（次へ）に戻る — 復習の流れは切らない。 */}
                  <button
                    type="button"
                    onClick={() => setDetailOpen(true)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-3 text-body font-semibold text-foreground active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    <BookOpen className="h-4 w-4 text-primary" aria-hidden />
                    {t("review.openInDex")}
                  </button>
                  <button
                    // **`onClick={onNext}` と書かない。** クリックの event が
                    // 第1引数に渡り、`correct` として truthy に見えるので、
                    // 不正解も正解として数えられてしまう。
                    onClick={() => onNext(correct)}
                    data-tour="review-next"
                    className="min-h-11 flex-1 rounded-xl bg-primary py-3 text-body font-semibold text-primary-foreground active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    {t("review.next")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
        {/* 答え合わせの面と同じ理由で `document.body` へ出す（`SwipeCard` の
            `will-change: transform` の中では全画面に広がらない）。 */}
        {detailOpen &&
          createPortal(
            <Suspense fallback={null}>
              <StickerSheet stickerId={card.sticker_id} onClose={() => setDetailOpen(false)} />
            </Suspense>,
            document.body,
          )}
      </article>
    </SwipeCard>
  );
}

// ============================================================================

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
 * 復習の見出し — 「今日の復習」・続いている日数・進捗バー。
 *
 * ## なぜ切り出したか
 * 検査の場面が**札だけ**を描いていて、この見出しが入っていなかった。
 * その絵を見た独立監査が「クイズに進捗が無い」と指摘した —
 * 実物には最初からあるのに。**雛形が実物の一部しか描いていないと、
 * 監査も自分も「無い」と誤って判断する。**
 *
 * ルートに直書きのままでは場面から描けないので、ここへ出す。
 * (復習・ホーム・設定で同じことを何度もやっている。)
 *
 * **数は出さない**（オーナー指示 2026-10-02「今日覚えるべき単語などの数字を出すと、
 * やるべきことがたまった時にやる気がなくなるから出さない」）。以前ここにあった
 * 「0 / 10」は束の残りを数えて見せる数字そのもの。進み具合はバーだけで示す。
 */
export function ReviewHeader({
  progress,
  reviewStreak,
  streakPending = false,
}: {
  /** 0〜100。 */
  progress: number;
  /**
   * 復習した日が何日続いているか。まだ届いていなければ null。
   * **0 のときは出さない** — 「0日続いている」は続いていないことの遠回しな
   * 言い方で、読む人に何も足さない。
   */
  reviewStreak?: number | null;
  /** 続いた日数を読み込み中（行の高さを取っておく — 後から現れると下の写真が縮む）。 */
  streakPending?: boolean;
}) {
  const t = useT();
  // 一度でも「読み込み中」で場所を取ったら、0日と分かっても畳まない（畳むと写真が伸び縮みする）。
  const streakReserved = useRef(false);
  if (streakPending) streakReserved.current = true;
  return (
    <>
      <div className="min-w-0">
        <h1 className="text-title font-semibold leading-[1.1] tracking-[-0.02em]">
          {t("review.today")}
        </h1>
        {/* 続いていることは、今日ここを開いた理由そのもの。
            数字は `review_history` を数えたもので、1日の上限と同じ出所。 */}
        {typeof reviewStreak === "number" && reviewStreak > 0 ? (
          <p className="mt-0.5 text-footnote text-muted-foreground">
            {t("rv.streakLine", { n: formatCount(reviewStreak) })}
          </p>
        ) : (
          streakReserved.current && (
            <p aria-hidden className="mt-0.5 text-footnote text-transparent">
              &nbsp;
            </p>
          )
        )}
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
        {/* **残りの数は言わない**（オーナー指示 2026-10-02「やるべきことがたまった時に
            やる気がなくなるから」）。「まだある」とだけ言い、続けるかは本人が決める。
            `dueRemaining` は言い方の分岐（`batchEndKind`）にだけ使う。 */}
        <p className="mt-1 max-w-[22em] text-body text-muted-foreground">{t("review.moreHint")}</p>
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
