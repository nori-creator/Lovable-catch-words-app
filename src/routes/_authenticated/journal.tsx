import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import { listJournal, correctMyJournal, type NativePhrase } from "@/lib/journal.functions";
import { BookText, Quote, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";
import { draftKeyFor, readLeftoverDrafts } from "@/lib/journal-drafts";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: tStatic("page.journal") },
      {
        name: "description",
        content: "今日の写真から学習言語で日記を書く。AIが添削と模範解答をくれる。",
      },
    ],
  }),
  component: JournalPage,
});

function JournalPage() {
  const t = useT();
  const qc = useQueryClient();
  const fetchJournal = useServerFn(listJournal);
  const correct = useServerFn(correctMyJournal);

  const {
    data: entries,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["journal"],
    queryFn: () => fetchJournal(),
  });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const todayEntry = entries?.find((e) => e.entry_date === today);
  const past = (entries ?? []).filter((e) => e.entry_date !== today);

  const [draft, setDraft] = useState("");
  const [savedLocally, setSavedLocally] = useState(false);
  /** 日をまたいで残った書きかけ(拾えるように出す)。 */
  const [leftover, setLeftover] = useState<{ date: string; text: string } | null>(null);

  /**
   * 書いたものを端末に即保存する。
   *
   * ## なぜ要るか
   * この画面には「保存」が無い。書いた文章が DB に入るのは、AIの添削が
   * **成功した後**の upsert だけ。しかも添削には1日の上限があるので、
   * 上限に達していると保存に到達する道が1本も無い。
   *
   * つまり: 300字書いて「添削してもらう」を押す → 「上限に達しました」
   * → 画面を離れた瞬間、書いた文章は消える。**自分で書いた文章は写真の
   * 次に取り返しがつかない**のに、置き場所がどこにも無かった。
   *
   * サーバーに届く前に、まず手元に置く。
   */
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const saved = localStorage.getItem(draftKeyFor(today));
    if (saved && !draft) {
      setDraft(saved);
      setSavedLocally(true);
    }
    // 古い書きかけは掃除しつつ、いちばん新しいものだけ拾えるようにする。
    // **自動では入れない** — 勝手に入れると、日付で鍵を分けた意味が消える。
    setLeftover(readLeftoverDrafts(today)[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const id = setTimeout(() => {
      try {
        if (draft.trim()) {
          localStorage.setItem(draftKeyFor(today), draft);
          setSavedLocally(true);
        } else {
          localStorage.removeItem(draftKeyFor(today));
          setSavedLocally(false);
        }
      } catch {
        /* 書けない端末もある。保存できないだけで、書くことは止めない。 */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [draft]);
  // 保存済みの下書きを一度だけ流し込む。draft を依存に入れると入力の
  // 一文字ごとに再実行され、「書きかけを上書きしない」という意図が壊れる
  // (todayEntry が更新されたときだけ、空なら埋めるのが正しい挙動)。
  useEffect(() => {
    if (todayEntry?.user_draft && !draft) setDraft(todayEntry.user_draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEntry]);

  const correctMut = useMutation({
    mutationFn: () => correct({ data: { draft } }),
    onSuccess: () => {
      toast.success(t("journal.done"));
      // サーバーに入ったので端末の控えは要らない。
      try {
        localStorage.removeItem(draftKeyFor(today));
      } catch {
        /* ignore */
      }
      setSavedLocally(false);
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("journal.failed")),
  });

  return (
    <AppShell title={t("journal.title")}>
      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <BookText className="h-4 w-4 text-primary" /> {t("journal.today")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("journal.intro")}</p>
        </div>

        {/* 取得に失敗したときは**書く前に言う**。今日の書きかけがあっても
            読めていないので、空の欄に書いて送ると上書きになる。
            書くこと自体は止めない — それがこの画面の用事だから。 */}
        {isError && (
          <p
            role="alert"
            className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground"
          >
            {t("journal.loadFailedNote")}
          </p>
        )}

        {/* 日をまたいだ書きかけ。**自分で押したときだけ**入れる。
            添削の上限に当たった日の文章は、翌日ここからしか戻せない。 */}
        {leftover && !draft.trim() && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {t("journal.leftover", { d: leftover.date, s: leftover.text.slice(0, 24) })}
            </p>
            <button
              onClick={() => {
                setDraft(leftover.text);
                setLeftover(null);
              }}
              className="min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold text-primary"
            >
              {t("journal.leftoverRestore")}
            </button>
          </div>
        )}

        <Textarea
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("journal.placeholder")}
        />
        {savedLocally && (
          <p className="text-[11px] text-muted-foreground">{t("journal.keptOnDevice")}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            disabled={correctMut.isPending || draft.trim().length < 2}
            onClick={() => correctMut.mutate()}
            className="lift inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30 disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" />
            {correctMut.isPending ? t("journal.correcting") : t("journal.askCorrect")}
          </button>
        </div>

        {todayEntry && (
          <div className="space-y-3 pt-2">
            {todayEntry.correction && (
              <EntryBlock
                label={t("journal.corrected")}
                body={todayEntry.correction}
                subtle={todayEntry.feedback_ja}
                subtleLabel={t("journal.patterns")}
              />
            )}
            {todayEntry.native_phrases && todayEntry.native_phrases.length > 0 && (
              <NativePhrases phrases={todayEntry.native_phrases} />
            )}
          </div>
        )}
      </section>

      {/* これまでの日記。読み込み中と失敗を「まだ1件も無い」と描かない —
          何日も書いてきた人にとっては、記録が消えたように見える。 */}
      {isLoading && (
        <section className="mt-10" role="status" aria-label={t("common.loading")}>
          <h3 className="mb-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {t("journal.past")}
          </h3>
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        </section>
      )}

      {isError && (
        <section className="mt-10">
          <h3 className="mb-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {t("journal.past")}
          </h3>
          <LoadFailed onRetry={() => void refetch()} retrying={isFetching} />
        </section>
      )}

      {!isLoading && !isError && past.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {t("journal.past")}
          </h3>
          <ul className="space-y-3">
            {past.map((e) => (
              <li key={e.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-1 text-xs text-muted-foreground">{e.entry_date}</div>
                {e.correction && <p className="text-base leading-relaxed">{e.correction}</p>}
                {!e.correction && e.body_zh && (
                  <p className="text-base leading-relaxed">{e.body_zh}</p>
                )}
                {e.feedback_ja && (
                  <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                    {e.feedback_ja}
                  </p>
                )}
                {e.native_phrases && e.native_phrases.length > 0 && (
                  <div className="mt-3">
                    <NativePhrases phrases={e.native_phrases} compact />
                  </div>
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

function NativePhrases({ phrases, compact }: { phrases: NativePhrase[]; compact?: boolean }) {
  const t = useT();
  return (
    <div className={compact ? "" : "rounded-2xl border border-primary/20 bg-primary/5 p-4"}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] text-primary">
        <Quote className="h-3 w-3" /> {t("journal.nativeWould")}
      </div>
      <ul className="space-y-2">
        {phrases.map((p, i) => (
          <li key={i} className="rounded-xl bg-card p-3 shadow-sm ring-1 ring-border/60">
            <p lang="zh-Hant" className="text-base font-semibold leading-relaxed">
              {p.zh}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{p.ja}</p>
            {p.note && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground/90">{p.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
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
  const t = useT();
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <p className="text-base leading-relaxed tracking-wide">{body}</p>
      {subtle && (
        <>
          <div className="mt-3 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {subtleLabel}
          </div>
          <p className="whitespace-pre-line text-xs text-muted-foreground">{subtle}</p>
        </>
      )}
    </div>
  );
}
