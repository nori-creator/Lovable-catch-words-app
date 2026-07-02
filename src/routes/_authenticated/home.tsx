import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { listPendingCaptures, type PendingCapture } from "@/lib/offline-queue";
import { useEffect, useMemo, useState } from "react";
import { BookText, Image as ImageIcon, WifiOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "ホーム — Catchwords" },
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
  if (pending.length === 0) return null;
  const first = pending[0];
  return (
    <Link
      to="/capture"
      search={{ pending: first.id }}
      className="lift mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-3 shadow-sm"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-amber-200">
        {first.object_img ? (
          <img src={first.object_img} alt="解析待ちの写真" className="h-full w-full object-cover" />
        ) : (
          <WifiOff className="h-5 w-5 text-amber-700" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-amber-950">📥 解析待ちの写真が {pending.length} 枚</span>
        <span className="block text-xs text-amber-900/70">タップしてAI解析を再開する</span>
      </span>
    </Link>
  );
}

const BG_OPTIONS = [
  { id: "paper", label: "紙", className: "album-bg-paper" },
  { id: "frame", label: "額", className: "album-bg-frame" },
  { id: "notebook", label: "ノート", className: "album-bg-notebook" },
  { id: "cork", label: "コルク", className: "album-bg-cork" },
] as const;

type BgId = typeof BG_OPTIONS[number]["id"];

function HomePage() {
  const navigate = useNavigate();
  const fetchStickers = useServerFn(listMyStickers);
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: stickers, isLoading } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
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
    for (const s of stickers ?? []) {
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
      <DayHeader date={today} label="Today's Scrapbook" />

      <PendingCapturesBanner />

      <BackgroundPicker current={bg} onChange={setBg} />

      {isLoading ? (
        <div className="h-72 animate-pulse rounded-3xl bg-secondary" />
      ) : todayStickers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">きょうのページはまだ白紙です。</p>
          <Link
            to="/capture"
            className="lift mt-4 inline-block rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground"
          >
            街でひとつ見つける
          </Link>
        </div>
      ) : (
        <>
          <ScrapbookAlbum stickers={todayStickers} bgClass={bgClass} onOpen={setOpenId} />
          <div className="mt-4 text-center">
            <Link
              to="/journal"
              className="lift inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold shadow-sm"
            >
              <BookText className="h-4 w-4 text-primary" />
              今日の日記を書く
            </Link>
          </div>
        </>
      )}

      {pastDays.length > 0 && (
        <section className="mt-12 space-y-10">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Past Pages</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {pastDays.map(([k, items]) => (
            <div key={k}>
              <DayHeader date={new Date(k)} compact />
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
  return (
    <div className="mb-3 flex items-center justify-end gap-1">
      <ImageIcon className="mr-1 h-3 w-3 text-muted-foreground" />
      {BG_OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-label={`背景: ${o.label}`}
          className={`lift-soft h-7 w-7 overflow-hidden rounded-full border ${current === o.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
        >
          <span className={`block h-full w-full ${o.className}`} />
        </button>
      ))}
    </div>
  );
}

function DayHeader({ date, label, compact }: { date: Date; label?: string; compact?: boolean }) {
  const dateLabel = date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return (
    <section className={compact ? "mb-3 text-center" : "mb-6 text-center"}>
      {label && (
        <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">{label}</p>
      )}
      <h1 className={`${compact ? "mt-1 text-xl" : "mt-2 text-3xl"} font-serif italic tracking-tight`}>
        {dateLabel}
      </h1>
      <p className={`${compact ? "" : "mt-0.5"} text-xs uppercase tracking-[0.25em] text-muted-foreground`}>
        {weekday}
      </p>
      <div className="mx-auto mt-3 h-px w-16 bg-foreground/30" />
    </section>
  );
}

function ScrapbookAlbum({ stickers, bgClass, onOpen }: { stickers: StickerWithWord[]; bgClass: string; onOpen: (id: string) => void }) {
  const rotations = [-7, 5, -3, 8, -5, 2, -9, 6, -2, 4, -6, 3];
  const sizes = [
    "col-span-2 row-span-2",
    "col-span-1 row-span-2",
    "col-span-1 row-span-1",
    "col-span-2 row-span-1",
    "col-span-1 row-span-2",
    "col-span-1 row-span-1",
  ];
  const tapeColors = ["", "blue", "yellow", "mint"];

  const items = useMemo(
    () =>
      stickers.map((s, i) => ({
        sticker: s,
        rot: rotations[i % rotations.length],
        size: sizes[i % sizes.length],
        z: 10 + (i % 5),
        tape: tapeColors[i % tapeColors.length],
      })),
    [stickers],
  );

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-amber-900/10 p-5 shadow-inner sm:p-7 ${bgClass}`}>
      {/* Decorative washi tape corners */}
      <span className="washi-tape blue" style={{ top: 8, left: 18, transform: "rotate(-14deg)" }} />
      <span className="washi-tape yellow" style={{ top: 14, right: 22, transform: "rotate(18deg)" }} />

      <div className="grid auto-rows-[7rem] grid-cols-3 gap-x-4 gap-y-8 sm:auto-rows-[8.5rem] sm:grid-cols-4">
        {items.map(({ sticker: s, rot, size, z, tape }) => {
          // Album is a memory book: prefer selfie (you + the thing).
          // Fallback to the plain object photo only when there's no selfie.
          const heroUrl = s.selfie_url ?? s.object_url ?? s.cutout_url ?? null;
          const isPolaroid = !!heroUrl;

          return (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className={`group relative block text-left transition-transform hover:scale-[1.03] active:scale-95 ${size}`}
              style={{ transform: `rotate(${rot}deg)`, zIndex: z }}
            >
              {isPolaroid ? (
                <div className="polaroid relative h-full w-full">
                  <span className={`washi-tape ${tape}`} style={{ top: -8, left: "50%", transform: "translateX(-50%) rotate(-4deg)" }} />
                  <div className="h-[calc(100%-28px)] w-full overflow-hidden">
                    <img
                      src={heroUrl!}
                      alt={`「${s.word.headword}」の思い出`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="handwritten absolute inset-x-0 bottom-1 text-center text-sm text-amber-950/80">
                    {s.word.headword}
                  </span>
                </div>
              ) : (
                <div className="grid h-full w-full place-items-center text-4xl">
                  {s.word.silhouette_emoji ?? "📦"}
                  <span className="handwritten -mt-1 text-sm text-amber-950/85">{s.word.headword}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 text-right">
        <span className="handwritten text-base text-amber-900/70">
          — {stickers.length} {stickers.length === 1 ? "memory" : "memories"} caught
        </span>
      </div>
    </div>
  );
}

