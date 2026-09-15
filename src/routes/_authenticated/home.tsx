import { JIGGLE, jiggleStyle, LIFTED, type AlbumSize as LibAlbumSize } from "@/lib/album-drag";
import {
  ALBUM_ASPECT,
  applyDelta,
  gestureDelta,
  placementFrom,
  settle,
  sizePx,
  type Grip as FingerGrip,
  type Placement,
  type Pt,
} from "@/lib/album-place";
import { haptic } from "@/lib/haptics";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DayJournalPage } from "@/components/DayJournalPage";
import { JournalWritingPage } from "@/components/JournalWritingPage";
import { groupBySpan, keyToDate } from "@/lib/album-span";
import { JournalComposer } from "@/components/JournalComposer";
import { listJournal } from "@/lib/journal.functions";
import { resolvePrefer, usePhotoPref } from "@/lib/photo-pref";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { resolveSurfaceRole, surfaceKey, useSurfaceRoleMap } from "@/lib/photo-surface";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import { EmptyState } from "@/components/EmptyState";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers, saveAlbumLayout, type StickerWithWord } from "@/lib/stickers.functions";
import { CachedImg } from "@/lib/image-cache";
import { Term } from "@/components/Term";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listPendingCaptures,
  removePendingCapture,
  type PendingCapture,
} from "@/lib/offline-queue";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookText, Check, Image as ImageIcon, Trash2, WifiOff } from "lucide-react";
import { localeOf, useT } from "@/lib/i18n";
import { formatCount } from "@/lib/count";
import { useUiLang } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";
import { JOURNAL_ENABLED } from "@/lib/features";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: tStatic("page.home") },
      { name: "description", content: "今日キャッチした言葉を一冊のスクラップアルバムに。" },
    ],
  }),
  component: HomePage,
});

function dayKey(d: Date) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD local
}

