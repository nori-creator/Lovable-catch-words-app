import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { CachedImg } from "@/lib/image-cache";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listPendingCaptures,
  removePendingCapture,
  type PendingCapture,
} from "@/lib/offline-queue";
import { useEffect, useMemo, useState } from "react";
import { BookText, Image as ImageIcon, Trash2, WifiOff } from "lucide-react";
import { useT } from "@/lib/i18n";
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
  const t = useT();
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
    // 全体を <Link> にすると**捨てる手段が置けない**。預かった写真は
    // 端末に残り続けるので、要らないものを消す道が要る(§16)。
    <div className="mb-4 rounded-2xl border border-amber-300/60 bg-amber-50 p-3 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/40">
      <Link
        to="/capture"
        search={{ pending: first.id }}
        className="press-in flex items-center gap-3"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-amber-200 dark:bg-amber-900/40 dark:ring-amber-700/40">
          {first.object_img ? (
            <img
              src={first.object_img}
              alt={t("home.waitingPhoto")}
              className="h-full w-full object-cover"
            />
          ) : (
            <WifiOff className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-amber-950 dark:text-amber-100">
            📥 {t("home.pendingCount")}: {pending.length}
          </span>
          <span className="block text-xs text-amber-900/70 dark:text-amber-200/70">
            {t("home.pendingCta")}
          </span>
        </span>
      </Link>

      {/* 捨てるのは取り消せない。写真は二度と撮れないものなので、
          一度目のタップでは実行せず「本当に?」に変える。
          モーダルは出さない — この場で決まる小さな判断に、画面を
          覆うほどの重さは要らない。 */}
      <div className="mt-2 flex justify-end">
        <button
          onClick={() => {
            if (confirmingId !== first.id) {
              setConfirmingId(first.id);
              return;
            }
            void removePendingCapture(first.id).then(() => {
              setConfirmingId(null);
              void listPendingCaptures().then(setPending);
            });
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-amber-900/80 hover:bg-amber-100 dark:text-amber-200/80 dark:hover:bg-amber-900/40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmingId === first.id ? t("home.pendingDiscardConfirm") : t("home.pendingDiscard")}
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

  const grouped = useMemo(() => {
    const map = new Map<string, StickerWithWord[]>();
    for (const s of stickers?.items ?? []) {
      const k = dayKey(new Date(s.created_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [stickers]);

  const todayStickers = grouped.find(([k]) => k === todayKey)?.[1] ?? [];
  const pastDays = grouped.filter(([k]) => k !== todayKey);
  const bgClass = BG_OPTIONS.find((o) => o.id === bg)?.className ?? "album-bg-paper";

  return (
    <AppShell>
      <DayHeader date={today} />

      <PendingCapturesBanner />

      <BackgroundPicker current={bg} onChange={setBg} />

      {isLoading ? (
        <div className="h-72 animate-pulse rounded-3xl bg-secondary" />
      ) : isError ? (
        // 失敗を「今日はまだ何も無い」と描いていた。しかも日記への唯一の入口が
        // この else の中にあるので、エラーのときは日記にも辿り着けなくなる。
        <LoadFailed onRetry={() => void refetch()} retrying={isFetching} />
      ) : todayStickers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("home.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("home.emptyHint")}</p>
          <Link
            to="/capture"
            className="press-in mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {t("home.emptyCta")}
          </Link>
        </div>
      ) : (
        <>
          <ScrapbookAlbum stickers={todayStickers} bgClass={bgClass} onOpen={setOpenId} />
          <div className="mt-4 text-center">
            <Link
              to="/journal"
              className="press-in inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold shadow-sm"
            >
              <BookText className="h-4 w-4 text-primary" />
              {t("home.journal")}
            </Link>
          </div>
        </>
      )}

      {pastDays.length > 0 && (
        <section className="mt-12 space-y-10">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              {t("home.pastPages")}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* 図鑑と同じ上限にかかっている。ホームは日付ごとに遡る画面なので、
              古い日が黙って消えると**その日は何も撮らなかった**ように見える。
              出せていないなら、そう言う(§8)。 */}
          {stickers?.truncated && (
            <p
              role="status"
              className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground"
            >
              {t("dex.truncated", {
                n: String(stickers.items.length),
                total: String(stickers.total ?? stickers.items.length),
              })}
            </p>
          )}
          {pastDays.map(([k, items]) => (
            <div key={k}>
              {/* k is a local YYYY-MM-DD; append time so it parses as LOCAL
                  midnight (bare `new Date("YYYY-MM-DD")` is UTC → off-by-one
                  for users west of UTC). */}
              <DayHeader date={new Date(`${k}T00:00:00`)} compact />
              <ScrapbookAlbum stickers={items} bgClass={bgClass} onOpen={setOpenId} />
            </div>
          ))}
        </section>
      )}
      <StickerSheet stickerId={openId} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}

function BackgroundPicker({ current, onChange }: { current: BgId; onChange: (b: BgId) => void }) {
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

function DayHeader({ date, label, compact }: { date: Date; label?: string; compact?: boolean }) {
  const isEn = useUiLang() === "en";
  const locale = isEn ? "en-US" : "ja-JP";
  const dateLabel = date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  return (
    <section className={compact ? "mb-3 text-center" : "mb-6 text-center"}>
      {label && (
        <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">{label}</p>
      )}
      {/* §15 typography: tracking is size- AND script-specific.
          The serif *italic* is a Latin conceit — applied to a Japanese date
          ("2026年8月2日") the browser synthesises the slant and the negative
          tracking pulls the digits into the following kanji, so they visibly
          collide. Japanese therefore renders upright with neutral tracking
          (CJK glyphs are full-width and need no tightening); English keeps the
          elegant serif italic. */}
      <h1
        className={`${compact ? "mt-1 text-xl leading-[1.15]" : "mt-2 text-3xl leading-[1.12]"} font-serif ${
          isEn ? "italic tracking-[-0.02em]" : "not-italic tracking-normal"
        }`}
      >
        {dateLabel}
      </h1>
      <p
        className={`${compact ? "" : "mt-0.5"} text-xs uppercase tracking-[0.25em] text-muted-foreground`}
      >
        {weekday}
      </p>
      <div className="mx-auto mt-3 h-px w-16 bg-foreground/30" />
    </section>
  );
}

const ALBUM_ROTATIONS = [-7, 5, -3, 8, -5, 2, -9, 6, -2, 4, -6, 3];
const ALBUM_SIZES = [
  "col-span-2 row-span-2",
  "col-span-1 row-span-2",
  "col-span-1 row-span-1",
  "col-span-2 row-span-1",
  "col-span-1 row-span-2",
  "col-span-1 row-span-1",
];

function ScrapbookAlbum({
  stickers,
  bgClass,
  onOpen,
}: {
  stickers: StickerWithWord[];
  bgClass: string;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const isEn = useUiLang() === "en";
  const items = useMemo(
    () =>
      stickers.map((s, i) => ({
        sticker: s,
        rot: ALBUM_ROTATIONS[i % ALBUM_ROTATIONS.length],
        size: ALBUM_SIZES[i % ALBUM_SIZES.length],
        z: 10 + (i % 5),
      })),
    [stickers],
  );

  return (
    // リアル・アルバム: .album-page が紙の繊維と周辺減光を持つ台紙。
    // 各写真は白フチの印画紙(.photo-print)を三角コーナーで留める —
    // 子供の頃のアルバムの再現。本の厚み表現は廃止(NORI指定)。
    <div
      className={`album-page relative rounded-2xl border border-amber-900/20 p-5 sm:p-7 ${bgClass}`}
    >
      <div className="relative grid auto-rows-[7rem] grid-cols-3 gap-x-4 gap-y-8 sm:auto-rows-[8.5rem] sm:grid-cols-4">
        {items.map(({ sticker: s, rot, size, z }) => {
          // Album is a memory book: prefer selfie (you + the thing).
          // Fallback to the plain object photo only when there's no selfie;
          // ghosts show their placeholder (clearly temporary).
          const heroUrl = s.selfie_url ?? s.object_url ?? s.cutout_url ?? s.placeholder_url ?? null;

          return (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              // §1 Response: 傾きは外側、内側の印画紙がコーナーからそっと浮く。
              className={`photo-lift group relative block text-left ${size}`}
              style={{ transform: `rotate(${rot}deg)`, zIndex: z }}
            >
              <div className="photo-print h-full w-full">
                <span aria-hidden className="photo-corner tl" />
                <span aria-hidden className="photo-corner tr" />
                <span aria-hidden className="photo-corner bl" />
                <span aria-hidden className="photo-corner br" />
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
                  // 画像がまだ無いカード: 単語そのものを見せる(段ボール絵は廃止)
                  <div className="grid h-full w-full place-items-center px-2 text-center">
                    <span lang="zh-Hant" className="text-lg font-semibold text-muted-foreground">
                      {s.word.headword}
                    </span>
                  </div>
                )}
                {/* 白フチの帯(26px)の中に収める — 写真とは絶対に被らない */}
                {/* 帯の中の見出し語。手書き風(.handwritten)は付けない —
                    Caveat に漢字が無いため、繁体字の字形指定を壊してしまう。
                    §3 Clarity: 見出し語はこのカードの主役なので、細く薄い字では
                    なく「やや大きく・semibold・不透明」で読ませる。繁体字は画数が
                    多く小さいと潰れるため、字間も少し開ける。 */}
                <span
                  lang="zh-Hant"
                  className="absolute inset-x-1 bottom-0.5 truncate text-center text-[14px] font-semibold leading-[22px] tracking-[0.02em] text-stone-900"
                >
                  {s.word.headword}
                </span>
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
        <span
          className={`text-base text-amber-900/70 ${isEn ? "handwritten" : "font-medium tracking-[0.02em]"}`}
        >
          — {stickers.length} {t("home.memories")}
        </span>
      </div>
    </div>
  );
}
