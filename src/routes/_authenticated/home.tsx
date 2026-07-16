import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Camera, Flame, WifiOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { listPendingCaptures, type PendingCapture } from "@/lib/offline-queue";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "ホーム — Catchwords" },
      { name: "description", content: "今日出会った言葉を、たったひとつの写真から。" },
    ],
  }),
  component: HomePage,
});

/* -------- date helpers -------- */
function dayKey(d: Date) { return d.toLocaleDateString("en-CA"); }
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sun
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function computeStreak(days: Set<string>): number {
  let n = 0;
  const cur = new Date();
  while (days.has(dayKey(cur))) {
    n += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}

/* Offline captures awaiting AI analysis — kept from the old home. */
function PendingCapturesBanner() {
  const [pending, setPending] = useState<PendingCapture[]>([]);
  useEffect(() => {
    const load = () => { void listPendingCaptures().then(setPending); };
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
        {first.object_img
          ? <img src={first.object_img} alt="" className="h-full w-full object-cover" />
          : <WifiOff className="h-5 w-5 text-amber-700" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-amber-950">解析待ちの写真が {pending.length} 枚</span>
        <span className="block text-xs text-amber-900/70">タップで再開</span>
      </span>
    </Link>
  );
}

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

  const today = new Date();
  const todayKey = dayKey(today);

  const { todayHero, weekDays, recent, streak, totalCount } = useMemo(() => {
    const list = stickers ?? [];
    const daySet = new Set<string>();
    let hero: StickerWithWord | null = null;
    for (const s of list) {
      const k = dayKey(new Date(s.created_at));
      daySet.add(k);
      if (k === todayKey) {
        // Prefer the one WITH a hero image (selfie/object) over ghost placeholders.
        const score = (x: StickerWithWord) => (x.selfie_url ? 3 : x.object_url ? 2 : x.placeholder_url ? 1 : 0);
        if (!hero || score(s) > score(hero) ||
            (score(s) === score(hero) && new Date(s.created_at) > new Date(hero.created_at))) {
          hero = s;
        }
      }
    }
    const weekStart = startOfWeek(today);
    const week: { key: string; filled: boolean; isToday: boolean; label: string }[] = [];
    const labels = ["日", "月", "火", "水", "木", "金", "土"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const k = dayKey(d);
      week.push({ key: k, filled: daySet.has(k), isToday: k === todayKey, label: labels[i] });
    }
    const recentList = list.filter((s) => dayKey(new Date(s.created_at)) !== todayKey).slice(0, 12);
    return {
      todayHero: hero,
      weekDays: week,
      recent: recentList,
      streak: computeStreak(daySet),
      totalCount: list.length,
    };
  }, [stickers, todayKey]);

  const todayLabel = today.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
  const weekdayLabel = today.toLocaleDateString("en-US", { weekday: "long" });

  return (
    <AppShell>
      {/* Editorial date header — small, calm, sets tone */}
      <header className="mb-5 flex items-end justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Today</p>
          <h1 className="font-serif-italic mt-1 text-4xl leading-none text-foreground sm:text-5xl">
            {todayLabel}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">{weekdayLabel}</p>
        </div>
        {streak > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 shadow-sm backdrop-blur">
            <Flame className="h-3.5 w-3.5 text-[color:var(--gold-deep)]" fill="currentColor" />
            <span className="font-nums text-sm font-semibold text-foreground">{streak}</span>
          </div>
        )}
      </header>

      <PendingCapturesBanner />

      {/* HERO — Today's catch (1 image, full width) */}
      {isLoading ? (
        <div className="today-frame animate-pulse" />
      ) : todayHero ? (
        <TodayHero sticker={todayHero} onOpen={() => setOpenId(todayHero.id)} />
      ) : (
        <TodayEmpty />
      )}

      {/* Week rhythm — Endowed Progress, 7 dots */}
      <div className="mt-6 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          {weekDays.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-1.5">
              <span className={`week-dot ${d.filled ? "filled" : ""} ${d.isToday ? "today" : ""}`} />
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">this week</span>
      </div>

      {/* Recent finds — horizontal scroll of mini polaroids */}
      {recent.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="font-serif-italic text-lg text-foreground">Recent finds</h2>
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              {recent.length}
            </span>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex gap-3 pb-2">
              {recent.map((s, i) => {
                const url = s.selfie_url ?? s.object_url ?? s.cutout_url ?? s.placeholder_url;
                const rot = ((i % 5) - 2) * 1.2;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setOpenId(s.id)}
                      className="lift-soft mini-polaroid block h-32 w-24 shrink-0"
                      style={{ transform: `rotate(${rot}deg)` }}
                    >
                      <div className="h-[calc(100%-14px)] w-full overflow-hidden bg-secondary">
                        {url ? (
                          <img src={url} alt={s.word.headword} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-2xl">
                            {s.word.silhouette_emoji ?? "📦"}
                          </div>
                        )}
                      </div>
                      <p className="handwritten mt-0.5 truncate text-center text-sm text-amber-950/80">
                        {s.word.headword}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Dex door — a single, calm CTA to the collection */}
      <Link
        to="/dex"
        className="lift dex-door mt-10 flex items-center gap-4 px-5 py-4"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
          <BookOpen className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-[0.3em] text-white/70">Your Dex</span>
          <span className="mt-0.5 block truncate text-lg font-semibold">
            <span className="font-nums">{totalCount}</span>
            <span className="ml-1.5 text-sm font-normal text-white/80">個の言葉</span>
          </span>
        </span>
        <span className="text-white/70">→</span>
      </Link>

      <StickerSheet stickerId={openId} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}

function TodayHero({ sticker, onOpen }: { sticker: StickerWithWord; onOpen: () => void }) {
  const url = sticker.selfie_url ?? sticker.object_url ?? sticker.cutout_url ?? sticker.placeholder_url;
  return (
    <button onClick={onOpen} className="today-frame lift block w-full text-left">
      {url ? (
        <img src={url} alt={sticker.word.headword} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-6xl">
          {sticker.word.silhouette_emoji ?? "📦"}
        </div>
      )}
      {/* Handwritten caption — signed, personal */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/70">Today's catch</p>
          <p className="handwritten mt-1 truncate text-4xl text-white drop-shadow-md sm:text-5xl">
            {sticker.word.headword}
          </p>
          {sticker.caption && (
            <p className="mt-1 line-clamp-1 text-sm text-white/85 drop-shadow">{sticker.caption}</p>
          )}
        </div>
      </div>
    </button>
  );
}

function TodayEmpty() {
  return (
    <Link to="/scan" className="today-frame today-empty lift flex w-full flex-col items-center justify-center p-8 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/20">
        <Camera className="h-7 w-7 text-primary" />
      </span>
      <p className="font-serif-italic mt-5 text-2xl text-foreground/85">
        今日の言葉を、ひとつ。
      </p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        街のどこかにある、まだ見つけていない言葉。かざして見つけてみよう。
      </p>
      <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30">
        <Camera className="h-4 w-4" /> スキャンをはじめる
      </span>
    </Link>
  );
}
