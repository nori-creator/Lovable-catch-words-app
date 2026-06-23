import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { getTodayQuest, type QuestRow } from "@/lib/quests.functions";
import { Target, Sparkles, Camera, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quest")({
  head: () => ({
    meta: [
      { title: "クエスト — Catchwords" },
      { name: "description", content: "AIがあなたのレベルに合わせて出す、今日のデイリークエスト。" },
    ],
  }),
  component: QuestPage,
});

function QuestPage() {
  const fetchQuest = useServerFn(getTodayQuest);
  const { data: quest, isLoading } = useQuery({
    queryKey: ["quest-today"],
    queryFn: () => fetchQuest(),
  });

  return (
    <AppShell title="クエスト">
      <section className="mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">きょうのクエスト</h1>
        </div>
        <p className="text-sm text-muted-foreground">AIがあなたのレベルに合わせて毎日ひとつ出題します。</p>
      </section>

      {isLoading ? (
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">今日のクエストを用意中…</p>
        </div>
      ) : quest ? (
        <QuestCard quest={quest} />
      ) : null}
    </AppShell>
  );
}

function QuestCard({ quest }: { quest: QuestRow }) {
  const pct = Math.min(100, Math.round((quest.progress / Math.max(1, quest.target_count)) * 100));
  const vibrated = useRef(false);

  useEffect(() => {
    if (quest.completed && !vibrated.current) {
      vibrated.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
    }
  }, [quest.completed]);

  return (
    <article
      className={`rounded-3xl border bg-card p-6 shadow-lg transition-transform ${
        quest.completed ? "border-green-500/50 shadow-green-500/10" : "border-border shadow-primary/10"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">
          {labelForType(quest.type)}
        </span>
        {quest.completed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-[11px] font-semibold text-green-600">
            <Check className="h-3.5 w-3.5" /> 達成！{quest.reward}
          </span>
        )}
      </div>

      <h2 className="text-xl font-bold tracking-tight">{quest.title}</h2>
      {quest.description && <p className="mt-1 text-sm text-muted-foreground">{quest.description}</p>}

      <div className="mt-5">
        <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
          <span>進捗</span>
          <span className="font-semibold text-foreground">
            {Math.min(quest.progress, quest.target_count)} / {quest.target_count}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              quest.completed ? "bg-green-500" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!quest.completed && (
        <Link
          to="/capture"
          className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 active:scale-[0.98]"
        >
          <Camera className="h-4 w-4" /> いま挑戦する
        </Link>
      )}
    </article>
  );
}

function labelForType(type: QuestRow["type"]): string {
  switch (type) {
    case "category":
      return "カテゴリチャレンジ";
    case "review":
      return "復習チャレンジ";
    case "color":
      return "いろさがし";
    default:
      return "キャッチチャレンジ";
  }
}
