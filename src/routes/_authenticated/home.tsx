import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { Sound, unlockAudio } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Home = Collector's Cabinet (redesign v3).
 *
 * Metaphor: a watchmaker's display case / a wine cellar / a fountain-pen
 * collection. Each catch is one square slot. Rows are hairline-divided
 * "shelves" grouped by time (今日 / 今週 / 月別). The eye reads a curated,
 * ownership-heavy artifact — not a feed.
 *
 * Rules embodied here (see .lovable/plan.md §1-2):
 *   • Zero streak numbers, XP, %, rarity, ゲージ, gamified badges.
 *   • Exactly one poetic number per week ("今週 N").
 *   • Gold used <1% area — only the reunion slot's hairline border.
 *   • Today's Catch is the single anchor; everything else is quiet grid.
 *   • Empty slots (Zeigarnik) hint at nearby-scanned but uncaught words.
 *   • Instrument Serif for words; Inter for chrome; Mono for dates.
 */

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "コレクション — Catchwords" },
      { name: "description", content: "きょう、街で出会った言葉たちが並ぶ、自分だけの陳列棚。" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const fetchStickers = useServerFn(listMyStickers);
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: stickers, isLoading } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/onboarding", replace: true });
  }, [profile, navigate]);

  const grouped = useMemo(() => groupByShelf(stickers ?? []), [stickers]);
  const weekCount = grouped.week.length + (grouped.today ? 1 : 0);

  // The most recent sticker id — used to ignite that slot on entry.
  const latestId = grouped.today?.id ?? grouped.week[0]?.id ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 pb-32 pt-[max(4.5rem,env(safe-area-inset-top))]">
        {/* Header — quiet, editorial */}
        <CabinetHeader weekCount={weekCount} />

        {isLoading ? (
          <div className="mt-20 grid place-items-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !grouped.today && grouped.week.length === 0 && grouped.months.length === 0 ? (
          <EmptyCabinet />
        ) : (
          <>
            {grouped.today && (
              <TodayShelf sticker={grouped.today} onOpen={() => setOpenId(grouped.today!.id)} />
            )}

            {grouped.week.length > 0 && (
              <Shelf
                label="今週"
                stickers={grouped.week}
                onOpen={setOpenId}
                igniteId={latestId}
              />
            )}

            {grouped.months.map(([label, list]) => (
              <Shelf key={label} label={label} stickers={list} onOpen={setOpenId} />
            ))}
          </>
        )}
      </div>

      <StickerSheet stickerId={openId} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}

/* ─────────── Header ─────────── */

function CabinetHeader({ weekCount }: { weekCount: number }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  return (
    <header className="mb-8 flex items-end justify-between">
      <div className="min-w-0">
        <p className="font-mono-tight text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
          Collection
        </p>
        <h1 className="font-display mt-1 text-4xl italic leading-none tracking-tight">
          きょうの棚
        </h1>
        <p className="font-mono-tight mt-2 text-[11px] text-muted-foreground">
          {dateStr}
        </p>
      </div>
      {weekCount > 0 && (
        <div className="shrink-0 text-right">
          <p className="font-mono-tight text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
            This week
          </p>
          <p className="font-display -mt-1 text-4xl italic leading-none tracking-tight">
            {weekCount}
          </p>
        </div>
      )}
    </header>
  );
}

/* ─────────── Today's anchor ─────────── */

