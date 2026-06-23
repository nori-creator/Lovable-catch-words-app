import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listMyStickers } from "@/lib/stickers.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getTodayQuest } from "@/lib/quests.functions";
import { getDiary } from "@/lib/diary.functions";
import { useEffect } from "react";
import { Camera, MapPin, Target, BookText, Check } from "lucide-react";

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
  const fetchQuest = useServerFn(getTodayQuest);
  const fetchDiary = useServerFn(getDiary);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: stickers, isLoading } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
  });
  // 初回起動時にその日のクエストを生成（遅延生成）
  const { data: quest } = useQuery({ queryKey: ["quest-today"], queryFn: () => fetchQuest() });
  const todayDate = new Date().toISOString().slice(0, 10);
  const { data: diary } = useQuery({ queryKey: ["diary", todayDate], queryFn: () => fetchDiary({ data: { date: todayDate } }) });

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/onboarding", replace: true });
  }, [profile, navigate]);

  const today = new Date().toDateString();
  const todayStickers = (stickers ?? []).filter((s) => new Date(s.created_at).toDateString() === today);

  return (
    <AppShell>
      <section className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">こんにちは、{profile?.display_name ?? "あなた"}</h1>
        <p className="text-sm text-muted-foreground">街で見つけた言葉を集めましょう。</p>
      </section>

      {quest && (
        <Link
          to="/quest"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
        >
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              quest.completed ? "bg-green-500/15 text-green-600" : "bg-primary/10 text-primary"
            }`}
          >
            {quest.completed ? <Check className="h-5 w-5" /> : <Target className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">きょうのクエスト</div>
            <div className="truncate text-sm font-semibold">{quest.title}</div>
          </div>
          <span className="text-xs text-muted-foreground">
            {Math.min(quest.progress, quest.target_count)}/{quest.target_count}
          </span>
        </Link>
      )}

      <Link
        to="/capture"
        className="mb-6 flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-[0.98]"
      >
        <Camera className="h-6 w-6" />
        <div className="flex-1">
          <div className="text-base font-semibold">今日の一枚を撮る</div>
          <div className="text-xs opacity-80">対象物 → 自撮り → ステッカー化</div>
        </div>
      </Link>

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
                <img src={s.cutout_url} alt={s.word.headword} className="h-full w-full object-contain p-3 transition-transform group-active:scale-95" />
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

      <Link
        to="/diary"
        className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4 transition-colors hover:bg-primary/10"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <BookText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {diary ? "きょうの振り返り日記を見る" : "きょうの振り返り日記を書く"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {diary
              ? "AIが綴った台湾華語の日記が待っています"
              : todayStickers.length > 0
                ? "今日の言葉から、AIが台湾華語で日記を作ります"
                : "ひとつ言葉をキャッチすると日記を作れます"}
          </div>
        </div>
      </Link>

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
                    <img src={s.cutout_url} alt={s.word.headword} className="h-full w-full object-contain p-1" />
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
