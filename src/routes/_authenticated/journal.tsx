import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import {
  listJournal,
  generateTodayJournal,
  correctMyJournal,
  type JournalEntry,
} from "@/lib/journal.functions";
import { Sparkles, BookText, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "日記 — Catchwords" },
      { name: "description", content: "今日の写真から学習言語で日記を書く。AIが添削と模範解答をくれる。" },
    ],
  }),
  component: JournalPage,
});

function JournalPage() {
  const qc = useQueryClient();
  const fetchJournal = useServerFn(listJournal);
  const genJournal = useServerFn(generateTodayJournal);
  const correct = useServerFn(correctMyJournal);

  const { data: entries } = useQuery({
    queryKey: ["journal"],
    queryFn: () => fetchJournal(),
  });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const todayEntry = entries?.find((e) => e.entry_date === today);
  const past = (entries ?? []).filter((e) => e.entry_date !== today);

  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (todayEntry?.user_draft && !draft) setDraft(todayEntry.user_draft);
  }, [todayEntry]);

  const generate = useMutation({
    mutationFn: () => genJournal(),
    onSuccess: () => {
      toast.success("AIの模範日記ができました");
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "生成失敗"),
  });

  const correctMut = useMutation({
    mutationFn: () => correct({ data: { draft } }),
    onSuccess: () => {
      toast.success("添削できました");
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "添削失敗"),
  });

  return (
    <AppShell title="日記">
      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <BookText className="h-4 w-4 text-primary" /> 今日の日記
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            今日撮った写真をもとに、学習している言語で書いてみよう。AIが添削して、模範解答も見せてくれます。
          </p>
        </div>

        <Textarea
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="例: 今天早上我去咖啡店…"
        />

        <div className="flex flex-wrap gap-2">
          <button
            disabled={correctMut.isPending || draft.trim().length < 2}
            onClick={() => correctMut.mutate()}
            className="lift inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30 disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" />
            {correctMut.isPending ? "添削中…" : "AIに添削してもらう"}
          </button>
          <button
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
            className="lift inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            {generate.isPending ? "生成中…" : "AIの模範解答を見る"}
          </button>
        </div>

        {todayEntry && (
          <div className="space-y-3 pt-2">
            {todayEntry.correction && (
              <EntryBlock label="✦ 添削後" body={todayEntry.correction} subtle={todayEntry.feedback_ja} subtleLabel="解説" />
            )}
            {todayEntry.body_zh && (
              <EntryBlock label="✦ AIの模範解答" body={todayEntry.body_zh} subtle={todayEntry.body_ja} subtleLabel="日本語訳" />
            )}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">過去の日記</h3>
          <ul className="space-y-3">
            {past.map((e) => (
              <li key={e.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-1 text-xs text-muted-foreground">{e.entry_date}</div>
                {e.correction && <p className="text-base leading-relaxed">{e.correction}</p>}
                {!e.correction && e.body_zh && <p className="text-base leading-relaxed">{e.body_zh}</p>}
                {e.feedback_ja && (
                  <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{e.feedback_ja}</p>
                )}
                {!e.correction && e.body_ja && (
                  <p className="mt-2 text-sm text-muted-foreground">{e.body_ja}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}

function EntryBlock({
  label,
  body,
  subtle,
  subtleLabel,
}: {
  label: string;
  body: string;
  subtle?: string | null;
  subtleLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <p className="text-base leading-relaxed tracking-wide">{body}</p>
      {subtle && (
        <>
          <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{subtleLabel}</div>
          <p className="whitespace-pre-line text-xs text-muted-foreground">{subtle}</p>
        </>
      )}
    </div>
  );
}
