import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useEffect, useMemo, useState } from "react";
import { BookText, Image as ImageIcon } from "lucide-react";

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
          <ScrapbookAlbum stickers={todayStickers} bgClass={bgClass} />
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
              <ScrapbookAlbum stickers={items} bgClass={bgClass} />
            </div>
          ))}
        </section>
      )}
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

function ScrapbookAlbum({ stickers, bgClass }: { stickers: StickerWithWord[]; bgClass: string }) {
  const rotations = [-6, 4, -3, 7, -5, 2, -8, 5, -2, 6];
  const aspects = ["aspect-square", "aspect-[4/5]", "aspect-[5/4]", "aspect-square", "aspect-[3/4]"];
  const tapes = ["bg-amber-200/80", "bg-rose-200/80", "bg-sky-200/80", "bg-emerald-200/80"];

  const items = useMemo(
    () =>
      stickers.map((s, i) => ({
        sticker: s,
        rot: rotations[i % rotations.length],
        aspect: aspects[i % aspects.length],
        tape: tapes[i % tapes.length],
        accent: i % 4 === 0,
      })),
    [stickers],
  );

  return (
    <div className={`relative rounded-3xl border border-amber-900/10 p-3 shadow-inner sm:p-5 ${bgClass}`}>
      <div className="columns-2 gap-3 sm:columns-3 sm:gap-4">
        {items.map(({ sticker: s, rot, aspect, tape, accent }) => {
          // Default to the selfie photo (the "memory"); fall back to object then cutout.
          const mainImg = s.selfie_url ?? s.object_url ?? s.cutout_url;
          return (
            <Link
              key={s.id}
              to="/dex/$stickerId"
              params={{ stickerId: s.id }}
              className="lift relative mb-3 block break-inside-avoid sm:mb-4"
              style={{ transform: `rotate(${rot}deg)` }}
            >
              <div className="relative rounded-md bg-white p-2 pb-7 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
                <span
                  className={`absolute -top-2 left-1/2 h-3 w-12 -translate-x-1/2 rotate-[-3deg] rounded-sm ${tape} shadow-sm`}
                />
                <div className={`relative ${aspect} grid w-full place-items-center overflow-hidden rounded-sm bg-[#fafaf5]`}>
                  {mainImg ? (
                    <img
                      src={mainImg}
                      alt={`「${s.word.headword}」の思い出の一枚`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl">{s.word.silhouette_emoji ?? "📦"}</span>
                  )}
                  {s.cutout_url && (
                    <img
                      src={s.cutout_url}
                      alt=""
                      aria-hidden
                      className="pointer-events-none absolute -right-1 -bottom-1 h-1/2 w-1/2 object-contain drop-shadow-md"
                    />
                  )}
                </div>
                <div className="mt-1 text-center font-serif text-sm leading-tight">
                  <div className="font-semibold tracking-tight">{s.word.headword}</div>
                  {accent && s.word.meaning_ja && (
                    <div className="truncate text-[10px] italic text-muted-foreground">
                      {s.word.meaning_ja}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-2 text-right">
        <span className="font-serif text-xs italic text-amber-900/60">
          — {stickers.length} {stickers.length === 1 ? "memory" : "memories"} caught
        </span>
      </div>
    </div>
  );
}
