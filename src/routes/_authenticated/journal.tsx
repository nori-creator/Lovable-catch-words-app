import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getTodayQuests, completeQuest, type DailyQuest } from "@/lib/quests.functions";
import { listJournal, generateTodayJournal, type JournalEntry } from "@/lib/journal.functions";
import { Check, Sparkles, BookText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "日記 — Catchwords" },
      { name: "description", content: "今日キャッチした語からAIが台湾華語の短い日記を書いてくれる。" },
    ],
  }),
  component: JournalPage,
});

function JournalPage() {
  const qc = useQueryClient();
  const fetchQuests = useServerFn(getTodayQuests);
  const fetchJournal = useServerFn(listJournal);
  const genJournal = useServerFn(generateTodayJournal);
  const finish = useServerFn(completeQuest);

  const { data: quests, isLoading: ql } = useQuery({
    queryKey: ["quests", "today"],
    queryFn: () => fetchQuests(),
  });
  const { data: entries } = useQuery({
    queryKey: ["journal"],
    queryFn: () => fetchJournal(),
  });

  const generate = useMutation({
    mutationFn: () => genJournal(),
    onSuccess: () => {
      toast.success("今日の日記が完成");
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "生成失敗"),
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => finish({ data: { quest_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quests"] }),
  });

  return (
    <AppShell title="日記 & クエスト">
      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight">
          <Sparkles className="h-4 w-4 text-primary" /> 今日のクエスト
        </h2>
        {ql ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {(quests ?? []).map((q: DailyQuest) => (
              <li
                key={q.id}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                  q.completed_at ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <div className="flex-1">
                  <div className="text-base font-semibold">{q.target_word}</div>
                  <div className="text-xs text-muted-foreground">{q.hint_ja}</div>
                </div>
                <span className="text-xs font-medium text-primary">+{q.reward_xp}XP</span>
                {q.completed_at ? (
                  <Check className="h-5 w-5 text-primary" />
                ) : (
                  <button
                    onClick={() => completeMut.mutate(q.id)}
                    className="rounded-full bg-secondary px-3 py-1 text-xs text-foreground hover:bg-secondary/80"
                  >
                    達成
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <BookText className="h-4 w-4 text-primary" /> AI日記
          </h2>
          <button
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30 disabled:opacity-50"
          >
            {generate.isPending ? "生成中…" : "今日の日記を生成"}
          </button>
        </div>
        <ul className="space-y-3">
          {(entries ?? []).map((e: JournalEntry) => (
            <li key={e.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-1 text-xs text-muted-foreground">{e.entry_date}</div>
              <p className="text-base leading-relaxed tracking-wide">{e.body_zh}</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{e.body_ja}</p>
            </li>
          ))}
          {(!entries || entries.length === 0) && (
            <li className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              まだ日記がありません。今日のステッカーを撮ってから「生成」を押してみましょう。
            </li>
          )}
        </ul>
      </section>
    </AppShell>
  );
}
