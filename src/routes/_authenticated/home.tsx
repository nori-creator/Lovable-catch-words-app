import { MemorialReveal } from "@/components/MemorialReveal";
import { JIGGLE, jiggleStyle, LIFTED } from "@/lib/album-drag";
import { CollageFasteners } from "@/components/AlbumPrint";
import {
  applyDelta,
  boardHeight,
  COLLAGE_CAP_MIN,
  COLLAGE_CAP_W,
  captionAlign,
  gestureDelta,
  placeFromCell,
  placementFrom,
  settle,
  sizePx,
  type AlbumSize,
  type Grip as FingerGrip,
  type Placement,
  type Pt,
} from "@/lib/album-place";
import {
  albumHeroUrl,
  AUTO_ALBUM_SIZE,
  CAP_NOTE_PX,
  CAP_ROW_PX,
  PLACEHOLDER_RATIO,
  settleDayAlbum,
} from "@/lib/album-day-layout";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { groupBySpan, keyToDate } from "@/lib/album-span";
import { usePhotoPref } from "@/lib/photo-pref";
import { pickStickerPhoto, stickerPhotoUrl } from "@/lib/sticker-photo";
import { surfaceKey, useSurfaceRoleMap } from "@/lib/photo-surface";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readHomeSnapshot, writeHomeSnapshot } from "@/lib/home-cache";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { InstallBanner } from "@/components/InstallApp";
import { HomeShelf } from "@/components/HomeShelf";
import { LoadFailed } from "@/components/LoadFailed";
import { StickerSheet } from "@/components/StickerSheet";
import type { HeroOrigin as FlightOrigin } from "@/components/use-hero-reveal";
import { listMyStickers, saveAlbumLayout, type StickerWithWord } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { CachedImg, warmCachedImages } from "@/lib/image-cache";
import { CaptionEditDialog, type CaptionTarget } from "@/components/CaptionEditDialog";
import { Term } from "@/components/Term";
import {
  listPendingCaptures,
  removePendingCapture,
  type PendingCapture,
} from "@/lib/offline-queue";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  dismissMemorial,
  milestoneToday,
  pickHighlights,
  wasMemorialDismissed,
} from "@/lib/milestone-album";
import { scheduleMilestoneNotification } from "@/lib/milestone-schedule";
import { BookText, Camera, Check, EyeOff, Pencil, Trash2, Undo2, WifiOff, X } from "lucide-react";
import { homeBlankMessage, streakEndingYesterday } from "@/lib/home-blank";
import { baseStickerId, isEncounterAlbumId, mergeAlbumEncounters } from "@/lib/album-encounters";
import { useAlbumHidden } from "@/lib/album-hidden";
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
  /**
   * `?memorial=30`: 節目の通知から来た時、その記念アルバムを開く
   * （`lib/milestone-album.ts`、`lib/deep-link.ts`）。
   */
  validateSearch: (search: Record<string, unknown>): { memorial?: number } => {
    const m = Number(search.memorial);
    return Number.isInteger(m) && m > 0 && m < 100000 ? { memorial: m } : {};
  },
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
  const [homeSnapshot] = useState(() =>
    readHomeSnapshot<Awaited<ReturnType<typeof listMyStickers>>>(),
  );
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
    // 前に届いた一覧を最初の描画で出す（R17 起動の速さ、`lib/home-cache.ts`）。
    initialData: () => homeSnapshot?.data,
    initialDataUpdatedAt: homeSnapshot?.at,
  });
  useEffect(() => {
    writeHomeSnapshot(stickers);
  }, [stickers]);
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * **節目の日の記念アルバム**（オーナー指示 2026-09-27、`lib/milestone-album.ts`）。
   * 使い始めた日（アカウントを作った日）から数えて節目なら、今日の誌面の上に
   * 入口を出す。節目の通知から来た時（`?memorial=30`）はそのまま開く。
   */
  const { memorial: memorialParam } = Route.useSearch();
  const startedAt = profile?.created_at ? new Date(profile.created_at) : null;
  const memorialToday = startedAt ? milestoneToday(startedAt, new Date()) : null;
  const [memorialOpen, setMemorialOpen] = useState<number | null>(memorialParam ?? null);
  const [memorialHidden, setMemorialHidden] = useState(false);
  useEffect(() => {
    if (memorialParam) setMemorialOpen(memorialParam);
  }, [memorialParam]);
  useEffect(() => {
    if (profile?.created_at) void scheduleMilestoneNotification(new Date(profile.created_at));
  }, [profile?.created_at]);
  const memorialPicks = useMemo(
    () =>
      pickHighlights(
        (stickers?.items ?? []).map((s) => ({
          ...s,
          hasPhoto: !!stickerPhotoUrl(s),
          // 記念の1枚は自動で並べ直す（元の日に指で置いた位置は使わない）。
          album_x: null,
          album_y: null,
          album_scale: null,
          album_rot: null,
          album_order: null,
        })),
      ),
    [stickers],
  );
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

  const today = new Date();

  /**
   * アルバムに貼る物 = 札 ＋ **再会の写真**（オーナー指示 2026-09-23、
   * `lib/album-encounters.ts`）。再会の写真はその日の札の写しとして並ぶ。
   */
  const albumItems = useMemo(
    () => mergeAlbumEncounters(stickers?.items ?? [], stickers?.albumEncounters),
    [stickers],
  );

  /**
   * 図鑑と同じ上限に当たっているか。**当たっているならそう言う**(§8)。
   *
   * ホームは日付ごとに遡る画面なので、古い日が黙って消えると
   * **その日は何も撮らなかった**ように見える。
   */
  const total = stickers?.total ?? stickers?.items.length ?? 0;
  const shown = stickers?.items.length ?? 0;
  const truncated = stickers?.truncated ?? false;

  /*
   * **ホームに日記は出さない**（オーナー指示 2026-09-22「ホームの日記は
   * 消して」）。前はここで日記を読み、過去の日の写真の向かいに挟んでいた。
   * 日記そのもの（`/journal` と `DayJournalPage`）は消していない。
   */
  return (
    <AppShell>
      {/*
        **アプリの一番上に、部屋に置いた 3D の本棚**（オーナー指示 R17「本棚が小さすぎる。
        また空中に本棚がただあるデザイン不自然。3D のリアルな本棚をアプリの上部に設置して」、
        参考画像 A〜D。撮った月の本だけが並ぶ）。本を押すと全画面に広がり、その月の最初の日の
        見開きが開く。下へ続く日ごとのアルバムはそのまま。
      */}
      <HomeSurface
        albumItems={albumItems}
        today={today}
        surfaceClass={surfaceClass}
        detailOpen={openId !== null}
        loading={isLoading}
        failed={
          isError ? (
            // 失敗を「今日はまだ何も無い」と描いていた。しかも日記への唯一の入口が
            // この else の中にあるので、エラーのときは日記にも辿り着けなくなる。
            <LoadFailed
              onRetry={() => void refetch()}
              retrying={isFetching}
              what={t("err.whatHome")}
            />
          ) : null
        }
        blankMessage={homeBlankText(albumItems, total, today, t)}
        onOpen={(id, from) => {
          setOpenId(baseStickerId(id));
          setOpenFrom(from ?? null);
        }}
        onLongPress={(id) => {
          setOpenId(baseStickerId(id));
          setOpenFrom(null);
          setOpenPhotoPicker(true);
        }}
        truncated={truncated}
        shown={shown}
        total={total}
      >
        <PendingCapturesBanner />
        {memorialToday &&
          !memorialHidden &&
          memorialPicks.length > 0 &&
          !wasMemorialDismissed(memorialToday) && (
            <MemorialEntry
              n={memorialToday}
              words={total}
              picks={memorialPicks}
              onOpen={() => setMemorialOpen(memorialToday)}
              onDismiss={() => {
                dismissMemorial(memorialToday);
                setMemorialHidden(true);
              }}
            />
          )}
      </HomeSurface>
      {memorialOpen !== null && memorialPicks.length > 0 && (
        <MemorialAlbum
          n={memorialOpen}
          words={total}
          picks={memorialPicks}
          surface={surfaceClass}
          onOpen={(id, from) => {
            setOpenId(baseStickerId(id));
            setOpenFrom(from ?? null);
          }}
          onClose={() => {
            dismissMemorial(memorialOpen);
            setMemorialHidden(true);
            setMemorialOpen(null);
            if (memorialParam) void navigate({ to: "/home", search: {}, replace: true });
          }}
        />
      )}
      {/* 1度だけ出す「ホーム画面に追加」の案内（閉じたら出さない。設定からはいつでも）。 */}
      <InstallBanner />
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
 * **ホームの画面そのもの**（本棚・今日の誌面・これまでの日）。
 *
 * 本物のホーム（`HomePage`）と**チュートリアルが同じこの部品を描く**（オーナー指示
 * 2026-09-29「チュートリアルの画面…はアプリ本体をアップデートしたら自動的に変化する
 * ようにして」「勝手にアプリを再現するのではなく、アプリそのものを使って」）。
 * 前はチュートリアルが `DayCollage` を自分で並べていたので、本棚や壁の続きなど
 * ホームに足した物がチュートリアルには出なかった。
 *
 * データの取り方・詳細の開き方・案内の帯は呼ぶ側が持つ。ここは**描くだけ**。
 */
export function HomeSurface({
  albumItems,
  today,
  surfaceClass,
  detailOpen = false,
  loading = false,
  failed = null,
  blankMessage,
  opening = true,
  onOpen,
  onLongPress,
  shelfLoaders,
  truncated = false,
  shown,
  total,
  children,
}: {
  albumItems: StickerWithWord[];
  today: Date;
  surfaceClass: string;
  /** 単語の詳細が開いている（本の片ページの層をその下へ回す）。 */
  detailOpen?: boolean;
  loading?: boolean;
  /** 読み込みに失敗したときに出す物（出すなら、誌面の代わりにこれを出す）。 */
  failed?: React.ReactNode;
  blankMessage?: string;
  /** 今日の1冊の表紙が開く演出。 */
  opening?: boolean;
  onOpen: (id: string, from?: FlightOrigin | null) => void;
  onLongPress?: (id: string) => void;
  /** 本棚の日記の読み書き（チュートリアルは端末の中だけで済ませる）。 */
  shelfLoaders?: Parameters<typeof HomeShelf>[0]["loaders"];
  truncated?: boolean;
  shown?: number;
  total?: number;
  /** 本棚の下・誌面の上に挟む帯（未送信の写真・記念日など）。 */
  children?: React.ReactNode;
}) {
  const todayKey = dayKey(today);
  /**
   * 今日の1冊は**必ず日で切る**。今日は「今日」であって週でも月でもない。
   * 束ね方が効くのは、下に続く「これまでのページ」のほう。
   */
  const byDay = useMemo(
    () => groupBySpan(albumItems, (s) => new Date(s.created_at), "day"),
    [albumItems],
  );
  const todayStickers = byDay.find(([k]) => k === todayKey)?.[1] ?? [];
  /**
   * 今日より前の日。**日ごとに、新しい順に並べて下へ続ける**
   * (オーナー指示 2026-08-25「ホームの本棚の機能を全削除して、
   * 前のように下スクロールで過去が見える形に戻して」)。
   */
  const pastGroups = useMemo(() => {
    const past = albumItems.filter((s) => dayKey(new Date(s.created_at)) !== todayKey);
    return groupBySpan(past, (s) => new Date(s.created_at), "day");
  }, [albumItems, todayKey]);
  const ready = !loading && !failed && albumItems.length > 0;
  const albumHidden = useAlbumHidden();
  return (
    /*
      **アプリの一番上に、部屋に置いた 3D の本棚**（オーナー指示 R17「本棚が小さすぎる。
      また空中に本棚がただあるデザイン不自然。3D のリアルな本棚をアプリの上部に設置して」、
      参考画像 A〜D。撮った月の本だけが並ぶ）。本を押すと全画面に広がり、その月の最初の日の
      見開きが開く。下へ続く日ごとのアルバムはそのまま。
      本棚・今日・過去の日まで**1枚の壁**（`.home-scene`。オーナー指示 2026-09-29「9/29 の
      周りのデザインをそれより下のすべての日にちにも適用して」）。巾木は一番下の日の後。
    */
    <div className={ready ? "home-scene" : undefined}>
      {ready ? (
        <HomeShelf
          items={albumItems}
          loaders={shelfLoaders}
          hiddenIds={albumHidden.hidden}
          detailOpen={detailOpen}
          // 本の左ページは、**ホームのアルバムと同じ部品**（置き方・並べ替え・タップで単語の詳細・
          // ひと言の編集）。オーナー指示 2026-09-30「日記の左側にホームと全く同じ操作で」。
          renderDayPage={(stickers) => (
            <DayCollage
              key={stickers[0]?.id}
              stickers={stickers}
              onOpen={onOpen}
              onLongPress={onLongPress}
              surface={surfaceClass}
            />
          )}
        />
      ) : null}
      {/* **日付は壁紙に直に書く**（オーナー指示 2026-09-23「ホーム画面の日付は
        背景の壁紙に直接書いて。日記のように」）。上の見出しの帯はやめ、
        今日の誌面の板の中（`DayCollage` の `heading`）に書く。 */}
      {children}
      {loading ? (
        <HomeLoading />
      ) : failed ? (
        failed
      ) : todayStickers.length === 0 ? (
        <HomeEmptyState surface={surfaceClass} date={today} message={blankMessage} />
      ) : (
        /* 表紙が開く演出は**今日の1冊だけ**(オーナー指摘⑪)。
          過去の日にも付けると、遡るたびに何十冊も回り出す。
          **「今日の日記」の欄は出さない**（オーナー指示 2026-09-17）。 */
        <DayCollage
          stickers={todayStickers}
          surface={surfaceClass}
          heading={<DiaryDate date={today} />}
          opening={opening}
          onOpen={onOpen}
          onLongPress={onLongPress}
        />
      )}
      {/* **下へスクロールすると過去が続く形**(オーナー指示 2026-08-25)。
        日/週/月の切替は出さない。日ごとに素直に並べる。 */}
      {pastGroups.length > 0 && (
        <PastDays
          surface={surfaceClass}
          days={pastGroups}
          onOpen={onOpen}
          onLongPress={onLongPress}
          truncated={truncated}
          shown={shown ?? albumItems.length}
          total={total ?? albumItems.length}
        />
      )}
    </div>
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
    <>
      <div className="album-date">
        <DiaryDate date={date} />
      </div>
      <div className={`collage collage-board relative ${surface}`}>
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
    </>
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
 * **アルバムの上に大きく書く日付。**（オーナー指示 2026-09-23 2回目「やっぱり
 * ホームのアルバムの上に大きく日付を書いて。また手書きの字体ではなく、この
 * アプリのデザインの字体に合わせて」／1回目「日付の字体を統一して。文字の下の
 * 青い波線いらない」）
 *
 * 書体は**アプリの字体1つだけ**（日付・曜日）。前は明朝の日付・ゴシックの
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
  /**
   * **「9月21日」のように月と日を一緒に大きく**、曜日はその上に小さく青で
   * （オーナー指示 2026-09-24「9月21日のように。デザインを複数提示して」→
   * 見比べた4案から **A** に決定）。書体は端末の公式書体（`--font-display` =
   * SF Pro / ヒラギノ）、中央揃え。前は日にちの数字だけを大きくし、月は下に
   * 小さく書いていた — 何月か一目で分からなかった。
   */
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  const monthDay = date.toLocaleDateString(locale, { month: "long", day: "numeric" });
  const full = date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const Tag = compact ? "h2" : "h1";
  return (
    <div className={`diary-date ${compact ? "diary-date--compact" : ""}`}>
      <Tag className="diary-date__line" aria-label={full}>
        <span className="diary-date__weekday" aria-hidden>
          {weekday}
        </span>
        <span className="diary-date__md" aria-hidden>
          {monthDay}
        </span>
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
  // 札の**実際の**角の丸み。見出しまで丸いまま広がるよう、四角（2px）から
  // 始めない（2026-09-27「角が四角になってまた丸くなる」）。
  const radius = Math.max(parseFloat(getComputedStyle(img).borderRadius) || 0, 8);
  return { x: r.left, y: r.top, w: r.width, h: r.height, url, radius };
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

export function DayCollage({
  stickers: allStickers,
  onOpen,
  onLongPress,
  opening,
  surface = "album-bg-paper",
  heading,
  editable = true,
  stamp = "time",
}: {
  /** 札に添える印。1日の誌面は時刻、日をまたぐ記念アルバムは日付。 */
  stamp?: "time" | "date";
  /**
   * 長押しで置き方を変えられるか。**記念アルバムでは変えない**（札の置き方は
   * 元の日の誌面のもので、ここで動かすと元の日の置き方が書き換わる）。
   */
  editable?: boolean;
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
  /** 時刻の書き方は表示言語に従う（24時制は下の `hour12: false`）。 */
  const locale = localeOf(uiLang);
  const persistLayout = useServerFn(saveAlbumLayout);
  const qc = useQueryClient();
  /**
   * **アルバムから外した写真は貼らない**（オーナー指示 2026-09-28「画像を削除する
   * ボタンを画像の右端に出して。赤バツ。ただし図鑑からは削除しないで、ホームアルバム
   * だけから消して。またあとから戻すこともできるようにして」）。札は消えない
   * （図鑑にはそのまま居る）。記念アルバムは別の誌面なので外さない。
   */
  const albumHidden = useAlbumHidden();
  const stickers = useMemo(
    () => (editable ? allStickers.filter((s) => !albumHidden.hidden.has(s.id)) : allStickers),
    [allStickers, albumHidden.hidden, editable],
  );
  const hiddenHere = useMemo(
    () => (editable ? allStickers.filter((s) => albumHidden.hidden.has(s.id)) : []),
    [allStickers, albumHidden.hidden, editable],
  );
  const [showHidden, setShowHidden] = useState(false);
  /** ひと言を直している札（編集モードの鉛筆）。 */
  const [captionTarget, setCaptionTarget] = useState<CaptionTarget | null>(null);
  // 印は**その1枚の id** に付ける。再会の写しは元の札とは別の写真なので、写しを
  // 外しても元の札は残る（写しの id はサーバの札ではないので、端末に覚える）。
  //
  // 並べ替え中は `ordered` を表から写し直さない（下の effect の注）ので、外す・戻すは
  // `ordered` にも**その場で**反映する。反映しないと、外した札が写真だけ抜けた
  // 字の札として残っていた（確認用ページで見つけた）。
  const hideFromAlbum = (id: string, word: string) => {
    haptic("light");
    setOrdered((o) => o.filter((x) => x.id !== id));
    void albumHidden.hide(id);
    toast(t("album.hidden", { word }), {
      action: { label: t("album.undo"), onClick: () => restoreToAlbum(id) },
    });
  };
  const restoreToAlbum = (id: string) => {
    haptic("light");
    const back = allStickers.find((x) => x.id === id);
    if (back) setOrdered((o) => (o.some((x) => x.id === id) ? o : [...o, back]));
    void albumHidden.restore(id);
  };
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
    for (const s of stickers) m.set(s.id, albumHeroUrl(s, { surfaceRoles, photoPref }));
    return m;
  }, [stickers, surfaceRoles, photoPref]);
  // 貼る写真を端末から手元へ先に持ってきて読み解く（`warmCachedImages`、2026-09-28
  // 「画像タイムラグ…瞬間的に表示」）。描き直しや下の日へ転がった時に白い枠を出さない。
  useEffect(() => {
    void warmCachedImages([...heroById.values()]);
  }, [heroById]);
  /**
   * その札の枠の縦横比と、まだ自分で置いていない札の置き場所（誌面の石積み。自分で置いて
   * 保存した写真は避ける）。**計算は `lib/album-day-layout.ts` の1本だけ** — 本棚の本の
   * 左ページも同じものを使うので、ホームと日記で置き方が食い違わない。
   *
   * 見るのは表から届いた並び（`stickers`）で、重なり順のために入れ替える `ordered` では
   * ない（`ordered` で決めると、触っていない札まで置き場所が動く）。
   */
  const { frameRatio, settledById } = useMemo(
    () =>
      settleDayAlbum({
        stickers,
        hasHero: (id) => Boolean(heroById.get(id)),
        photoRatio,
        boardW: board.w,
      }),
    [stickers, heroById, photoRatio, board.w],
  );
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
          settledById.get(s.id) ?? placeFromCell({ col: 0, row: 0 }, sizes[i], s.id),
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
    [ordered, settledById, sizes, frameRatio],
  );
  /**
   * 台紙の高さ（幅に対する割合）。**中身から決める。**
   * 縦を幅で測っているので、ここが伸びても置いてある札は動かない。
   */
  const boardH = useMemo(() => boardHeight(items), [items]);

  function layoutPayload(next = ordered) {
    return (
      next
        .map((s, order) => {
          const size = s.album_size ?? AUTO_ALBUM_SIZE[order % AUTO_ALBUM_SIZE.length];
          const p = placementFrom(
            { x: s.album_x, y: s.album_y, scale: s.album_scale, rot: s.album_rot },
            // 画面に出していた置き場所（保存した写真を避けた後）をそのまま保存する。
            settledById.get(s.id) ?? placeFromCell({ col: 0, row: 0 }, size, s.id),
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
        })
        // **再会の写真の写しは書かない**（置き方の列は `stickers` の行にしか無い。
        // `lib/album-encounters.ts`）。
        .filter((it) => !isEncounterAlbumId(it.sticker_id))
    );
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
    if (!editable) return;
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
  /**
   * **長押しで掴んだ札を動かす間だけ、画面の送りを止める。**
   *
   * 札は普段 `touch-pan-y`（縦に送れる）。指を止めて長押しが成立した後に
   * 動かすと、そのままでは画面の送りが始まり `pointercancel` で札が手から
   * 落ちる。掴んでいる間（`grip`）だけ最初の `touchmove` を止めれば、送りは
   * 始まらず、指はそのまま札を運べる。止め具は台紙にだけ張る（窓に張ると、
   * 画面のどこを送るときも毎回ここを待つことになる）。
   */
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      if (grip.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, []);

  return (
    // **壁に貼った誌面**（オーナー指示 2026-09-22「ホーム画面、やっぱり背景、
    // 壁が必要だわ…前のように壁に付箋や四隅を固定して画像を張るようにして」）。
    // 2026-09-18 に外した紙とテープを、**写真の載る所だけ**に戻した。
    <>
      {/* **日付はアルバムの上に大きく**（オーナー指示 2026-09-23 改「やっぱり
          ホームのアルバムの上に大きく日付を書いて。手書きではなくアプリの字体に」）。 */}
      {heading && <div className="album-date">{heading}</div>}
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
            className="album-done lift fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-5 text-footnote font-semibold text-primary-foreground shadow-xl"
          >
            <Check className="h-4 w-4" />
            {t("album.done")}
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
              /** 字の欄の下限（写真を小さくしても語が切れない幅。2026-09-27）。 */
              "--cap-min": board.w ? `${Math.round(board.w * COLLAGE_CAP_MIN)}px` : undefined,
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
            // 記念アルバムは日をまたぐので、時刻ではなく日付を書く（`stamp="date"`）。
            const time =
              stamp === "date"
                ? takenAt(s).toLocaleDateString(locale, { month: "numeric", day: "numeric" })
                : takenAt(s).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });

            return (
              <Fragment key={s.id}>
                <button
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
                  /**
                   * **普段は縦に送れる（`touch-pan-y`）。**（オーナー報告 2026-09-29
                   * 「ホーム画面スクロールするとスクロールできなくなる」）
                   *
                   * 前は札に常に `touch-none` を付けていた。誌面の大半は写真なので、
                   * **指が写真の上に降りた時だけ画面が送れず**、止まったように見えた。
                   * 長押しで掴んだ後の動きは、下の `touchmove` の止め具が受け持つ。
                   * 編集中は札も台紙も `touch-none`（掴む・広げる・回すに専念）。
                   */
                  className={`photo-lift group absolute block ${
                    editing ? "touch-none" : "touch-pan-y"
                  } text-left ${
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
                      <span className="collage__print">
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
                      {/**
                       * **語は写真の下の白い余白に書く。**（オーナー指示 2026-09-27
                       * 「画像と単語を一枚の写真として統合して。写真の下の余白に
                       * 単語の文字を表示する」）インスタントカメラの写真と同じく、
                       * 下の縁だけ広く取り、そこに時刻と語を書く。
                       */}
                      <span className="collage__margin">
                        <Term lang={s.word.language} className="collage__margin-word">
                          {s.word.headword}
                        </Term>
                        <span className="collage__time collage__margin-time">{time}</span>
                      </span>
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
                  {/* 撮ったときに書いた一言。**人が書いた字は手書き**
                  （ゴシックはアプリが書く字、という約束）。語と時刻は写真の
                  白い余白の中（上）に在るので、ここは一言だけ。置き方の計算には
                  `extra` として高さを渡してある（渡さないと次の札が乗る）。 */}
                  {heroUrl && s.caption && (
                    <span className="collage__cap">
                      <span className="collage__note handwritten-ja ja-phrase">{s.caption}</span>
                    </span>
                  )}
                </button>
                {/* **赤いバツ＝アルバムから外す**（オーナー指示 2026-09-28）。写真の右上の角。
                  札の中に入れると「押せる物の中の押せる物」になるので、札の隣に置く。
                  **札と一体に揺れる**（R14「画像がゆらゆら揺れてるのに、赤は独立してる
                  のが違和感。画像にくっつけて」）: 札と同じ位置・大きさ・傾き・揺れ
                  （同じ `album-editing` と同じ位相の変数）を持つ透明な枠を重ね、
                  バツはその枠の右上の角に付ける。枠自体は押せない（下の札を塞がない）。
                  図鑑からは消えない（下の「外した写真」から戻せる）。 */}
                {editing && live?.id !== s.id && (
                  <span
                    aria-hidden={false}
                    className="album-remove-frame album-editing"
                    style={
                      {
                        left: `${place.x * 100}%`,
                        top: `${place.y * board.w}px`,
                        width: `${px.w}px`,
                        height: `${px.h}px`,
                        maxWidth: "100%",
                        maxHeight: "100%",
                        translate: "-50% -50%",
                        rotate: `${place.rot}deg`,
                        zIndex: 70,
                        "--jiggle-delay": `${jiggleStyle(s.id).delayMs}ms`,
                        "--jiggle-dur": `${jiggleStyle(s.id).durationMs}ms`,
                        "--jiggle-rot": `${JIGGLE.rotateDeg}deg`,
                        "--jiggle-lift": `${JIGGLE.liftPx}px`,
                      } as React.CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className="album-remove"
                      aria-label={t("album.hide", { word: s.word.headword })}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        hideFromAlbum(s.id, s.word.headword);
                      }}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                    </button>
                    {/* **ひと言を直す鉛筆**（オーナー指示 2026-09-30）。左上の角。 */}
                    <button
                      type="button"
                      className="album-remove album-caption-edit"
                      aria-label={t("caption.edit")}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCaptionTarget({ id: s.id, caption: s.caption ?? null });
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </span>
                )}
              </Fragment>
            );
          })}
        </div>

        {/* **外した写真を戻す所**（2026-09-28「あとから戻すこともできるようにして」）。
            並べ替え中だけ、その日の台紙の下に出す。押すと元の場所へ戻る。 */}
        {editing && hiddenHere.length > 0 && (
          <div className="album-hidden-tray">
            <button
              type="button"
              className="album-hidden-tray__toggle"
              aria-expanded={showHidden}
              onClick={() => setShowHidden((v) => !v)}
            >
              <EyeOff className="h-4 w-4" aria-hidden />
              {t("album.hiddenCount", { n: String(hiddenHere.length) })}
            </button>
            {showHidden && (
              <ul className="album-hidden-tray__list">
                {hiddenHere.map((s) => {
                  const url = stickerPhotoUrl(s, { prefer: s.hero_role, thumb: true });
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="album-hidden-tray__item"
                        aria-label={t("album.restore", { word: s.word.headword })}
                        onClick={() => restoreToAlbum(s.id)}
                      >
                        {url ? (
                          <CachedImg src={url} alt="" className="album-hidden-tray__img" />
                        ) : (
                          <span className="album-hidden-tray__img album-hidden-tray__img--text">
                            {s.word.headword}
                          </span>
                        )}
                        <span className="album-hidden-tray__label">
                          <Undo2 className="h-3.5 w-3.5" aria-hidden />
                          {t("album.restoreShort")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 「— N枚の思い出」は出さない（オーナー指示 2026-09-23「〇〇枚目の思い出と
          いうやつ消して」）。数は図鑑に在り、ここは写真が主役。 */}
      </div>
      <CaptionEditDialog target={captionTarget} onClose={() => setCaptionTarget(null)} />
    </>
  );
}

/**
 * 節目の日の入口（今日の誌面の上）。写真を3枚重ねた小さな束と題。
 * 閉じたらその節目の間は出さない（`dismissMemorial`）。
 */
export function MemorialEntry({
  n,
  words,
  picks,
  onOpen,
  onDismiss,
}: {
  n: number;
  words: number;
  picks: StickerWithWord[];
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const thumbs = picks.slice(-3);
  return (
    <div className="relative mb-4 flex items-center gap-3 rounded-3xl border border-border bg-card p-3 shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        className="press-in flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative h-16 w-16 shrink-0" aria-hidden>
          {thumbs.map((s, i) => {
            const url = stickerPhotoUrl(s, { prefer: s.hero_role ?? undefined, thumb: true });
            return (
              <span
                key={s.id}
                className="absolute inset-0 overflow-hidden rounded-md bg-white p-0.5 shadow"
                style={{ rotate: `${(i - 1) * 8}deg`, zIndex: i }}
              >
                {url && (
                  <CachedImg src={url} alt="" className="h-full w-full rounded-sm object-cover" />
                )}
              </span>
            );
          })}
        </span>
        <span className="min-w-0">
          <span className="block text-headline font-bold leading-tight">
            {t("memorial.title", { n })}
          </span>
          <span className="mt-0.5 block text-caption text-muted-foreground">
            {t("memorial.sub", { n, count: words, photos: picks.length })}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("memorial.close")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** 記念アルバム本体。画面いっぱいの1枚の誌面（ホームと同じ貼り方）。 */
export function MemorialAlbum({
  n,
  words,
  picks,
  surface,
  onOpen,
  onClose,
}: {
  n: number;
  words: number;
  picks: StickerWithWord[];
  surface: string;
  onOpen: (id: string, from?: FlightOrigin | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  // 開いた瞬間は、まず祝う（`MemorialReveal`）。幕が上がってから誌面。
  const [revealed, setRevealed] = useState(false);
  const photos = useMemo(
    () =>
      picks
        .map((s) => stickerPhotoUrl(s, { prefer: s.hero_role ?? undefined, thumb: true }))
        .filter((u): u is string => !!u),
    [picks],
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("memorial.title", { n })}
      className="fixed inset-0 z-[60] overflow-y-auto bg-background px-4 pb-28 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
    >
      {!revealed && (
        <MemorialReveal n={n} words={words} photos={photos} onDone={() => setRevealed(true)} />
      )}
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("memorial.close")}
            className="grid h-11 w-11 place-items-center rounded-full bg-card shadow-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {revealed && (
          <DayCollage
            stickers={picks}
            surface={surface}
            editable={false}
            stamp="date"
            opening
            onOpen={onOpen}
            heading={
              <div className="px-2 pb-2 pt-1 text-center">
                <h2 className="text-title font-extrabold tracking-tight">
                  {t("memorial.title", { n })}
                </h2>
                <p className="mt-1 text-footnote text-muted-foreground">
                  {t("memorial.sub", { n, count: words, photos: picks.length })}
                </p>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
