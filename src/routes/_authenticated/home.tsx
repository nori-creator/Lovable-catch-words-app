import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listMyStickers } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getMyStats } from "@/lib/stats.functions";
import { getTodayQuests } from "@/lib/quests.functions";
import { useEffect } from "react";
import { Camera, MapPin, Flame, Sparkles, BookOpen, Target, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "ホーム — Catchwords" },
      { name: "description", content: "今日キャッチしたステッカーを並べる、あなたのデイリーアルバム。" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const fetchStickers = useServerFn(listMyStickers);
  const fetchProfile = useServerFn(getMyProfile);
  const fetchStats = useServerFn(getMyStats);
  const fetchQuests = useServerFn(getTodayQuests);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: stickers, isLoading } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
  });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => fetchStats() });
  const { data: quests } = useQuery({ queryKey: ["quests-today"], queryFn: () => fetchQuests() });

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/onboarding", replace: true });
  }, [profile, navigate]);

  const today = new Date().toDateString();
  const todayStickers = (stickers ?? []).filter((s) => new Date(s.created_at).toDateString() === today);
  const xpForLevel = stats ? Math.pow(stats.level, 2) * 50 : 0;
  const xpForNext = stats ? Math.pow(stats.level + 1, 2) * 50 : 100;
  const xpProgress = stats ? Math.min(100, Math.round(((stats.xp - xpForLevel) / (xpForNext - xpForLevel)) * 100)) : 0;

  return (
    <AppShell>
      <section className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">今日のステッカーアルバム</h1>
        <p className="text-sm text-muted-foreground">こんにちは、{profile?.display_name ?? "あなた"}。街で見つけた言葉を集めましょう。</p>
      </section>


      {/* Stats banner */}
      <section className="mb-5 rounded-3xl bg-gradient-to-br from-primary/90 via-primary to-rose-500 p-5 text-primary-foreground shadow-lg shadow-primary/20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Flame className="h-6 w-6" />
            <div>
              <div className="text-3xl font-bold leading-none">{stats?.streak ?? 0}</div>
              <div className="text-[11px] uppercase tracking-wider opacity-80">日連続</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            <div>
              <div className="text-3xl font-bold leading-none">Lv.{stats?.level ?? 1}</div>
              <div className="text-[11px] uppercase tracking-wider opacity-80">{stats?.xp ?? 0} XP</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            <div>
              <div className="text-3xl font-bold leading-none">{stats?.captured_total ?? 0}</div>
              <div className="text-[11px] uppercase tracking-wider opacity-80">単語</div>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all duration-700"
              style={{ width: `${xpProgress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] opacity-80">
            <span>Lv.{stats?.level ?? 1}</span>
            <span>あと {Math.max(0, xpForNext - (stats?.xp ?? 0))} XP</span>
          </div>
        </div>
      </section>

      <Link
        to="/capture"
        className="lift mb-3 flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lg shadow-primary/30"
      >
        <Camera className="h-6 w-6" />
        <div className="flex-1">
          <div className="text-base font-semibold">今日の一枚を撮る</div>
          <div className="text-xs opacity-80">対象物 → 自撮り → ステッカー化</div>
        </div>
      </Link>

      {(stats?.reviews_due ?? 0) > 0 && (
        <Link
          to="/review"
          className="lift-soft mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3"
        >
          <Target className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">復習が {stats?.reviews_due} 件待ってます</div>
            <div className="text-xs text-muted-foreground">今日 {stats?.reviews_done_today ?? 0} 回 復習済み</div>
          </div>
          <span className="text-xs text-primary">→</span>
        </Link>
      )}

      {/* Daily quests */}
      {quests && quests.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold tracking-tight">今日のクエスト</h2>
          <ul className="space-y-2">
            {quests.map((q) => (
              <li
                key={q.id}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${q.completed_at ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-card"}`}
              >
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${q.completed_at ? "bg-emerald-500 text-white" : "bg-secondary"}`}>
                  {q.completed_at ? <Check className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">「{q.target_word}」を見つける</div>
                  <div className="truncate text-xs text-muted-foreground">{q.hint_ja}</div>
                </div>
                <div className="text-xs font-semibold text-primary">+{q.reward_xp} XP</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">今日のアルバム</h2>
        <span className="text-xs text-muted-foreground">
          {todayStickers.length} / 5（無料プラン）
        </span>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl bg-secondary" />
          ))}
        </div>
      ) : todayStickers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">まだ今日のステッカーがありません。</p>
          <p className="mt-1 text-xs text-muted-foreground">街でひとつ見つけてみましょう。</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {todayStickers.map((s) => (
            <Link
              key={s.id}
              to="/dex/$stickerId"
              params={{ stickerId: s.id }}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-secondary"
            >
              {s.cutout_url ? (
                <img src={s.cutout_url} alt={`「${s.word.headword}」のステッカー`} className="h-full w-full object-contain p-3 transition-transform group-active:scale-95" />
              ) : (
                <div className="grid h-full place-items-center text-3xl">{s.word.silhouette_emoji ?? "📦"}</div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <div className="text-xs font-semibold text-white">{s.word.headword}</div>
                <div className="text-[10px] text-white/80">{s.word.meaning_ja}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold tracking-tight">最近のキャッチ</h2>
        <ul className="space-y-2">
          {(stickers ?? []).slice(0, 8).map((s) => (
            <li key={s.id}>
              <Link
                to="/dex/$stickerId"
                params={{ stickerId: s.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-accent/40"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary">
                  {s.cutout_url ? (
                    <img src={s.cutout_url} alt={`「${s.word.headword}」のステッカー`} className="h-full w-full object-contain p-1" />
                  ) : (
                    <span className="text-2xl">{s.word.silhouette_emoji ?? "📦"}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-semibold">{s.word.headword}</span>
                    <span className="text-xs text-muted-foreground">{s.word.reading_zhuyin}</span>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">{s.word.meaning_ja}</div>
                  {s.location_name && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {s.location_name}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
