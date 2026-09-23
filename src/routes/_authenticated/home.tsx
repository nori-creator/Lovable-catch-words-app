import { JIGGLE, jiggleStyle, LIFTED } from "@/lib/album-drag";
import { decorFor } from "@/lib/collage-decor";
import {
  applyDelta,
  boardHeight,
  COLLAGE_CAP_W,
  captionAlign,
  COLLAGE_COL_W,
  collageRatio,
  gestureDelta,
  packCollage,
  placeFromCell,
  placementFrom,
  ratioOf,
  settle,
  sizePx,
  type AlbumSize,
  type Grip as FingerGrip,
  type Placement,
  type Pt,
} from "@/lib/album-place";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { groupBySpan, keyToDate } from "@/lib/album-span";
import { resolvePrefer, usePhotoPref } from "@/lib/photo-pref";
import { pickStickerPhoto, stickerPhotoUrl } from "@/lib/sticker-photo";
import { resolveSurfaceRole, surfaceKey, useSurfaceRoleMap } from "@/lib/photo-surface";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import { StickerSheet } from "@/components/StickerSheet";
import type { HeroOrigin as FlightOrigin } from "@/components/use-hero-reveal";
import { listMyStickers, saveAlbumLayout, type StickerWithWord } from "@/lib/stickers.functions";
import { CachedImg } from "@/lib/image-cache";
import { Term } from "@/components/Term";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listPendingCaptures,
  removePendingCapture,
  type PendingCapture,
} from "@/lib/offline-queue";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookText, Camera, Check, Trash2, WifiOff } from "lucide-react";
import { homeBlankMessage, streakEndingYesterday } from "@/lib/home-blank";
import {
  readWallpaper,
  wallClass,
  wallFromClass,
  WALLPAPER_EVENT,
  type WallId,
} from "@/lib/wallpaper";
import { localeOf, useT } from "@/lib/i18n";
import { formatCount } from "@/lib/count";
import { useUiLang } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

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
  /**
   * 押した札の場所と絵。ここから詳細の見出しへ**絵が飛ぶ**
   * （オーナー指示 2026-09-15「軌跡アニメーション」／`components/use-hero-reveal.ts`）。
   * 長押しで開いた時は空にする — 長押しは「この札の写真を選び直す」であって、
   * 絵が育って開く動きではない。
   */
  const [openFrom, setOpenFrom] = useState<FlightOrigin | null>(null);
  /** 長押しで開いたときは、写真を選ぶ面から始める(オーナー指摘 2026-08-20)。 */
  const [openPhotoPicker, setOpenPhotoPicker] = useState(false);
  /**
   * 壁紙。**選ぶ所は設定**（オーナー指示 2026-09-23「ホームの上に丸で表示
   * するのはダサいからやめて」）。ここは読むだけで、設定で変えたら
   * 知らせを受けて貼り替える（`lib/wallpaper.ts`）。
   */
  const [wall, setWall] = useState<WallId>("paper");
  useEffect(() => {
    setWall(readWallpaper());
    const h = () => setWall(readWallpaper());
    window.addEventListener(WALLPAPER_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(WALLPAPER_EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  const surfaceClass = wallClass(wall);

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

  /*
   * **ホームに日記は出さない**（オーナー指示 2026-09-22「ホームの日記は
   * 消して」）。前はここで日記を読み、過去の日の写真の向かいに挟んでいた。
   * 日記そのもの（`/journal` と `DayJournalPage`）は消していない。
   */
  return (
    <AppShell>
      {/* **日付は壁紙に直に書く**（オーナー指示 2026-09-23「ホーム画面の日付は
          背景の壁紙に直接書いて。日記のように」）。上の見出しの帯はやめ、
          今日の誌面の板の中（`DayCollage` の `heading`）に書く。 */}
      <PendingCapturesBanner />

      {isLoading ? (
        <HomeLoading />
      ) : isError ? (
        // 失敗を「今日はまだ何も無い」と描いていた。しかも日記への唯一の入口が
        // この else の中にあるので、エラーのときは日記にも辿り着けなくなる。
        <LoadFailed onRetry={() => void refetch()} retrying={isFetching} what={t("err.whatHome")} />
      ) : todayStickers.length === 0 ? (
        <HomeEmptyState
          surface={surfaceClass}
          date={today}
          message={homeBlankText(stickers?.items ?? [], total, today, t)}
        />
      ) : (
        <>
          {/* 表紙が開く演出は**今日の1冊だけ**(オーナー指摘⑪)。
              過去の日にも付けると、遡るたびに何十冊も回り出す。 */}
          <DayCollage
            stickers={todayStickers}
            surface={surfaceClass}
            heading={<DiaryDate date={today} tagline={dayTagline(todayStickers, t)} />}
            opening
            onOpen={(id, from) => {
              setOpenId(id);
              setOpenFrom(from ?? null);
            }}
            onLongPress={(id) => {
              setOpenId(id);
              setOpenFrom(null);
              setOpenPhotoPicker(true);
            }}
          />
          {/* **「今日の日記」の欄は出さない**（オーナー指示 2026-09-17
              「今日の日記の欄も消して」）。

              紙の下に青いボタンが1つ座っていると、そこで誌面が終わって
              **アプリの画面に戻る**。この面は1枚の紙であって、道具の並んだ
              画面ではない。日記そのものは消していない — 過去の日の紙の
              向かいには今までどおり出るし、書く画面(`/journal`)も残っている。 */}
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
          surface={surfaceClass}
          days={pastGroups.map((g) => [g.key, g.items] as [string, StickerWithWord[]])}
          onOpen={(id, from) => {
            setOpenId(id);
            setOpenFrom(from ?? null);
          }}
          onLongPress={(id) => {
            setOpenId(id);
            setOpenFrom(null);
            setOpenPhotoPicker(true);
          }}
          truncated={truncated}
          shown={shown}
          total={total}
        />
      )}
      <StickerSheet
        stickerId={openId}
        openPhotoPicker={openPhotoPicker}
        from={openFrom}
        onClose={() => {
          setOpenId(null);
          setOpenFrom(null);
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

/**
 * 今日はまだ1枚も無いとき。**始めたばかりの人が最初に見る面**。
 *
 * （オーナー指示 2026-09-23）壁紙の上に日付と、その人の状態に合わせた一言を
 * 書く（`lib/home-blank.ts`）。ボタンは「今日の一枚を撮る」。
 */
export function HomeEmptyState({
  surface = "album-bg-paper",
  date = new Date(),
  message,
}: {
  surface?: string;
  date?: Date;
  /** 状態に合わせた一言。渡さなければ「目の前にあるもの何て言う？」。 */
  message?: string;
}) {
  const t = useT();
  return (
    <div className={`collage collage-board relative ${surface}`}>
      <div className="collage-heading">
        <DiaryDate date={date} />
      </div>
      <div className="home-blank">
        <p className="home-blank__msg handwritten-ja">{message ?? t("home.blankWhatIsThat")}</p>
        <Link
          to="/capture"
          className="press-in inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground shadow-lg shadow-primary/30"
        >
          <Camera className="h-4 w-4" aria-hidden />
          {t("home.emptyCta")}
        </Link>
      </div>
    </div>
  );
}

/** 白紙の日の一言を、手元の記録から選んで訳す。 */
export function homeBlankText(
  items: StickerWithWord[],
  total: number,
  today: Date,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  const days = new Set(items.map((s) => dayKey(new Date(s.created_at))));
  const dayIndex = Math.floor(
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 86_400_000,
  );
  const m = homeBlankMessage({
    total,
    streakDays: streakEndingYesterday(days, today),
    dayIndex,
  });
  return "n" in m ? t(m.key, { n: m.n }) : t(m.key);
}

/**
 * **日記のように、壁紙に直に書く日付。**（オーナー指示 2026-09-23「ホーム画面の
 * 日付は背景の壁紙に直接書いて。日記のように。日付の字体を統一して。また文字の
 * 下の青い波線いらない」）
 *
 * 書体は**手書き1つだけ**（日付・曜日・一言すべて）。前は明朝の日付・ゴシックの
 * 曜日・手書きの一言と3つに割れ、青い波線が2本引いてあった。
 */
export function DiaryDate({
  date,
  tagline,
  compact = false,
}: {
  date: Date;
  tagline?: string;
  compact?: boolean;
}) {
  const locale = localeOf(useUiLang());
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  const monthDay = date.toLocaleDateString(locale, { month: "long", day: "numeric" });
  const Tag = compact ? "h2" : "h1";
  return (
    <div className={`diary-date handwritten-ja ${compact ? "diary-date--compact" : ""}`}>
      <Tag className="diary-date__line">
        <span className="diary-date__day">{monthDay}</span>
        <span className="diary-date__weekday">{weekday}</span>
      </Tag>
      {tagline && <p className="diary-date__note">{tagline}</p>}
    </div>
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
  onOpen,
  truncated,
  shown,
  total,
  onLongPress,
  surface,
}: {
  /** 壁の地（`album-bg-*`）。今日の誌面と同じ物。 */
  surface?: string;
  days: Array<[string, StickerWithWord[]]>;
  onOpen: (id: string, from?: FlightOrigin | null) => void;
  truncated: boolean;
  shown: number;
  total: number;
  /** 写真の長押し。渡さなければ何もしない。 */
  onLongPress?: (id: string) => void;
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
          <DayCollage
            stickers={items}
            surface={surface}
            heading={<DiaryDate date={keyToDate(k)} compact />}
            onOpen={onOpen}
            onLongPress={onLongPress}
          />
        </div>
      ))}
    </section>
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
const AUTO_ALBUM_SIZE: readonly AlbumSize[] = [
  "large",
  "portrait",
  "small",
  "landscape",
  "portrait",
  "small",
];

/**
 * 押した札から、**飛ばす絵の出発点**を作る。
 *
 * 絵の無い札（文字だけの札）では `null` — 飛ばす絵が無いので、今までどおり
 * 面がふわっと出る。写真そのものの箱を測るので、白フチや三角コーナーは
 * 含めない（飛ぶのは写真であって、貼ってある紙ではない）。
 *
 * 札は傾いていることがあり、`getBoundingClientRect` は傾きを囲む箱を返す。
 * 傾きは 4° 刻みの範囲なので差は数pxで、飛び始めの1フレームにしか効かない。
 * **傾きを解くために行列を読むほどの値は無い。**
 */
function flightFrom(button: HTMLElement): FlightOrigin | null {
  const img = button.querySelector("img");
  if (!img) return null;
  const r = img.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  // いま実際に出ている絵。`CachedImg` が端末の控えから作った `blob:` なので、
  // 飛ばす写しは**通信も復号もせずに**最初の1枚から出る。
  const url = img.currentSrc || img.src;
  if (!url) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height, url, radius: 2 };
}

/**
 * 雑誌の表紙（オーナー指示 2026-09-17、見本の絵3枚「本物のアルバムや雑誌の
 * 雰囲気を作り上げて。これらのデザインを完全再現して。タイムライン順に。」）。
 *
 * 細い罫 → その日の日付 → 大きな明朝の「今日の1ページ」＋手で引いた青い下線、
 * 右に**手書きの一言**（その日の場所と数から作る）。誌名はここに書かない —
 * 上の帯（`AppShell`）が 40px 上で同じ語を出しており、2つ並ぶと雑誌の誌名では
 * なく書き間違いに見える（実測の絵で確認）。
 *
 * 書体の使い分けは3つだけ:
 *   ・見出し … 明朝（`Shippori Mincho`。**この見出しの字だけ**に絞った 9KB）
 *   ・手書きの一言 … `Zen Kurenaido`（和文の手書き。`.handwritten-ja`）
 *   ・数字だけの所 … `Caveat`（`.handwritten`。**漢字を持たない**ので和文に当てない）
 */
export function DayMasthead({
  date,
  tagline,
}: {
  date: Date;
  /** 右の手書きの一言。無ければ出さない。 */
  tagline?: string;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());
  // **題は日付そのもの。**（オーナー指示 2026-09-22「今日のページではなく、
  // 上は今日の日付を書いて」）
  //
  // 前は小さく日付、その下に大きく「今日の1ページ」と2段だった。題が
  // 日付を言い直しているだけで、**写真が始まるまでに縦を 2 段ぶん使って
  // いた**。日付を題そのものに上げれば、1段ぶん（約 44px）が写真に回る。
  //
  // 曜日は題の上に小さく残す。1回の `toLocaleDateString` に3つ渡すと
  // 和文では「9月17日木曜日」と続いて1つの語に見えるので、分けて持つ。
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  const monthDay = date.toLocaleDateString(locale, { month: "long", day: "numeric" });
  return (
    <header className="day-masthead">
      {/* **右上の「ことば N」と横線は出さない**（オーナー指示 2026-09-22
          「ホーム画面右上の ことば０と横の線を消して」）。語の総数は図鑑に
          在り、ここでは今日の日付と写真が主役。 */}
      <div className="day-masthead__row">
        <div className="day-masthead__lead">
          <p className="day-masthead__date">{weekday}</p>
          <h1 className="day-masthead__title font-serif-ja">{monthDay}</h1>
          {/* 手で引いた下線。定規の直線だと雑誌ではなく書類に見える。
              `preserveAspectRatio="none"` で幅に追従させるので、線の太さは
              `vector-effect` で保つ（伸ばしても線が太らない）。 */}
          <svg
            className="day-masthead__rule"
            viewBox="0 0 160 10"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M3 7C28 2 52 9 78 5s52-3 79 1"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        {tagline && (
          <p className="day-masthead__tagline handwritten-ja">
            {tagline}
            <svg
              className="day-masthead__tagline-rule"
              viewBox="0 0 120 8"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M2 5C24 1 46 7 70 4s34-2 48 1"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </p>
        )}
      </div>
    </header>
  );
}

/** その札を**撮った時刻**。無い/壊れている札は保存した時刻に落とす。 */
function takenAt(s: StickerWithWord): Date {
  const d = new Date(s.taken_at ?? s.created_at);
  return Number.isNaN(d.getTime()) ? new Date(s.created_at) : d;
}

/**
 * その日の手書きの一言を作る。**作り話はしない** — 手元に在るのは
 * 「その日いちばん多く出てくる場所の名前」と「語の数」だけなので、
 * その2つだけで書く。場所が1つも無い日は場所を言わない。
 */
export function dayTagline(
  stickers: StickerWithWord[],
  t: (k: string, v?: Record<string, string | number>) => string,
): string | undefined {
  if (stickers.length === 0) return undefined;
  const tally = new Map<string, number>();
  for (const s of stickers) {
    const p = s.location_name?.trim();
    if (p) tally.set(p, (tally.get(p) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  // **長い場所の名前で1行を占領させない。** 「台北駅 地下街」のような名前が
  // そのまま入ると、手書きの一言が3行に割れて見出しを押し下げる。
  const place = top && top.length > 10 ? `${top.slice(0, 10)}…` : top;
  const n = formatCount(stickers.length);
  return place ? t("home.taglineAt", { place, n }) : t("home.tagline", { n });
}

/**
 * **今日の誌面。**（オーナー指示 2026-09-22）
 *
 * > 今のようにタイムラインで上から順に表示するのではなく、ホームを開いたら
 * > 雑誌のように撮った画像が有機的に重なり合って写真が並ぶようにしたい。
 * > また撮った時刻付きで。また写真をユーザーが指で並び替えることも可能
 *
 * ## 前の「今日の足あと」から何を変えたか
 * 縦一列の道（`DayTimeline`）をやめ、**大きさの違う写真が少しずつ傾いて
 * 重なる**置き方に戻した。置き方の計算・指での移動・つまんで大きさを
 * 変える・保存は、前に作った `lib/album-place.ts` がそのまま使える
 * （試験付き）。作り直したのは**見た目だけ**。
 *
 * ## 紙とテープは戻さない（オーナー指示 2026-09-18）
 * 台紙の紙・白フチの印画紙・三角コーナー・マスキングテープは外したまま。
 * 貼り物が増えるほど1枚あたりの場所を食い、同じ画面に入る枚数が減る。
 * 残したのは**角の丸い写真・わずかな傾き・重なり**の3つだけ。
 *
 * ## 時刻
 * 写真の肩に撮った時刻を置く。参考の誌面と同じで、**順番は時刻が語る**
 * ので、並びそのものは自由に崩せる。
 */
/**
 * 写真がまだ読めていない札・写真の無い札の縦横比。
 *
 * 升目の比（`ratioOf`）をそのまま使うと `portrait` が 2.6 になり、
 * **読み込むまで塔のような枠が並ぶ**。写真の無い語の札も同じ形で出るので、
 * 少しだけ縦長の、写真らしい比に寄せる。
 */
const PLACEHOLDER_RATIO = 1.2;

/**
 * 写真の下に付く字の高さ。**px で持つ。**
 *
 * `packCollage` に渡して、次の札がここへ乗らないようにする。
 *
 * ## なぜ割合ではなく px か
 * ここは前まで「台紙の幅に対する割合」だった。ところが**字の大きさは
 * px で決まっている**ので、紙が細い画面ほど1行に入る字数が減り、
 * 同じ一言が**行数だけ増える**。割合で取ると、細い画面でそのぶんが
 * 足りなくなる — 実測 320px の画面で、1枚目の一言（3行に増えた）の
 * 下 16px に次の写真が乗った。360px 以上では偶然足りていた。
 *
 * 数え方（`styles.css` の `.collage__cap` 系と対で決まる）:
 *   `CAP_ROW_PX`  … 語の白い札 19px × 1.2 ＋ 上下の詰め 5px ＋ 写真との間 4px
 *                   （語を大きくした: オーナー指示 2026-09-23）
 *   `CAP_NOTE_PX` … 手書きの一言 13px × 1.35 × **3行**（`-webkit-line-clamp`）
 *                   ＋ 上の間 3px。行数の上限が CSS 側に在るので、
 *                   どれだけ長い一言でもここを越えない。
 */
const CAP_ROW_PX = 32;
const CAP_NOTE_PX = 56;

/**
 * **文字から調べた語の枠の高さ（px）。**（オーナー指示 2026-09-22
 * 「文字で検索したものは文字だけをアルバムに書いて」）
 *
 * 写真の無い札は、枠の中に**時刻と語と一言をそのまま書く**。写真と同じ
 * 作りにして字だけを枠の外へ出すと、**枠のぶんの空白が字の上に残り**、
 * 時刻が語から1行離れて別々の物に見えた（実測: 「獎學金」と「21:30」が
 * 上下に離れて並んだ）。
 *
 * こちらも px。語は 22px（`--text-title`）の1行で、一言が付けば
 * 写真の札と同じ3行ぶん。**44px を下回らせない**（§11 の指の当たり判定。
 * 実測 170×35 で落ちていた）。
 */
const PLAIN_WORD_PX = 32;
const MIN_TAP_PX = 44;

/** 写真を壁に留める物（`lib/collage-decor.ts`）。 */
function CollageFasteners({ id, wall }: { id: string; wall: WallId }) {
  const d = decorFor(id, wall);
  if (d.kind === "none") return null;
  if (d.kind === "pin") {
    // コルクの壁は**画鋲**。頭の色は4色、位置は上の辺の真ん中あたり。
    return (
      <span
        aria-hidden="true"
        className={`collage-pin collage-pin--${d.color}`}
        style={{ left: `${d.x}%` }}
      />
    );
  }
  if (d.kind === "corners") {
    return (
      <>
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <span key={c} aria-hidden="true" className={`collage-corner collage-corner--${c}`} />
        ))}
      </>
    );
  }
  return (
    <>
      {d.tapes.map((tp) => (
        <span
          key={tp.spot}
          aria-hidden="true"
          className={`collage-tape collage-tape--${tp.spot} collage-tape--${tp.color}`}
          style={{ rotate: `${tp.rot}deg` }}
        />
      ))}
    </>
  );
}

export function DayCollage({
  stickers,
  onOpen,
  onLongPress,
  opening,
  surface = "album-bg-paper",
  heading,
}: {
  /** 板の上に直に書く日付（`DiaryDate`）。オーナー指示 2026-09-23。 */
  heading?: React.ReactNode;
  /**
   * 壁の地（`album-bg-*`）。既定は紙（オーナー指示 2026-09-22「やっぱり
   * 背景、壁が必要だわ」）。
   */
  surface?: string;
  stickers: StickerWithWord[];
  onOpen: (id: string, from?: FlightOrigin | null) => void;
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
  const uiLang = useUiLang();
  const isEn = uiLang === "en";
  /** 時刻の書き方は表示言語に従う（24時制は下の `hour12: false`）。 */
  const locale = localeOf(uiLang);
  const persistLayout = useServerFn(saveAlbumLayout);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [ordered, setOrdered] = useState(stickers);
  const dragId = useRef<string | null>(null);
  const dragged = useRef(false);
  const changed = useRef(false);
  /**
   * 表から届いた札を並べ直す。
   *
   * **`editing` を合図にしない**（オーナー報告 2026-09-15「画像を大きく
   * したり、サイズを変えても結局元に戻る」）。前はここの合図に `editing`
   * が入っていたので、「完了」を押して `editing` が false になった**その
   * 瞬間**にこれが走り、まだ表に届いていない古い `stickers` で
   * `ordered` を上書きしていた。つまり**指で直した置き方は、保存の往復が
   * 終わる前に必ず捨てられていた** — 表の列が在っても無くても関係なく、
   * 100% 元に戻る。
   *
   * 見るのは `stickers` だけ。表から新しい札が届いたときにだけ並べ直す。
   */
  useEffect(() => {
    if (editing) return;
    setOrdered(
      [...stickers].sort(
        (a, b) =>
          (a.album_order ?? Number.MAX_SAFE_INTEGER) - (b.album_order ?? Number.MAX_SAFE_INTEGER),
      ),
    );
    // `editing` は**わざと外してある**（上の注）。入れると、編集を抜けた
    // 瞬間に古い値で上書きされ、直した置き方が毎回消える。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickers]);
  /**
   * 台紙の実寸。**割合で持っている座標を px に直すのに要る。**
   * 画面の幅が変わったら測り直す（横向きにした回に全部ずれないように）。
   */
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [board, setBoard] = useState({ w: 0, h: 0 });
  /**
   * **描かれる前に測る。**（オーナー報告 2026-09-16
   * 「ホームに移るたびに、アルバムの画像が高速で変な縮尺で移動する不具合」）
   *
   * ここは `useEffect` だった。`useEffect` は**画面に描かれたあと**に走るので、
   * 最初の1枚は `board.w === 0` のまま描かれる — 札の大きさも位置も
   * `board.w` から出しているので、**全部が潰れた形で一度描かれ、直後に
   * 正しい寸法へ飛ぶ**。台紙の高さも `minHeight: 20rem` から本来の高さへ
   * 跳ねる。ちょうど同時に貼り付く演出（`album-open`）が走っているので、
   * 「高速で変な縮尺で移動する」ように見えていた。
   *
   * `useLayoutEffect` なら描かれる前に走り、その場の再描画も描画前に
   * 終わる。**間違った寸法の枚は一度も画面に出ない。**
   */
  useLayoutEffect(() => {
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
  /**
   * 札ごとの「大きさの種類」。**表にはまだこの列が在る**ので、
   * 初期の寸法と縦横の比はここから決まる（オーナー指示 2026-09-15
   * 「デフォルトで表示するのは今までと同じ大きさにして」）。
   */
  const sizes = useMemo(
    () => ordered.map((s, i) => s.album_size ?? AUTO_ALBUM_SIZE[i % AUTO_ALBUM_SIZE.length]),
    [ordered],
  );
  /**
   * 写真そのものの縦横の比。**読み込めた札はこちらを使う。**
   *
   * オーナー報告 2026-09-15「横長だと元の取った画像の上や下が見切れてる
   * 部分がある」。札の形を升目から決め、写真は `object-cover` で流し込んで
   * いたので、**形が合わない写真は必ず切られていた**（横長の写真を縦長の
   * 枠に入れれば、上下が落ちる）。
   *
   * 枠の形を**写真に合わせる**のがいちばん素直な答え。切る所が無くなるので、
   * 大きさを変えれば写真全体がそのまま大きくなる。横幅は升目のまま
   * （並びの律動は保つ）で、高さだけが写真に従う。
   */
  const [photoRatio, setPhotoRatio] = useState<Record<string, number>>({});
  // 設定で主役を選んでいれば、そちらが画面の意図(自撮り)に勝つ。
  const photoPref = usePhotoPref();
  // **アルバムだけの選択**(長押しで選んだ物)。札の枚数だけ hook を呼ばない
  // よう、束で読んで `surfaceKey` で引く。
  const surfaceRoles = useSurfaceRoleMap();

  /**
   * その札に貼る写真。**置き方の計算と描画で同じ答えを使う。**
   *
   * 写真が在るか無いかで枠の比が変わる（`PLAIN_RATIO`）ので、
   * 描くときに初めて決めると、計算した置き場所と描く形がずれる。
   */
  const heroById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const s of stickers) {
      m.set(
        s.id,
        stickerPhotoUrl(s, {
          prefer: resolveSurfaceRole({
            surfaceRole: surfaceRoles[surfaceKey("album", s.id)] ?? null,
            heroRole: s.hero_role,
            screenIntent: resolvePrefer(photoPref, "selfie"),
          }),
          exclude: ["placeholder"],
        }) ?? null,
      );
    }
    return m;
  }, [stickers, surfaceRoles, photoPref]);
  /**
   * その札の枠の縦横比。**置き方の計算と、描く形で同じ1つの数を使う。**
   *
   * 別々に出すと、積んだ高さと実際の高さがずれて**次の札が字の上に乗る**。
   * 写真の比は誌面に収まる範囲へ丸める（`collageRatio`）— 縦長の1枚が
   * 画面の半分を占めると、その日の他の写真が1枚も見えない。
   * 写真の無い語の札は丸めない（字は1〜2行しか無い）。
   */
  const frameRatio = useMemo(() => {
    const hasNote = new Map(stickers.map((s) => [s.id, Boolean(s.caption)]));
    /**
     * 字だけの札の高さ（px）→ 比。
     *
     * 割るのは**いちばん細い札の幅**。札ごとの幅は `packCollage` の中で
     * `id` から決まるので、ここからは見えない。細いほうに合わせておけば、
     * 太い札では枠が字より少し高くなるだけ — 枠は見えないので、余るのは
     * 字の**下**の空白であって、隠れる物は無い。
     */
    const narrowest = Math.max(board.w * COLLAGE_COL_W * 0.78, 1);
    return (id: string) => {
      if (heroById.get(id)) return collageRatio(photoRatio[id] ?? PLACEHOLDER_RATIO);
      const px = Math.max(PLAIN_WORD_PX + (hasNote.get(id) ? CAP_NOTE_PX : 0), MIN_TAP_PX);
      // 台紙をまだ測れていない最初の1枚は、ほどほどの比で場所を取っておく。
      return board.w ? px / narrowest : 0.3;
    };
  }, [heroById, photoRatio, stickers, board.w]);
  /**
   * まだ自分で置いていない札の置き場所。**誌面の石積み**（`packCollage`）。
   *
   * **`ordered` ではなく、表から届いた並び（`stickers`）で決める。**
   * 重なり順のために `ordered` を入れ替えるので（下の `bringToFront`）、
   * そちらで決めると**触った札とは関係のない札まで置き場所が動く**。
   * 置き場所は「その札が何番目に撮られたか」で決まるべきで、
   * 「さっき誰を触ったか」で変わってはいけない。
   *
   * 昔の升目（`packAuto`）は1段の高さが決め打ちだったので、縦長の写真が
   * 1枚入るだけでその下に大きな空きができていた（実測 7枚で台紙 2550px）。
   * 写真の**実際の縦横比**から積む。
   */
  const autoById = useMemo(() => {
    const base = [...stickers].sort(
      (a, b) =>
        (a.album_order ?? Number.MAX_SAFE_INTEGER) - (b.album_order ?? Number.MAX_SAFE_INTEGER),
    );
    const places = packCollage(
      base.map((s, i) => ({
        id: s.id,
        // 写真が読めていればその比。まだなら昔の升目の比で場所を取っておく
        // （0 にすると、読み込むたびに下の札が突き上げられる）。
        // 写真が読めていればその比。まだなら**ほどほどの比で場所を取る** —
        // 升目の比をそのまま使うと `portrait` が 2.6 になり、読み込むまで
        // 塔のような枠が並ぶ（写真の無い語の札も同じ）。
        ratio: frameRatio(s.id),
        /**
         * 写真の下に付く字のぶん。**一言が在る札だけ余分に要る。**
         * 字だけの札は枠の中に書くので、外に足すぶんは無い。
         *
         * px を台紙の幅で割って割合に直す（`packCollage` は割合で積む）。
         */
        extra:
          heroById.get(s.id) && board.w
            ? (CAP_ROW_PX + (s.caption ? CAP_NOTE_PX : 0)) / board.w
            : 0,
      })),
    );
    const map = new Map<string, Placement>();
    base.forEach((s, i) => map.set(s.id, places[i]));
    return map;
  }, [stickers, frameRatio, heroById, board.w]);
  const items = useMemo(
    () =>
      ordered.map((s, i) => ({
        sticker: s,
        /**
         * 紙の上のどこに、どの大きさ、どの傾きで置くか。
         *
         * 指で動かした値が在ればそれを使い、無ければ昔の升目の位置。
         * **升目に飛ぶのは最初の1回だけ**で、そこから先は連続値。
         */
        place: placementFrom(
          { x: s.album_x, y: s.album_y, scale: s.album_scale, rot: s.album_rot },
          autoById.get(s.id) ?? placeFromCell({ col: 0, row: 0 }, sizes[i], s.id),
        ),
        /**
         * 縦横の比。**写真が読めていれば写真の比**、まだなら升目の比。
         * 指で広げても比は変わらない（横長の写真が縦長にならない）。
         */
        ratio: frameRatio(s.id),
        /**
         * 重なりの順。**並びの後ろほど上。**（オーナー指示 2026-09-15
         * 「後から画像と画像を重ねた場合は、後から重ねた部分を上に表示する」）
         * 触った札を並びの最後へ送るので（`bringToFront`）、最後に触った物が
         * いちばん上に来る。`album_order` がそのまま保存されるので、
         * 次に開いても同じ重なりで出る。
         */
        z: 10 + i,
      })),
    [ordered, autoById, sizes, frameRatio],
  );
  /**
   * 台紙の高さ（幅に対する割合）。**中身から決める。**
   * 縦を幅で測っているので、ここが伸びても置いてある札は動かない。
   */
  const boardH = useMemo(() => boardHeight(items), [items]);

  function layoutPayload(next = ordered) {
    return next.map((s, order) => {
      const size = s.album_size ?? AUTO_ALBUM_SIZE[order % AUTO_ALBUM_SIZE.length];
      const p = placementFrom(
        { x: s.album_x, y: s.album_y, scale: s.album_scale, rot: s.album_rot },
        autoById.get(s.id) ?? placeFromCell({ col: 0, row: 0 }, size, s.id),
      );
      return {
        sticker_id: s.id,
        order,
        // 升目はもう画面では見ていないが、**縦横の比の出どころ**なので
        // 一緒に送る。消すと、次に開いたとき比が分からなくなる。
        size,
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
    void persistLayout({ data: { items: layoutPayload() } }).then(
      (res) => {
        /**
         * **表に列がまだ無いなら、黙って諦めない。**
         *
         * `saveAlbumLayout` は列が無いと並び順だけ書いて `placement: false`
         * を返す。黙っていると「動かしたのに次に開くと戻っている」だけが
         * 残り、原因が誰にも分からない。
         */
        if (res && res.placement === false) {
          toast.error(t("home.placementNotSaved"));
          return;
        }
        // 書けたので表から読み直す。読み直さないと、次にこの画面を
        // 組み直したとき古い値で描かれる。
        void qc.invalidateQueries({ queryKey: ["stickers"] });
      },
      () => toast.error(t("home.placementSaveFailed")),
    );
  }
  /**
   * 置き方を書き戻し、**その札を並びの最後（＝いちばん上）へ送る**。
   * **指を離したときだけ**呼ぶ。
   *
   * オーナー指示 2026-09-15「後から画像と画像を重ねた場合は、後から重ねた
   * 部分を上に表示するようにして」。重なりは並び順 `album_order` がそのまま
   * 持つので、次に開いても同じ重なりで出る。
   */
  function commitPlace(id: string, p: Placement) {
    changed.current = true;
    setOrdered((xs) => {
      const i = xs.findIndex((s) => s.id === id);
      if (i < 0) return xs;
      const moved = {
        ...xs[i],
        album_x: p.x,
        album_y: p.y,
        album_scale: p.scale,
        album_rot: p.rot,
      };
      const rest = xs.filter((_, k) => k !== i);
      return [...rest, moved];
    });
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
      pendingPlace.current = applyDelta(g.startPlace, d, board.w, boardH);
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
  }, [live, board, boardH]);

  return (
    // **壁に貼った誌面**（オーナー指示 2026-09-22「ホーム画面、やっぱり背景、
    // 壁が必要だわ…前のように壁に付箋や四隅を固定して画像を張るようにして」）。
    // 2026-09-18 に外した紙とテープを、**写真の載る所だけ**に戻した。
    <div className={`collage collage-board relative ${surface} ${opening ? "album-open" : ""}`}>
      {editing && (
        /**
         * **画面に貼り付ける。台紙に貼らない。**（オーナー報告 2026-09-15
         * 「完了ボタンが上にあるから、その日の下の方の画像を大きさを変えたり
         * すると完了ボタンが押せずに保存ができない」）
         *
         * ここは `absolute right-3 top-3` で**台紙の左上隅**に置いてあった。
         * 台紙は札の数だけ縦に伸びるので、下の方の札をいじっている人の画面から
         * ボタンは完全に外れる。押せない = **保存できない**。
         * 触っている所の近くに常に在るよう、画面の下に固定する
         * （下のタブ帯のすぐ上。親指がいちばん届く所）。
         */
        <button
          type="button"
          onClick={finishEditing}
          className="lift fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-5 text-footnote font-semibold text-primary-foreground shadow-xl"
        >
          <Check className="h-4 w-4" />
          {t("album.done")}
        </button>
      )}
      {heading && <div className="collage-heading">{heading}</div>}
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
        // 高さは中身から。決め打ちの形にすると、札が増えた日に下がはみ出す。
        style={
          {
            height: board.w ? `${board.w * boardH}px` : undefined,
            minHeight: "20rem",
            /**
             * **字の幅の上限**（`COLLAGE_CAP_W`）。写真は真ん中を越えて
             * 重なるが、字は自分の側の外半分から出ない。ここで px に直して
             * 渡すのは、CSS の `%` が**札の幅**に対する割合になってしまう
             * から（札ごとに幅が違うので、揃った線にならない）。
             */
            "--cap-w": board.w ? `${Math.round(board.w * COLLAGE_CAP_W)}px` : undefined,
          } as React.CSSProperties
        }
      >
        {items.map(({ sticker: s, place: saved, ratio, z }) => {
          const place = currentPlace(s.id, saved);
          const px = sizePx(place, board.w, ratio);
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
          const heroUrl = heroById.get(s.id) ?? null;
          /** 撮った時刻。**24時制**（桁が揃うので、誌面の中で列に見える）。 */
          const time = takenAt(s).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          return (
            <button
              key={s.id}
              /* 写真の無い札。**枠が字の高さしか無い**ので、指の当たり判定の
                 下限（§11 の 44px）を CSS 側でも保証する。 */
              data-plain={heroUrl ? undefined : ""}
              onClick={(e) => {
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
                onOpen(s.id, flightFrom(e.currentTarget));
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
              /**
               * どちらの列に居るか。**字を外側の端に寄せる**ために要る。
               * 内側（真ん中）に寄せると、左右の列は少し重なっているので、
               * 隣の列の写真に潜って時刻も語も読めなくなる（実測で2枚）。
               */
              data-col={place.x < 0.5 ? "l" : "r"}
              /**
               * **語は写真の真ん中の下が基本**（オーナー指示 2026-09-23「基本的に
               * 写真の真ん中下に来るようにして。場合によっては右下や左下に来ても
               * いい」）。真ん中に置くと隣の列の写真に潜る時だけ、外側の端へ寄せる
               * （`captionAlign`）。
               */
              data-cap={captionAlign(place.x, px.w, board.w)}
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
                  /**
                   * **縦は px で置く。`%` にしない。**
                   *
                   * `place.y` は「台紙の**幅**に対する割合」（`Placement` の
                   * 注。そう決めたのは、札が増えて台紙が縦に伸びても置いた
                   * 物が動かないようにするため）。ところが CSS の `top: N%`
                   * は**親の高さ**に対する割合なので、ここで `%` を使うと
                   * 台紙の高さぶんだけ倍率が掛かる。
                   *
                   * 升目の頃は y が小さく、台紙の高さも下限（1.25）に
                   * 貼り付いていたので誤差で済んでいた。誌面にして縦に
                   * 積むようになった途端、**下の札ほど大きく流れ落ちる**
                   * （実測: 台紙の高さ 928px に対して札の上端が 1922px）。
                   */
                  top: `${place.y * board.w}px`,
                  width: `${px.w}px`,
                  height: `${px.h}px`,
                  /**
                   * **札は台紙より大きくならない。**（オーナー報告 2026-09-16
                   * 「ホームのアルバムに移った時に画像の変な残像がある」）
                   *
                   * 大きさは測った台紙の幅から出している（`sizePx`）。測り
                   * 損ねた一瞬があると、その値のまま**巨大な札が描かれる** —
                   * 録画では2コマだけ、写真が幅いっぱいに広がって「これまでの
                   * ページ」の見出しを覆っていた。
                   *
                   * 測る側は前回 `useLayoutEffect` にしたが、それは「幅が 0」
                   * の side しか塞げない。**値が大きすぎる側も塞ぐ。** 札が
                   * 台紙をはみ出すことは、正しい測定値では起こり得ないので、
                   * ここで上限を置いても正しい絵は1pxも変わらない。
                   */
                  maxWidth: "100%",
                  maxHeight: "100%",
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
              {/**
               * **写真そのもの。** 角を丸め、地から浮かせる。白フチも
               * 三角コーナーも付けない（オーナー指示 2026-09-18）。
               *
               * **文字から調べた語には写真が来ない。** そういう札は
               * 枠も地も持たせず、**字だけを紙に書く**
               * （オーナー指示 2026-09-22「文字で検索したものは文字だけを
               * アルバムに書いて」）。
               */}
              {heroUrl ? (
                <span className="collage__photo">
                  <CachedImg
                    onLoad={(e) => {
                      // 写真そのものの比を控える。**枠の形をこれに合わせる**
                      // ので、上下も左右も切られなくなる。
                      const img = e.currentTarget;
                      if (!img.naturalWidth || !img.naturalHeight) return;
                      const r = img.naturalHeight / img.naturalWidth;
                      setPhotoRatio((m) => (m[s.id] === r ? m : { ...m, [s.id]: r }));
                    }}
                    src={heroUrl}
                    alt={t("common.memoryOf", { word: s.word.headword })}
                    loading="lazy"
                    decoding="async"
                    className="block h-full w-full object-cover"
                  />
                </span>
              ) : (
                /**
                 * **字だけの札。** 枠も地も影も持たせず、紙に字を書いただけに
                 * する（オーナー指示 2026-09-22「文字で検索したものは文字だけを
                 * アルバムに書いて」）。
                 *
                 * 時刻も一言も**この中に**書く。写真の札と同じに枠の外へ
                 * 出すと、枠のぶんの空白が字の上に残り、時刻が語から1行
                 * 離れて別々の物に見えた。
                 */
                <span className="collage__plain">
                  <span className="collage__cap-row">
                    <span className="collage__time">{time}</span>
                    <Term lang={s.word.language} className="collage__plain-word">
                      {s.word.headword}
                    </Term>
                  </span>
                  {s.caption && (
                    <span className="collage__note handwritten-ja ja-phrase">{s.caption}</span>
                  )}
                </span>
              )}

              {/* 留め具（テープか四隅）。**写真の札だけ** — 字だけの札は
                  紙に直に書いた物なので留めない。 */}
              {heroUrl && <CollageFasteners id={s.id} wall={wallFromClass(surface)} />}
              {/**
               * 写真の下に付く字。**枠の外に出す**ので、置き方の計算には
               * `extra` として高さを渡してある（渡さないと次の札が乗る）。
               *
               * 参考の誌面と同じ並び:
               *   時刻 ＋ 語の白い札 → 手書きの一言
               */}
              {heroUrl && (
                <span className="collage__cap">
                  <span className="collage__cap-row">
                    {/* 撮った時刻（オーナー指示 2026-09-22「また撮った時刻付きで」）。
                     **順番は時刻が語る**ので、置き方は自由に崩してよくなる。 */}
                    <span className="collage__time">{time}</span>
                    {/* 語は**白い紙の札**。写真の上に直に置くと明るい写真で
                        読めなくなるし、参考の誌面でも札は紙の上に貼ってある。 */}
                    <Term lang={s.word.language} className="collage__slip">
                      {s.word.headword}
                    </Term>
                  </span>
                  {/* 撮ったときに書いた一言。**人が書いた字は手書き**
                      （ゴシックはアプリが書く字、という約束）。 */}
                  {s.caption && (
                    <span className="collage__note handwritten-ja ja-phrase">{s.caption}</span>
                  )}
                </span>
              )}
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
          /**
           * **地の色に追従させる。**（`text-album-ink` は紙の台紙の上に
           * 書くための固定のインクで、台紙は 2026-09-18 に外してある。
           * 固定のまま残っていたので、**暗い画面で 1.45:1** しか無く、
           * ほぼ読めなかった。）
           */
          className={`text-body text-muted-foreground ${isEn ? "handwritten" : "font-medium tracking-[0.02em]"}`}
        >
          — {formatCount(stickers.length)}
          {t("home.memories")}
        </span>
      </div>
    </div>
  );
}
