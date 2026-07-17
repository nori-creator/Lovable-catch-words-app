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
  const [rippling, setRippling] = useState(false);
  const isReunion = Boolean(s.location_name);

  const onTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    unlockAudio();
    haptic("light");
    Sound.tap();
    setRippling(true);
    window.setTimeout(() => setRippling(false), 520);
  };

  const pressTimer = useRef<number | null>(null);
  const onPressStart = () => {
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
      } catch { /* dismissed */ }
    }, 550);
  };
  const clearPress = () => { if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } };

  return (
    <section
      className="feed-card relative grid h-[100dvh] place-items-center overflow-hidden"
      onClick={onOpen}
      onPointerDown={onPressStart}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
    >
      {hero ? (
        <div className="absolute inset-0">
          <img
            src={hero}
            alt={s.word.headword}
            className={`h-full w-full object-cover ${variant === "a" ? "ken-burns-a" : "ken-burns-b"}`}
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#040814] via-[#040814]/60 to-transparent" />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/25 to-background">
          <span className="text-7xl">{s.word.silhouette_emoji ?? "📦"}</span>
        </div>
      )}

      <div className="glass-bar pointer-events-auto absolute inset-x-0 bottom-0 px-6 pb-[max(6.5rem,calc(6rem+env(safe-area-inset-bottom)))] pt-6">
        <div className="reveal-stagger mx-auto max-w-lg">
          <div className="flex items-center gap-2 font-mono-tight text-[10px] font-medium uppercase tracking-[0.35em] text-white/60">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: isReunion ? "var(--accent-gold)" : "var(--accent-cyan)" }}
              aria-label={isReunion ? "再会" : "初遭遇"}
            />
            <span>{rel}{s.location_name ? ` · ${s.location_name}` : ""}</span>
          </div>
          <h2
            onClick={onTap}
            className="font-display mt-2 cursor-pointer select-none leading-[0.95] text-white"
            style={{ fontSize: "clamp(3rem, 12vw, 5.5rem)" }}
          >
            {s.word.headword}
          </h2>
          <div className="relative mt-1 h-0.5 w-24 overflow-hidden">
            {rippling && (
              <span className="wave-ripple absolute inset-0 block h-full w-full origin-left bg-white/70" />
            )}
          </div>
          {(s.word.reading_zhuyin || s.word.pinyin) && (
            <p className="font-mono-tight mt-3 text-[13px] tracking-wider text-white/70">
              {s.word.reading_zhuyin ?? s.word.pinyin}
            </p>
          )}
          {s.word.meaning_ja && (
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-white/60">
              {s.word.meaning_ja}
            </p>
          )}
        </div>
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
      <div className="absolute inset-0 bg-[#040814]/75 backdrop-blur-xl" />
      <div className="reveal-stagger relative z-10 text-center">
        <p className="font-mono-tight text-[10px] uppercase tracking-[0.4em] text-white/50">This week</p>
        <p
          className="font-display mt-3 leading-none text-white"
          style={{ fontSize: "clamp(6rem, 22vw, 10rem)", color: "var(--accent-gold)" }}
        >
          {items.length}
        </p>
        <p className="font-display -mt-2 text-2xl italic text-white/85">words caught</p>
        <p className="mt-4 text-xs tracking-wide text-white/50">また会える言葉たち。</p>
        <button
          onClick={() => { Sound.tap(); haptic("light"); }}
          className="press-in lift-glass mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-xs font-medium text-white ring-1 ring-white/20"
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