/** Offline captures waiting for AI analysis (queued in IndexedDB). */
function PendingCapturesBanner() {
  const [pending, setPending] = useState<PendingCapture[]>([]);
  /**
   * 「捨てる」の二段階目。**どの写真に対して構えているか**まで持つ。
   *
   * ただの真偽値にしていたが、この画面は focus / online で一覧を読み直す。
   * 1回目と2回目のタップの間に読み直しが挟まると、構えたのとは別の写真が
   * `pending[0]` に来て、**押した覚えのない写真が消える**。
   */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  useEffect(() => {
    const load = () => {
      void listPendingCaptures().then(setPending);
    };
    load();
    window.addEventListener("online", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("online", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  // 構えたままにしない。
  //
  // 最初これを `onBlur` だけで戻していたが、**iOS の WebKit はタップでは
  // ボタンに焦点を当てない**ので blur が来ず、「本当に捨てる?」の状態が
  // 何時間でも残る。あとで何気なく触った指が、二度と撮れない写真を消す。
  // 時間で戻す。
  useEffect(() => {
    if (!confirmingId) return;
    const t = setTimeout(() => setConfirmingId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmingId]);
  if (pending.length === 0) return null;
  const first = pending[0];
  return (
    <PendingCapturesCard
      pending={pending}
      confirming={confirmingId === first.id}
      onDiscard={() => {
        if (confirmingId !== first.id) {
          setConfirmingId(first.id);
          return;
        }
        void removePendingCapture(first.id).then(() => {
          setConfirmingId(null);
          void listPendingCaptures().then(setPending);
        });
      }}
      onCancelDiscard={() => setConfirmingId(null)}
    />
  );
}

/**
 * 預かり中の写真の帯(見た目だけ)。
 *
 * 状態(IndexedDB の読み直し・二段階の「捨てる」)は上の
 * `PendingCapturesBanner` に残し、**描くところだけ**を切り出した。
 * IndexedDB を触る側のままでは検査のハーネスから描けず、
 * オフラインでしか出ないこの帯が一度も機械に見られていなかった。
 */
export function PendingCapturesCard({
  pending,
  confirming,
  onDiscard,
  onCancelDiscard,
}: {
  pending: PendingCapture[];
  confirming: boolean;
  onDiscard: () => void;
  /** 構えを解く。**見える形で置く** — 取り消す道が要る。 */
  onCancelDiscard: () => void;
}) {
  const t = useT();
  const first = pending[0];
  return (
    // 全体を <Link> にすると**捨てる手段が置けない**。預かった写真は
    // 端末に残り続けるので、要らないものを消す道が要る(§16)。
    <div className="mb-4 flex min-h-14 items-center gap-2 rounded-2xl border border-warn/35 bg-warn/10 p-2 shadow-sm">
      <Link
        to="/capture"
        search={{ pending: first.id }}
        // 帯ぜんぶが「預かった写真を開く」ボタン。40px しか無かった。
        className="press-in flex min-w-0 flex-1 items-center gap-2"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-card ring-1 ring-warn/30">
          {first.object_img ? (
            <img
              src={first.object_img}
              alt={t("home.waitingPhoto")}
              className="h-full w-full object-cover"
            />
          ) : (
            <WifiOff className="h-5 w-5 text-warn" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          {/* 📥 は外した。左に**写真そのもの**が既に在るので、絵文字は
              同じことを二度言っているうえ、暗い面で色が調整できない。 */}
          <span className="block text-body font-semibold text-foreground">
            {t("home.pendingCount", { n: formatCount(pending.length) })}
          </span>
          <span className="block text-footnote text-muted-foreground">{t("home.pendingCta")}</span>
        </span>
      </Link>

      {/* 捨てるのは取り消せない。写真は二度と撮れないものなので、
          一度目のタップでは実行せず、二度目で捨てる。
          モーダルは出さない — この場で決まる小さな判断に、画面を
          覆うほどの重さは要らない。

          ただし構えたときは:
          ・**やめる道を画面に出す。** 以前は文字が入れ替わるだけで、
            取り消す方法が「どこか別の場所を触る」という見えない操作しか
            無かった(独立監査の指摘)
          ・**何が起きるかを言う。** 「本当に捨てる?」は結果を言っていない。
            この帯は「2枚」と数えているのに、捨てるのは**上に写っている
            1枚だけ**なので、そこを取り違えられない文言にする
          ・**取り消せない操作の色にする。** 同じ灰色のままだと、
            周りの文字と見分けがつかない */}
      <div className="flex shrink-0 items-center justify-end gap-1">
        {confirming && (
          <button
            onClick={onCancelDiscard}
            className="inline-flex min-h-11 items-center rounded-full px-2 text-caption font-medium text-muted-foreground hover:text-foreground"
          >
            {t("home.pendingDiscardCancel")}
          </button>
        )}
        <button
          onClick={onDiscard}
          className={`inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-caption font-medium ${
            confirming
              ? "bg-destructive/12 text-destructive-ink"
              : "text-muted-foreground hover:bg-warn/12 hover:text-foreground"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirming ? t("home.pendingDiscardConfirm") : t("home.pendingDiscard")}
        </button>
      </div>
    </div>
  );
}

const BG_OPTIONS = [
  { id: "paper", labelKey: "home.bgPaper", className: "album-bg-paper" },
  { id: "frame", labelKey: "home.bgFrame", className: "album-bg-frame" },
  { id: "notebook", labelKey: "home.bgNotebook", className: "album-bg-notebook" },
  { id: "cork", labelKey: "home.bgCork", className: "album-bg-cork" },
] as const;

type BgId = (typeof BG_OPTIONS)[number]["id"];

function HomePage() {
  const t = useT();
  const navigate = useNavigate();
  const fetchStickers = useServerFn(listMyStickers);
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const {
    data: stickers,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
    // Keep the signed URLs stable across tab switches so the browser cache
    // can serve the images instead of re-downloading them (roadmap B1).
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  /** 長押しで開いたときは、写真を選ぶ面から始める(オーナー指摘 2026-08-20)。 */
  const [openPhotoPicker, setOpenPhotoPicker] = useState(false);
  /** 見開きの右ページ(今日の日記を書く紙)を開いているか。 */
  const [writing, setWriting] = useState(false);

  const [bg, setBg] = useState<BgId>("paper");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("album-bg") : null;
    if (saved && BG_OPTIONS.some((o) => o.id === saved)) setBg(saved as BgId);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("album-bg", bg);
  }, [bg]);

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/onboarding", replace: true });
  }, [profile, navigate]);

  const today = new Date();
  const todayKey = dayKey(today);

  /**
   * 今日の1冊は**必ず日で切る**。今日は「今日」であって週でも月でもない。
   * 束ね方が効くのは、下に続く「これまでのページ」のほう。
   */
  const byDay = useMemo(
    () => groupBySpan(stickers?.items ?? [], (s) => new Date(s.created_at), "day"),
    [stickers],
  );
  const todayStickers = byDay.find(([k]) => k === todayKey)?.[1] ?? [];

  /**
   * 図鑑と同じ上限に当たっているか。**当たっているならそう言う**(§8)。
   *
   * ホームは日付ごとに遡る画面なので、古い日が黙って消えると
   * **その日は何も撮らなかった**ように見える。
   */
  const total = stickers?.total ?? stickers?.items.length ?? 0;
  const shown = stickers?.items.length ?? 0;
  const truncated = stickers?.truncated ?? false;

  /**
   * 今日より前の日。**日ごとに、新しい順に並べて下へ続ける**
   * (オーナー指示 2026-08-25「ホームの本棚の機能を全削除して、
   * 前のように下スクロールで過去が見える形に戻して」)。
   *
   * 束ね方(日/週/月)の切替も、端末に覚えさせる仕掛けも消した。
   */
  const pastGroups = useMemo(() => {
    const past = (stickers?.items ?? []).filter((s) => dayKey(new Date(s.created_at)) !== todayKey);
    return groupBySpan(past, (s) => new Date(s.created_at), "day").map(([key, items]) => ({
      key,
      items,
    }));
  }, [stickers, todayKey]);

  /**
   * 日付ごとの日記(要望 #22)。
   *
   * 日記の画面と**同じ問い合わせ鍵**を使うので、どちらかを開いていれば
   * もう一方は取り直さない。失敗しても黙って消える — 日記が出ないことで
   * ホームを止めない。
   *
   * **直した文が在ればそちら、無ければ下書き。** 添削前の日も本には残る。
   */
  const fetchJournal = useServerFn(listJournal);
  const { data: journalEntries } = useQuery({
    queryKey: ["journal"],
    queryFn: () => fetchJournal(),
    enabled: JOURNAL_ENABLED,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const journalsByDay = useMemo(() => {
    const m = new Map<string, { body: string; note?: string | null; used_sticker_ids: string[] }>();
    for (const e of journalEntries ?? []) {
      const body = (e.correction ?? e.user_draft ?? "").trim();
      // **空の日は入れない。** 入れると空の紙が本に挟まる。
      if (!body) continue;
      m.set(e.entry_date, {
        body,
        note: e.feedback_ja,
        used_sticker_ids: e.used_sticker_ids ?? [],
      });
    }
    return m;
  }, [journalEntries]);
  const bgClass = BG_OPTIONS.find((o) => o.id === bg)?.className ?? "album-bg-paper";

  return (
    <AppShell>
      <DayHeader date={today} />

      <PendingCapturesBanner />

      {isLoading ? (
        <HomeLoading />
      ) : isError ? (
        // 失敗を「今日はまだ何も無い」と描いていた。しかも日記への唯一の入口が
        // この else の中にあるので、エラーのときは日記にも辿り着けなくなる。
        <LoadFailed onRetry={() => void refetch()} retrying={isFetching} what={t("err.whatHome")} />
      ) : todayStickers.length === 0 ? (
        <HomeEmptyState />
      ) : (
        <>
          {/* 表紙が開く演出は**今日の1冊だけ**(オーナー指摘⑪)。
              過去の日にも付けると、遡るたびに何十冊も回り出す。 */}
          <ScrapbookAlbum
            stickers={todayStickers}
            bgClass={bgClass}
            opening
            onOpen={setOpenId}
            onLongPress={(id) => {
              setOpenId(id);
              setOpenPhotoPicker(true);
            }}
          />
          {/* 「日記を書く」は別の画面に飛ばさない(オーナー指摘)。
              押すとこのページがめくれて、**左に今日の写真・右に書く紙**が
              向かい合う。読む側(`DayJournalPage`)と同じ紙・同じ綴じ目。 */}
          {JOURNAL_ENABLED &&
            (writing ? (
              <JournalWritingPage onClose={() => setWriting(false)}>
                <JournalComposer showHeading={false} />
              </JournalWritingPage>
            ) : (
              <JournalLink onWrite={() => setWriting(true)} />
            ))}
        </>
      )}

      {/* **下へスクロールすると過去が続く形に戻した**(オーナー指示
          2026-08-25「ホームの本棚の機能を全削除して、前のように
          下スクロールで過去が見える形に戻して」)。

          本棚と見開きは削除した。押して開く一手間が要るうえ、
          「いつ何を撮ったか」を遡るのに背表紙は向いていない。

          日/週/月の切替も出さない(オーナー指摘「ホームの画面の
          日、週、月のボタンを消して」)。日ごとに素直に並べる。 */}
      {pastGroups.length > 0 && (
        <PastDays
          days={pastGroups.map((g) => [g.key, g.items] as [string, StickerWithWord[]])}
          bgClass={bgClass}
          onOpen={setOpenId}
          onLongPress={(id) => {
            setOpenId(id);
            setOpenPhotoPicker(true);
          }}
          truncated={truncated}
          shown={shown}
          total={total}
          journals={JOURNAL_ENABLED ? journalsByDay : undefined}
        />
      )}
      <StickerSheet
        stickerId={openId}
        openPhotoPicker={openPhotoPicker}
        onClose={() => {
          setOpenId(null);
          setOpenPhotoPicker(false);
        }}
      />
    </AppShell>
  );
}

/**
 * 読み込み中の台紙。**起動するたびに必ず通る面**なのに、ルートの三項の
 * 中に直書きだったので雛形から呼べず、一度も撮っていなかった。
 *
 * 高さは実物のアルバムとほぼ同じにしておく — 低いものを置くと、
 * 読み終わった瞬間に下の「過去の日」が突き落とされる。
 */
export function HomeLoading() {
  return <div className="h-72 animate-pulse rounded-3xl bg-secondary" />;
}

/** 今日はまだ1枚も無いとき。**始めたばかりの人が最初に見る面**。 */
export function HomeEmptyState() {
  const t = useT();
  return (
    <EmptyState
      icon={BookText}
      title={t("home.emptyTitle")}
      action={
        <Link
          to="/capture"
          className="press-in inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
        >
          {t("home.emptyCta")}
        </Link>
      }
    />
  );
}

/** 日記への唯一の入口。 */
/**
 * 日記への入口。
 *
 * `onWrite` を渡すと**その場でページをめくる**(オーナー指摘: アルバムの
 * 写真と日記が別の機能に分離していた)。渡さない場所では今までどおり
 * 日記の画面へのリンクとして働く — 過去の日記を読む道を塞がない。
 */
export function JournalLink({ onWrite }: { onWrite?: () => void }) {
  const t = useT();
  const cls =
    "press-in inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-body font-semibold shadow-sm";
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {onWrite ? (
        <>
          <button onClick={onWrite} className={cls}>
            <BookText className="h-4 w-4 text-primary" />
            {t("home.writeToday")}
          </button>
          {/* 過去の日記を読む道は残す。書く場所が変わっただけ。 */}
          <Link
            to="/journal"
            className="min-h-11 px-3 text-footnote font-semibold text-primary-ink"
          >
            {t("home.pastJournals")}
          </Link>
        </>
      ) : (
        <Link to="/journal" className={cls}>
          <BookText className="h-4 w-4 text-primary" />
          {t("home.journal")}
        </Link>
      )}
    </div>
  );
}

/** 今日より前の日。区切り・打ち切りの断り・日ごとのアルバム。 */
export function PastDays({
  days,
  bgClass,
  onOpen,
  truncated,
  shown,
  total,
  journals,
  onLongPress,
}: {
  days: Array<[string, StickerWithWord[]]>;
  bgClass: string;
  onOpen: (id: string) => void;
  truncated: boolean;
  shown: number;
  total: number;
  /** 写真の長押し。渡さなければ何もしない。 */
  onLongPress?: (id: string) => void;
  /**
   * 日付(YYYY-MM-DD)ごとの日記(要望 #22)。
   * **無い日は入っていない** — 日記の無い日に空の枠を並べると、
   * 本が書き損じの束に見える。
   */
  journals?: Map<string, { body: string; note?: string | null; used_sticker_ids: string[] }>;
}) {
  const t = useT();
  const dateLocale = localeOf(useUiLang());
  return (
    <section className="mt-12 space-y-10">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        {/* §15: 大文字化と広い字間は**ラテン文字の作法**。全角の仮名漢字に
            当てると「こ れ ま で の ペ ー ジ」と間延びして、区切りの小さな
            ラベルではなく別の見出しに見える。`.label-caps` が表示言語で
            切り替えるので、ここで書き分けない。 */}
        <span className="label-caps text-caption text-muted-foreground">{t("home.pastPages")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {/* 図鑑と同じ上限にかかっている。ホームは日付ごとに遡る画面なので、
          古い日が黙って消えると**その日は何も撮らなかった**ように見える。
          出せていないなら、そう言う(§8)。 */}
      {truncated && (
        <p role="status" className="rounded-xl bg-secondary px-3 py-2 text-caption text-foreground">
          {t("dex.truncated", { n: formatCount(shown), total: formatCount(total) })}
        </p>
      )}
      {days.map(([k, items]) => (
        <div key={k}>
          {/* k is a local YYYY-MM-DD; append time so it parses as LOCAL
              midnight (bare `new Date("YYYY-MM-DD")` is UTC → off-by-one
              for users west of UTC). */}
          {/* **日付の見出しだけ。** 週・月の束ね方は消した(オーナー指示
              「ホームの画面の日、週、月のボタンを消して」)。 */}
          <DayHeader date={keyToDate(k)} compact />
          <ScrapbookAlbum
            stickers={items}
            bgClass={bgClass}
            onOpen={onOpen}
            onLongPress={onLongPress}
          />
          {/* 写真のページの**向かい**に日記を置く(要望 #22)。
              使った語は `used_sticker_ids` から出す — 書かれてはいたが
              **読む所がどこにも無かった**列。その日の札は既に手元に在るので、
              id を突き合わせるだけでよく、問い合わせは増えない。 */}
          {(() => {
            // **日記の紙は日ごとのページにだけ挟む。** 週や月の束には
            // 何日ぶんもの日記が入り得るので、どれを見開きに置くのか
            // 決められない(適当に1日ぶんだけ出すと、書いた日が消える)。
            const j = journals?.get(k);
            if (!j) return null;
            const used = new Set(j.used_sticker_ids);
            return (
              <DayJournalPage
                body={j.body}
                note={j.note}
                usedWords={items.filter((s) => used.has(s.id)).map((s) => s.word.headword)}
              />
            );
          })()}
        </div>
      ))}
    </section>
  );
}

export function BackgroundPicker({
  current,
  onChange,
}: {
  current: BgId;
  onChange: (b: BgId) => void;
}) {
  const t = useT();
  return (
    <div className="mb-3 flex items-center justify-end">
      <ImageIcon aria-hidden className="mr-1 h-3 w-3 text-muted-foreground" />
      {/* §11: keep the swatch small but pad the tap target to the 44px floor. */}
      {BG_OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-label={`${t("home.background")}: ${t(o.labelKey)}`}
          aria-pressed={current === o.id}
          className="press-in grid h-11 w-11 place-items-center rounded-full"
        >
          <span
            className={`block h-7 w-7 overflow-hidden rounded-full border ${o.className} ${current === o.id ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
          />
        </button>
      ))}
    </div>
  );
}

export function DayHeader({
  date,
  label,
  compact,
}: {
  date: Date;
  label?: string;
  compact?: boolean;
}) {
  const locale = localeOf(useUiLang());
  const dateLabel = date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  return (
    <section className={compact ? "mb-3 text-center" : "mb-6 text-center"}>
      {label && <p className="text-caption label-caps text-muted-foreground">{label}</p>}
      {/* 日付。**端末の公式の書体をそのまま使う(NORI指定)** — iPhone なら
          Apple の SF Pro、Android なら Google の Roboto(`--font-display`)。

          以前は英語のときだけセリフ体の斜体で組んでいた。セリフ体は
          ラテン専用の作りなので、和文の日付では「2026」「8」「18」だけが
          セリフになり「年」「月」「日」はゴシックに落ちる —
          **1つの語の中で書体が割れる**。言語で書体を出し分けて逃げていたが、
          そもそも書体で差を付けるのをやめた。差は大きさと字間で付ける。 */}
      <h1
        className={`font-display ${
          compact ? "mt-1 text-title leading-[1.15]" : "mt-2 text-hero leading-[1.12]"
        }`}
      >
        {dateLabel}
      </h1>
      {/* 曜日。字間を広げるのは**ラテン文字の作法**なので、和文では効かない
          ようにしてある(`.label-caps` が表示言語で切り替える)。
          以前はここで `isEn ? … : …` と書き分けていたが、同じ形が20箇所
          あったので CSS 側にまとめた。 */}
      <p className={`${compact ? "" : "mt-0.5"} label-caps text-footnote text-muted-foreground`}>
        {weekday}
      </p>
      <div className="mx-auto mt-3 h-px w-16 bg-foreground/30" />
    </section>
  );
}

// **大きさの一覧は1本だけにする。**
// 以前はここに class の文字列の一覧（`ALBUM_SIZES`）が在り、下の
// `AUTO_ALBUM_SIZE` と**同じ並びを2つ**持っていた。描画は前者、
// 保存と掴みは後者を見ていたので、片方を直した日に静かに食い違う。
// 実際、角を掴んだとき「画面に出ている大きさ」ではなく `"small"` を
// 渡していて、**引き返しても元に戻らなかった**。
type AlbumSize = LibAlbumSize;
const AUTO_ALBUM_SIZE: readonly AlbumSize[] = [
  "large",
  "portrait",
  "small",
  "landscape",
  "portrait",
  "small",
];

export function ScrapbookAlbum({
  stickers,
  bgClass,
  onOpen,
  onLongPress,
  opening,
}: {
  stickers: StickerWithWord[];
  bgClass: string;
  onOpen: (id: string) => void;
  /**
   * 写真を長押ししたとき(オーナー指摘 2026-08-20)。
   * 「ホームアルバムや単語の詳細の画像を長押ししたら、あとから
   * 切り抜きできるようにして」。渡さなければ長押しは何もしない。
   */
  onLongPress?: (id: string) => void;
  /**
   * 表紙が開く演出を付けるか(オーナー指摘⑪)。
   * **1日に何度も開く画面なので、既定は付けない。** 付けるのは
   * 「今日のアルバム」を最初に描いたときだけ(呼ぶ側が決める)。
   */
  opening?: boolean;
}) {
  const t = useT();
  const isEn = useUiLang() === "en";
  const persistLayout = useServerFn(saveAlbumLayout);
  const [editing, setEditing] = useState(false);
  const [ordered, setOrdered] = useState(stickers);
  const dragId = useRef<string | null>(null);
  const dragged = useRef(false);
  const changed = useRef(false);
  useEffect(() => {
    if (editing) return;
    setOrdered(
      [...stickers].sort(
        (a, b) =>
          (a.album_order ?? Number.MAX_SAFE_INTEGER) - (b.album_order ?? Number.MAX_SAFE_INTEGER),
      ),
    );
  }, [stickers, editing]);
  /**
   * 台紙の実寸。**割合で持っている座標を px に直すのに要る。**
   * 画面の幅が変わったら測り直す（横向きにした回に全部ずれないように）。
   */
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [board, setBoard] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBoard({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /**
   * いま指で動かしている札の置き方。**確定するまで `ordered` に書かない。**
   * 1フレームに何度も来る `pointermove` で配列ごと作り直すと、札の枚数ぶん
   * 描き直しが積み上がって、掴んだ物が指から遅れる。
   */
  const [live, setLive] = useState<{ id: string; place: Placement } | null>(null);
  const items = useMemo(
    () =>
      ordered.map((s, i) => ({
        sticker: s,
        /**
         * 紙の上のどこに、どの大きさ、どの傾きで置くか。
         *
         * **升目（S/縦/横/L）はもう見ない**（オーナー指示 2026-09-15
         * 「今はカクカクして滑らかに画像を自分の好きな場所に好きな
         *  大きさで設定できるようになってない」）。4通りに飛ぶ持ち方
         * だったので、指をどれだけ滑らかに動かしても滑らかになりよう
         * が無かった。まだ自分で置いていない札は、昔の並びに寄せた
         * 場所へ自動で置く（`lib/album-place.ts`）。
         */
        place: placementFrom(
          { x: s.album_x, y: s.album_y, scale: s.album_scale, rot: s.album_rot },
          i,
          s.id,
        ),
        z: 10 + (i % 5),
      })),
    [ordered],
  );

  function layoutPayload(next = ordered) {
    return next.map((s, order) => {
      const p = placementFrom(
        { x: s.album_x, y: s.album_y, scale: s.album_scale, rot: s.album_rot },
        order,
        s.id,
      );
      return {
        sticker_id: s.id,
        order,
        // 升目はもう画面では見ていないが、**列は残してある**ので一緒に送る。
        // 消すと、移行がまだ当たっていない環境で置き方が丸ごと保存できない。
        size: s.album_size ?? AUTO_ALBUM_SIZE[order % AUTO_ALBUM_SIZE.length],
        x: p.x,
        y: p.y,
        scale: p.scale,
        rot: p.rot,
      };
    });
  }
  function finishEditing() {
    setEditing(false);
    if (!changed.current) return;
    changed.current = false;
    void persistLayout({ data: { items: layoutPayload() } });
  }
  /** 置き方を書き戻す。**指を離したときだけ**呼ぶ。 */
  function commitPlace(id: string, p: Placement) {
    changed.current = true;
    setOrdered((xs) =>
      xs.map((s) =>
        s.id === id
          ? { ...s, album_x: p.x, album_y: p.y, album_scale: p.scale, album_rot: p.rot }
          : s,
      ),
    );
  }

  /**
   * いま札に触れている指。**札ごとではなく、いちどに1枚しか掴まない。**
   *
   * 2本目の指が同じ札に乗ったら、それは「つまんで広げる・回す」の始まり。
   * 別の札に乗ったら無視する（2枚同時に動かすのは、紙のアルバムでも
   * できないし、できても嬉しくない）。
   */
  const grip = useRef<{
    id: string;
    pointers: Map<number, Pt>;
    /** この握りが始まったときの指の位置と置き方。**毎回ここから作り直す。** */
    startGrip: FingerGrip;
    startPlace: Placement;
    moved: boolean;
  } | null>(null);
  const moveRafPlace = useRef(0);
  const pendingPlace = useRef<Placement | null>(null);

  /** いま触れている指から握りを作る（1本なら a だけ、2本なら a と b）。 */
  function gripOf(pointers: Map<number, Pt>): FingerGrip {
    const pts = [...pointers.values()];
    return pts.length >= 2 ? { a: pts[0], b: pts[1] } : { a: pts[0] ?? { x: 0, y: 0 } };
  }

  /**
   * 指の数が変わったら、**いまの見た目から握りを取り直す**。
   *
   * 取り直さないと、2本目を置いた瞬間に「真ん中」が飛ぶので札がワープする。
   * 離したときも同じ（残った1本の位置へ飛ぶ）。
   */
  function reseat(place: Placement) {
    const g = grip.current;
    if (!g) return;
    g.startGrip = gripOf(g.pointers);
    g.startPlace = place;
  }

  function currentPlace(id: string, fallback: Placement): Placement {
    return live?.id === id ? live.place : fallback;
  }

  // 設定で主役を選んでいれば、そちらが画面の意図(自撮り)に勝つ。
  const photoPref = usePhotoPref();
  // **アルバムだけの選択**(長押しで選んだ物)。札の枚数だけ hook を呼ばない
  // よう、束で読んで `surfaceKey` で引く。
  const surfaceRoles = useSurfaceRoleMap();

  // 長押し(550ms)。**詳細の画面と同じ長さ**にする — 同じ動作が場所によって
  // 違う長さだと、どちらかが「効かない」と感じられる。
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  /**
   * 押さえ始めた点。**長押しを取り消すかどうかの判断に要る。**
   *
   * 指は必ず数 px 揺れるので、1px でも動いたら取り消す作りにすると
   * **長押しがほとんど成立しない**。10px の遊びを持たせる（iOS も同じ考え）。
   */
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const PRESS_SLOP = 10;
  /**
   * 掴んでいる札と、指に付いてくるためのずれ。
   *
   * **長押しした指でそのまま掴めること**が「iPhone のように」の中心
   * (オーナー指示 2026-09-13)。前は `onPointerDown` が `editing` のときだけ
   * `dragId` を立てていたので、長押しで編集に入った瞬間にはもう
   * `pointerdown` が終わっており、**一度離して押し直さないと動かせなかった**。
   */
  /**
   * 長押しから**そのまま掴む**ための下ごしらえ。
   *
   * ここを渡さないと、編集に入った瞬間には `pointerdown` が終わっている
   * ので、**一度離して押し直さないと動かせない**（#79 が直した所）。
   * 長押しが成立した時点で、いま押さえている指と札の置き方から
   * 握りを組み立てる。
   */
  function startPress(
    id: string,
    at: { x: number; y: number },
    pointerId: number,
    place: Placement,
  ) {
    longPressFired.current = false;
    pressOrigin.current = at;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      // 生の navigator.vibrate は**振動オフの設定を無視する**。触覚は
      // 「うるさい」と感じた人が切るためのものなので、切れないなら意味がない。
      haptic("medium");
      setEditing(true);
      grip.current = {
        id,
        pointers: new Map([[pointerId, at]]),
        startGrip: { a: at },
        startPlace: place,
        moved: false,
      };
      dragged.current = false;
      setLive({ id, place });
    }, 550);
  }
  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  }
  /**
   * **指の面倒は窓で見る。掴み取り(`setPointerCapture`)は使わない。**
   *
   * 最初は札に `setPointerCapture` を張っていた。実測すると、**2本目の指の
   * `pointerdown` が handler まで来なくなり**、つまむ操作が丸ごと死んでいた
   * （握りが1本で閉じるので、倍率は常に 1 のまま。幅の刻みを10回測って
   *  「95 95 95 95 95 95 95 95 95 95」と1ミリも動かなかった）。
   * 生のイベントを直に数えると2本とも札に届いているので、取り上げて
   * いるのは掴み取りのほう。
   *
   * 窓で受ければ、ついでに2つ直る:
   *   ・**指が札の外へ出ても続く。** 札は 88px ほどしかないので、
   *     つまんで広げると縁が指の下からすぐ逃げる
   *   ・**指が横取りされた回も必ず戻る**（通知や電話で固まらない）
   */
  useEffect(() => {
    if (!live) return;
    const shown = () => pendingPlace.current ?? grip.current?.startPlace ?? live.place;
    const move = (e: PointerEvent) => {
      const g = grip.current;
      if (!g || !g.pointers.has(e.pointerId)) return;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = gestureDelta(g.startGrip, gripOf(g.pointers));
      if (Math.hypot(d.dx, d.dy) > 2 || d.scale !== 1 || d.rot !== 0) g.moved = true;
      /**
       * **1フレームに1回だけ描き直す。** `pointermove` は1フレームに何度も
       * 来るので、そのたびに state を変えると札の枚数ぶん描き直しが
       * 積み上がって、掴んだ物が指から遅れる（「カクカク」のもう半分）。
       */
      pendingPlace.current = applyDelta(g.startPlace, d, board);
      if (!moveRafPlace.current) {
        moveRafPlace.current = requestAnimationFrame(() => {
          moveRafPlace.current = 0;
          const next = pendingPlace.current;
          if (next && grip.current) setLive({ id: grip.current.id, place: next });
        });
      }
    };
    const up = (e: PointerEvent) => {
      const g = grip.current;
      if (!g || !g.pointers.has(e.pointerId)) return;
      g.pointers.delete(e.pointerId);
      const now = shown();
      if (g.pointers.size > 0) {
        // まだ指が残っている。**残った指で握りを取り直す** —
        // 取り直さないと、離した瞬間に残った指へ札が飛ぶ。
        reseat(now);
        pendingPlace.current = now;
        setLive({ id: g.id, place: now });
        return;
      }
      // 全部離れた。**ここで初めてまっすぐの近くを直す**
      //（動かしている最中に吸い付くと驚く）。
      if (moveRafPlace.current) cancelAnimationFrame(moveRafPlace.current);
      moveRafPlace.current = 0;
      pendingPlace.current = null;
      grip.current = null;
      dragged.current = g.moved;
      setLive(null);
      if (g.moved) commitPlace(g.id, settle(now));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // `reseat` は毎描画で作り直されるが、中身は ref だけなので依存に
    // 入れる必要がない（入れると指を動かすたびに張り直しになる）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, board]);

  return (
    // リアル・アルバム: .album-page が紙の繊維と周辺減光を持つ台紙。
    // 各写真は白フチの印画紙(.photo-print)を三角コーナーで留める —
    // 子供の頃のアルバムの再現。本の厚み表現は廃止(NORI指定)。
    <div
      className={`album-page relative rounded-2xl border border-amber-900/20 p-5 sm:p-7 ${bgClass} ${opening ? "album-open" : ""}`}
    >
      {editing && (
        <button
          type="button"
          onClick={finishEditing}
          className="absolute right-3 top-3 z-30 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-footnote font-semibold text-primary-foreground shadow-lg"
        >
          <Check className="h-4 w-4" />
          完了
        </button>
      )}
      {/* **升目をやめて、1枚の紙にした**（オーナー指示 2026-09-15）。
          形を決め打ちにするのは、縦位置を割合で持てるようにするため。
          中身で伸びる箱だと、札を1枚足すたびに置いた物が動いてしまう。 */}
      <div
        ref={boardRef}
        /**
         * **2本目の指は、台紙のどこに置いても効く。**
         *
         * 札の上だけで受けていたら、札を動かして別の札に重ねた回に、
         * 2本目が**上に居る別の札**に当たって弾かれていた（実測:
         * 札を 107→197 へ運ぶと隣の札の上に乗り、そこから先はつまむ操作が
         * 一度も成立しない）。しかも1本目を置いた直後はまだ描き直しが
         * 済んでおらず、掴んだ札は前後の重なりでも下に居る。
         *
         * 札は 88px ほどしかないので、そもそも**2本とも札の上に置けと
         * 言うほうが無理**。iOS でも、つまむ指は物の外に在っていい。
         */
        onPointerDown={(e) => {
          const g = grip.current;
          if (!editing || !g || g.pointers.has(e.pointerId)) return;
          g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          // 指の数が変わったので握りを取り直す（取り直さないと札が飛ぶ）。
          reseat(pendingPlace.current ?? g.startPlace);
          setLive({ id: g.id, place: pendingPlace.current ?? g.startPlace });
        }}
        className={`relative w-full ${editing ? "touch-none" : ""}`}
        style={{ aspectRatio: `${ALBUM_ASPECT}` }}
      >
        {items.map(({ sticker: s, place: saved, z }) => {
          const place = currentPlace(s.id, saved);
          const px = sizePx(place, board);
          // Album is a memory book: prefer selfie (you + the thing).
          // Fallback to the plain object photo only when there's no selfie.
          // アルバムなので**自撮りを先に見る**。落ち方は `sticker-photo.ts`
          // に1つだけ置いてある — 以前はここを含む7箇所がそれぞれ違う順で
          // 選んでいて、同じ札が画面をまたぐと別の写真で出ていた。
          // 優先順は「この札の指定(長押し) → 設定 → 画面の意図」。
          //
          // **ネットの絵はアルバムに貼らない**(オーナー指摘 2026-08-21
          // 「文字入力した単語はホームのアルバムに単語の文字だけ書いて」)。
          // アルバムは自分が出会って撮った物の記録で、借りてきた絵を同じ紙に
          // 貼ると、撮った日の思い出と見分けが付かなくなる。ネットの絵は
          // **単語の詳細の見出し**という置き場所を別に持っている。
          // **アルバムでの選択がいちばん強い**(オーナー指示 2026-08-25
          // 「アルバムと単語詳細で別々に種類を選べる」)。この端末に憶えて
          // ある物 → 札の共通の選択(`hero_role`) → 設定 → 画面の意図。
          const heroUrl = stickerPhotoUrl(s, {
            prefer: resolveSurfaceRole({
              surfaceRole: surfaceRoles[surfaceKey("album", s.id)] ?? null,
              heroRole: s.hero_role,
              screenIntent: resolvePrefer(photoPref, "selfie"),
            }),
            exclude: ["placeholder"],
          });

          return (
            <button
              key={s.id}
              onClick={() => {
                // 長押しが成立した回の「離す」でカードを開かない。
                if (longPressFired.current) {
                  longPressFired.current = false;
                  return;
                }
                if (editing) {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  onLongPress?.(s.id);
                  return;
                }
                onOpen(s.id);
              }}
              // **アルバムの写真も長押しで主役を選べる**(オーナー指摘 2026-08-20)。
              // 「ホームアルバムや単語の詳細の画像を長押ししたら、あとから
              // 切り抜きできるようにして」。詳細の画面には既に在るので、
              // 同じ入口をここにも開ける — 押さえた写真そのものを直せる。
              onPointerDown={(e) => {
                if (!editing) {
                  // **長押しの時点で掴む**ので、押さえた指と置き方を渡す。
                  startPress(s.id, { x: e.clientX, y: e.clientY }, e.pointerId, place);
                  return;
                }
                // 既に編集中。**別の札を掴んでいる間は受け取らない** —
                // 2枚同時に動かすのは紙のアルバムでもできない。
                if (grip.current && grip.current.id !== s.id) return;
                if (!grip.current) {
                  grip.current = {
                    id: s.id,
                    pointers: new Map(),
                    startGrip: { a: { x: e.clientX, y: e.clientY } },
                    startPlace: place,
                    moved: false,
                  };
                }
                grip.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                // **指の数が変わったら握りを取り直す。** 取り直さないと、
                // 2本目を置いた瞬間に「真ん中」が飛んで札がワープする。
                reseat(place);
                setLive({ id: s.id, place });
              }}
              onPointerMove={(e) => {
                // 動かす・広げる・回すは**窓が受け持つ**（上の effect）。
                // ここに残すのは、長押しを取り消すかどうかの判断だけ。
                if (editing) return;
                // 押さえたまま待つのが長押し。**遊びを越えて動いたら**
                // めくろうとしたと見て取り消す（1px で取り消すと、指の
                // 微動だけで長押しがほとんど成立しなくなる）。
                const o = pressOrigin.current;
                if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > PRESS_SLOP) endPress();
              }}
              onPointerUp={endPress}
              onPointerCancel={endPress}
              onContextMenu={(e) => e.preventDefault()}
              // **ブラウザ自前のドラッグ＆ドロップを止める。**
              //
              // 押したまま動かすと、Chromium は中の `<img>` を掴んで
              // ネイティブの drag を始め、その瞬間に `pointercancel` を投げて
              // **ポインタを取り上げる**。こちらの長押しも並べ替えも、
              // そこで丸ごと死ぬ。`touch-action: none` では止まらない
              // （あれはスクロールやピンチの話で、drag は別の仕組み）。
              //
              // 実測: 押して 4px 動かしただけで `pointercancel` が1回飛び、
              // 揺れも掴みも 0 になっていた（マウスでも指でも同じ）。
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              // §1 Response: 傾きは外側、内側の印画紙がコーナーからそっと浮く。
              data-album-sticker={s.id}
              className={`photo-lift group absolute block touch-none text-left ${
                editing ? "album-editing cursor-grab active:cursor-grabbing" : ""
              } ${live?.id === s.id ? "album-lifted" : ""}`}
              style={
                {
                  /**
                   * **紙の上のどこに、どの大きさ、どの傾きで貼るか。**
                   *
                   * 中心を `left/top` で置き、`translate(-50%,-50%)` で
                   * 真ん中を合わせる。こうすると**つまんで広げたときに
                   * 中心が動かない** — 左上を基準にすると、大きくするたびに
                   * 右下へ逃げていくので「掴んだ所が動く」感じになる。
                   *
                   * 傾きは `rotate` だけ。`scale` は使わず**実寸**を変える
                   * ので、大きくしても写真がぼやけない。
                   */
                  left: `${place.x * 100}%`,
                  top: `${place.y * 100}%`,
                  width: `${px.w}px`,
                  height: `${px.h}px`,
                  /**
                   * **`transform` ではなく、個別の指定で置く。**
                   *
                   * ここは `transform: translate(-50%,-50%) rotate(...)` と
                   * 書いていた。ところが編集中の札には揺れ(`album-jiggle`)が
                   * 掛かっていて、**CSS アニメーションの `transform` は
                   * インラインの `transform` を丸ごと置き換える**。つまり
                   * 中央合わせの `-50%,-50%` が消え、編集に入った瞬間に
                   * 全部の札が**自分の半分ぶん右下へずれていた**
                   * （実測 41px, 51px ＝ちょうど幅と高さの半分）。
                   *
                   * しかも掴んだ札だけは `.album-lifted` で揺れが止まるので、
                   * **触れた瞬間に元の位置へ戻る**。2本目の指はもう札の無い
                   * 所に落ちることになり、つまむ操作が成立しなかった。
                   * 実測で `down#4@DIV`（札ではない要素に当たった）。
                   *
                   * `translate` / `rotate` / `scale` を個別に書けば、
                   * 揺れの `transform` は**その後ろに重なる**ので喧嘩しない。
                   */
                  translate: "-50% -50%",
                  rotate: `${place.rot}deg`,
                  scale: live?.id === s.id ? `${LIFTED.scale}` : undefined,
                  zIndex: live?.id === s.id ? 60 : z,
                  boxShadow:
                    live?.id === s.id
                      ? `0 ${LIFTED.shadowBlurPx / 2}px ${LIFTED.shadowBlurPx}px rgba(0,0,0,${LIFTED.shadowAlpha})`
                      : undefined,
                  // 揺れの位相と周期は札ごと（`lib/album-drag.ts`）。
                  "--jiggle-delay": `${jiggleStyle(s.id).delayMs}ms`,
                  "--jiggle-dur": `${jiggleStyle(s.id).durationMs}ms`,
                  "--jiggle-rot": `${JIGGLE.rotateDeg}deg`,
                  "--jiggle-lift": `${JIGGLE.liftPx}px`,
                } as React.CSSProperties
              }
            >
              {/* **写真が在るときだけ印画紙を貼る**(オーナー指摘 2026-08-27 ②
                  「文字検索したら、アルバムでは文字だけを表示して。画像の
                   ようにアルバムに貼らないで。」)。

                  写真の無い札にも印画紙(白フチ+三角コーナー+ツヤ)を被せて
                  いたので、**白い紙を貼ってその上に語を書いた**絵になって
                  いた。中身は文字なのに、留め具まで付いた「貼った物」に
                  見える。文字の札は台紙に直に書く(`.album-note`)。 */}
              <div className={`h-full w-full ${heroUrl ? "photo-print" : "album-note"}`}>
                {heroUrl && (
                  <>
                    <span aria-hidden className="photo-corner tl" />
                    <span aria-hidden className="photo-corner tr" />
                    <span aria-hidden className="photo-corner bl" />
                    <span aria-hidden className="photo-corner br" />
                  </>
                )}
                {heroUrl ? (
                  <div className="h-full w-full overflow-hidden">
                    <CachedImg
                      src={heroUrl}
                      alt={t("common.memoryOf", { word: s.word.headword })}
                      loading="lazy"
                      decoding="async"
                      className="block h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  // **写真の無い札は、その語の文字そのものを札にする**
                  // (オーナー指摘 2026-08-21「文字入力した単語はホームの
                  // アルバムに単語の文字だけ書いて」)。
                  //
                  // 前は「ここに写真が入る」を示す絵の記号を置いていた。
                  // 文字を入れて調べた語には**そもそも写真が来ない**ので、
                  // その札は永久に空の記号のまま並ぶことになる。
                  // (`ImageOff` の斜線は「壊れています」と読まれるため、
                  //  素の絵の記号に一度直した跡がある。今回それも外した。)
                  //
                  // **同じ語を2回書かない。** 下の白フチの帯にも見出し語が
                  // 入るので、両方出すと「腳踏車 / 腳踏車」と二段に並んで
                  // 誤りにしか見えない。だからこの場合だけ帯を出さない
                  // (帯側の `heroUrl &&` がその約束)。
                  //
                  // **字は札の大きさに合わせる。** 台紙の枠は 1〜2 マスで
                  // 大きさが変わる。どれも同じ字にすると、大きい札だけが
                  // 白い板の真ん中に小さな字が浮いた絵になる(絵で見つけた)。
                  <div className="grid h-full w-full place-items-center px-1">
                    {/* **字形は学習言語で決める。** `lang="zh-Hant"` の
                        決め打ちだったので、英語の語に中国語の字形が当たって
                        いた(`Term` の注)。 */}
                    <Term
                      lang={s.word.language}
                      className={`line-clamp-2 text-center font-semibold leading-tight tracking-[0.02em] text-album-ink ${
                        place.scale >= 1.35 ? "text-title" : "text-headline"
                      }`}
                    >
                      {s.word.headword}
                    </Term>
                  </div>
                )}
                {/* 白フチの帯(26px)の中に収める — 写真とは絶対に被らない */}
                {/* 帯の中の見出し語。手書き風(.handwritten)は付けない —
                    Caveat に漢字が無いため、繁体字の字形指定を壊してしまう。
                    §3 Clarity: 見出し語はこのカードの主役なので、細く薄い字では
                    なく「やや大きく・semibold・不透明」で読ませる。繁体字は画数が
                    多く小さいと潰れるため、字間も少し開ける。 */}
                {heroUrl && (
                  <Term
                    lang={s.word.language}
                    className="absolute inset-x-1 bottom-0.5 truncate text-center text-body font-semibold leading-[22px] tracking-[0.02em] text-album-ink"
                  >
                    {s.word.headword}
                  </Term>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* §3 Typography: .handwritten (Caveat) has no CJK glyphs, so in Japanese
          only the digit rendered as handwriting while 「枚の思い出」 fell back to
          the UI font — one line in two different typefaces. Latin keeps the
          handwritten album caption; Japanese renders the whole line in one
          consistent face. (Same reason the headword above avoids .handwritten.) */}
      <div className="relative mt-8 text-right">
        {/* 台紙の上の字なので**固定のインク**。`text-amber-900/70` は
            番号直書き + 70% で、紙で 3.56:1、コルクで 2.35:1 しか無かった。 */}
        <span
          className={`text-body text-album-ink ${isEn ? "handwritten" : "font-medium tracking-[0.02em]"}`}
        >
          — {formatCount(stickers.length)}
          {t("home.memories")}
        </span>
      </div>
    </div>
  );
}
