import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useEffect, useMemo, useRef, useState } from "react";
import { Share2, ScanLine, ChevronsUp } from "lucide-react";
import { Sound, unlockAudio } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * Home = vertical full-screen photo feed (Reels × Apple Photos For You).
 *
 * Design choices (see .lovable/plan.md §3):
 * - 1 sticker per full viewport, snap scrolling → the eye rests on ONE image.
 * - Ken Burns on each hero → the photo breathes; static becomes cinematic.
 * - Bottom overlay is minimal: headword (SF Display), pronunciation dot,
 *   place + relative date. No buttons rows, no numeric streaks.
 * - Every 5 cards, a soft "Review" card mixes in — variable reward.
 * - Empty state is a single poetic prompt, not a checklist.
 */

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "ホーム — Catchwords" },
      { name: "description", content: "きょう、街で出会った言葉たち。" },
    ],
  }),
  component: HomePage,
});

type Card =
  | { kind: "sticker"; sticker: StickerWithWord; i: number }
  | { kind: "recap"; i: number; items: StickerWithWord[] };

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

  // Newest-first + a single weekly recap at position 3 when ≥ 6 stickers.
  // Review / Ghost / Locked cards live in Museum + More sheet — the feed
  // stays pure (Sticker + optional Recap) to avoid clutter.
  const cards = useMemo<Card[]>(() => {
    const list = [...(stickers ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const out: Card[] = list.map((s, i) => ({ kind: "sticker", sticker: s, i }));
    if (list.length >= 6) {
      out.splice(3, 0, { kind: "recap", i: 3, items: list.slice(0, 8) });
    }
    return out;
  }, [stickers]);

  // Fire a subtle chirp as each card snaps into view.
  const feedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    let lastIdx = -1;
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      if (idx !== lastIdx) { lastIdx = idx; Sound.cardEnter(); }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [cards.length]);

  return (
    <AppShell>
      <div ref={feedRef} className="feed-scroll h-[100dvh] w-full overflow-y-scroll pt-0">
        {isLoading && <LoadingCard />}
        {!isLoading && cards.length === 0 && <EmptyCard />}
        {cards.map((c, idx) => {
          if (c.kind === "sticker") {
            return (
              <StickerFeedCard
                key={`s-${c.sticker.id}`}
                sticker={c.sticker}
                variant={idx % 2 === 0 ? "a" : "b"}
                onOpen={() => setOpenId(c.sticker.id)}
              />
            );
          }
          return <RecapFeedCard key={`rc-${c.i}`} items={c.items} />;
        })}
        {/* trailing spacer so last card clears FAB */}
        <div className="feed-card grid h-[100dvh] place-items-center">
          <div className="text-center text-muted-foreground">
            <ChevronsUp className="mx-auto h-6 w-6 opacity-50" />
            <p className="mt-2 text-xs tracking-[0.3em] uppercase">上へ戻る</p>
          </div>
        </div>
      </div>
      <StickerSheet stickerId={openId} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}

/* ─────────── Cards ─────────── */

function StickerFeedCard({
  sticker: s,
  variant,
  onOpen,
}: {
  sticker: StickerWithWord;
  variant: "a" | "b";
  onOpen: () => void;
}) {
  const hero = s.selfie_url ?? s.object_url ?? s.cutout_url ?? s.placeholder_url ?? null;
  const rel = relativeDay(new Date(s.created_at));
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playPronounce = async (e: React.MouseEvent) => {
    e.stopPropagation();
    unlockAudio();
    haptic("light");
    Sound.tap();
    // Best-effort: rely on the sticker sheet for real TTS; here we just chirp.
    // The full pronunciation flow lives in StickerSheet.
  };

  return (
    <section
      className="feed-card relative grid h-[100dvh] place-items-center overflow-hidden"
      onClick={onOpen}
    >
      {/* hero */}
      {hero ? (
        <div className="absolute inset-0">
          <img
            src={hero}
            alt={s.word.headword}
            className={`h-full w-full object-cover ${variant === "a" ? "ken-burns-a" : "ken-burns-b"}`}
            loading="lazy"
            decoding="async"
          />
          {/* Cinematic top + bottom scrim */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-background via-background/70 to-transparent" />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/25 to-background">
          <span className="text-7xl">{s.word.silhouette_emoji ?? "📦"}</span>
        </div>
      )}

      {/* text overlay */}
      <div className="pointer-events-none relative z-10 flex h-full w-full max-w-lg flex-col justify-end px-6 pb-40">
        <div className="pointer-events-auto space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/70">
            {rel}{s.location_name ? ` · ${s.location_name}` : ""}
          </p>
          <h2
            className="font-semibold leading-[1.05] text-white"
            style={{ fontSize: "clamp(2.6rem, 9vw, 4.5rem)", letterSpacing: "-0.03em" }}
          >
            {s.word.headword}
          </h2>
          {s.word.reading_zhuyin && (
            <p className="text-lg text-white/85 tracking-wide">{s.word.reading_zhuyin}</p>
          )}
          {s.word.meaning_ja && (
            <p className="max-w-md text-sm text-white/70">{s.word.meaning_ja}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={playPronounce}
              className="lift-soft grid h-11 w-11 place-items-center rounded-full bg-white/12 text-white backdrop-blur-md ring-1 ring-white/25"
              aria-label="発音"
            >
              <Volume2 className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              className="lift-soft rounded-full bg-white/12 px-4 py-2.5 text-xs font-medium text-white backdrop-blur-md ring-1 ring-white/25"
            >
              詳しく見る
            </button>
            {s.location_name && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-white/70">
                <MapPin className="h-3 w-3" />
                {s.location_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewFeedCard() {
  return (
    <section className="feed-card relative grid h-[100dvh] place-items-center overflow-hidden bg-gradient-to-br from-background via-background to-primary/15">
      <div className="mx-6 max-w-md text-center">
        <span className="inline-grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-6 w-6" />
        </span>
        <h3 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
          きょう、覚えているかな。
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          今の気分でひとつだけ、思い出してみる。
        </p>
        <Link
          to="/review"
          onClick={() => { Sound.tap(); haptic("medium"); }}
          className="lift mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30"
        >
          はじめる
        </Link>
      </div>
    </section>
  );
}

function RecapFeedCard({ items }: { items: StickerWithWord[] }) {
  return (
    <section className="feed-card relative grid h-[100dvh] place-items-center overflow-hidden">
      <div className="absolute inset-0 grid grid-cols-4 grid-rows-2 gap-0.5 opacity-70">
        {items.slice(0, 8).map((s, i) => {
          const url = s.selfie_url ?? s.object_url ?? s.cutout_url ?? s.placeholder_url;
          return url ? (
            <img
              key={s.id}
              src={url}
              alt=""
              className={`h-full w-full object-cover ${i % 2 === 0 ? "ken-burns-a" : "ken-burns-b"}`}
              loading="lazy"
            />
          ) : (
            <div key={s.id} className="bg-secondary" />
          );
        })}
      </div>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative z-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">This week</p>
        <h3 className="mt-4 text-4xl font-semibold tracking-tight">
          あなたの{items.length}枚。
        </h3>
        <p className="mt-3 text-sm text-muted-foreground">また会える言葉たち。</p>
        <button
          onClick={() => { Sound.tap(); haptic("light"); }}
          className="lift mt-8 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-xs font-medium text-foreground backdrop-blur-md ring-1 ring-white/20"
        >
          <Share2 className="h-4 w-4" />
          シェアする
        </button>
      </div>
    </section>
  );
}

function EmptyCard() {
  return (
    <section className="feed-card grid h-[100dvh] place-items-center px-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-[color:oklch(0.75_0.18_240)] text-primary-foreground shadow-2xl shadow-primary/40">
          <ScanLine className="h-9 w-9" />
        </div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">まだ、白い海。</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          街にあるものへカメラをかざすと、
          <br />
          最初の言葉がここに現れます。
        </p>
        <Link
          to="/scan"
          onClick={() => { Sound.tap(); haptic("medium"); }}
          className="lift mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30"
        >
          <ScanLine className="h-5 w-5" />
          はじめて出会う
        </Link>
      </div>
    </section>
  );
}

function LoadingCard() {
  return (
    <section className="feed-card grid h-[100dvh] place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </section>
  );
}

/* ─────────── utils ─────────── */

function relativeDay(d: Date): string {
  const now = new Date();
  const oneDay = 86400000;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const cardDay = new Date(d); cardDay.setHours(0, 0, 0, 0);
  const diff = Math.round((start.getTime() - cardDay.getTime()) / oneDay);
  if (diff <= 0) return "きょう";
  if (diff === 1) return "きのう";
  if (diff < 7) return `${diff}日前`;
  if (diff < 30) return `${Math.floor(diff / 7)}週前`;
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}