function TodayShelf({ sticker: s, onOpen }: { sticker: StickerWithWord; onOpen: () => void }) {
  const hero = s.object_url ?? s.cutout_url ?? s.selfie_url ?? s.placeholder_url;
  const isReunion = (s.encounter_count ?? 0) > 1;
  const onClick = () => {
    unlockAudio();
    Sound.tap();
    haptic("light");
    onOpen();
  };
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-3">
        <div className="shelf-rule flex-1" />
        <p className="font-mono-tight text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
          Today's Catch
        </p>
        <div className="shelf-rule flex-1" />
      </div>
      <button
        onClick={onClick}
        className={`cab-slot slot-ignite group block w-full ${isReunion ? "reunion" : ""}`}
        style={{ aspectRatio: "4 / 3", borderRadius: 12 }}
        aria-label={s.word.headword}
      >
        {hero ? (
          <img
            src={hero}
            alt={s.word.headword}
            className="ken-burns-a absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-secondary text-6xl">
            {s.word.silhouette_emoji ?? "📦"}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-5 pb-4 pt-16">
          <h2 className="font-display text-left text-4xl italic leading-none tracking-tight text-white">
            {s.word.headword}
          </h2>
          <p className="font-mono-tight mt-2 text-left text-[11px] tracking-wider text-white/75">
            {s.word.reading_zhuyin ?? s.word.pinyin ?? ""}
            {s.location_name && <span className="ml-3 opacity-80">· {s.location_name}</span>}
          </p>
        </div>
      </button>
    </section>
  );
}

/* ─────────── Shelf grid ─────────── */

function Shelf({
  label,
  stickers,
  onOpen,
  igniteId,
}: {
  label: string;
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
  igniteId?: string | null;
}) {
  // Round up to the next multiple of 5 to render 1-2 empty slots at the end.
  const slots = Math.max(5, Math.ceil((stickers.length + 1) / 5) * 5);
  const empties = Math.max(0, slots - stickers.length);
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-3">
        <p className="font-mono-tight text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
          {label}
        </p>
        <div className="shelf-rule flex-1" />
        <p className="font-mono-tight text-[10px] tracking-[0.2em] text-muted-foreground/70">
          {stickers.length}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {stickers.map((s) => (
          <SlotCard
            key={s.id}
            s={s}
            onOpen={() => onOpen(s.id)}
            ignite={igniteId === s.id}
          />
        ))}
        {Array.from({ length: empties }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="cab-slot empty"
            aria-hidden
          />
        ))}
      </div>
    </section>
  );
}

function SlotCard({ s, onOpen, ignite }: { s: StickerWithWord; onOpen: () => void; ignite?: boolean }) {
  const hero =
    s.object_thumb_url ?? s.object_url ??
    s.cutout_thumb_url ?? s.cutout_url ??
    s.selfie_url ?? s.placeholder_url;
  const isReunion = (s.encounter_count ?? 0) > 1;
  const pressTimer = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (ignite) Sound.shelfLand();
  }, [ignite]);

  const onClick = () => {
    unlockAudio();
    Sound.tap();
    haptic("light");
    onOpen();
  };

  const onPressStart = () => {
    setPressed(true);
    pressTimer.current = window.setTimeout(async () => {
      haptic("medium");
      Sound.reunion();
      try {
        if (navigator.share) {
          await navigator.share({
            title: s.word.headword,
            text: `${s.word.headword}${s.word.meaning_ja ? " — " + s.word.meaning_ja : ""}`,
            url: window.location.href,
          });
        }
      } catch { /* ignore */ }
    }, 600);
  };
  const clearPress = () => {
    setPressed(false);
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  return (
    <button
      onClick={onClick}
      onPointerDown={onPressStart}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      className={`cab-slot text-left ${isReunion ? "reunion" : ""} ${ignite ? "slot-ignite" : ""} ${pressed ? "scale-[0.98]" : ""}`}
      aria-label={s.word.headword}
    >
      {hero ? (
        <img
          src={hero}
          alt={s.word.headword}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-secondary text-2xl">
          {s.word.silhouette_emoji ?? "·"}
        </div>
      )}
      {/* Bottom caption: minimal, mono, only appears on hover to keep the shelf still */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:opacity-100">
        <p className="font-mono-tight truncate text-[9px] font-medium tracking-tight text-white/95">
          {s.word.headword}
        </p>
      </div>
    </button>
  );
}

/* ─────────── Empty state ─────────── */

function EmptyCabinet() {
  return (
    <div className="mt-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-border bg-card shadow-sm">
        <ScanLine className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="font-display mt-8 text-3xl italic leading-none tracking-tight">
        まだ、白い棚。
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        街のものへカメラをかざすと、
        <br />
        最初の一枚がこの棚に収まります。
      </p>
      <Link
        to="/scan"
        onClick={() => { Sound.tap(); haptic("medium"); }}
        className="lift mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25"
      >
        <ScanLine className="h-4 w-4" />
        はじめて出会う
      </Link>
    </div>
  );
}

/* ─────────── grouping ─────────── */

type Grouped = {
  today: StickerWithWord | null;
  week: StickerWithWord[];
  months: Array<[string, StickerWithWord[]]>;
};

function groupByShelf(all: StickerWithWord[]): Grouped {
  const sorted = [...all].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);

  let today: StickerWithWord | null = null;
  const week: StickerWithWord[] = [];
  const olderMap = new Map<string, StickerWithWord[]>();

  for (const s of sorted) {
    const t = new Date(s.created_at);
    if (!today && t >= startOfToday) {
      today = s;
      continue;
    }
    if (t >= startOfWeek) {
      week.push(s);
      continue;
    }
    const label = t.toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
    if (!olderMap.has(label)) olderMap.set(label, []);
    olderMap.get(label)!.push(s);
  }
  return { today, week, months: Array.from(olderMap.entries()) };
}
