import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import { Quote } from "lucide-react";
import { listJournal, type NativePhrase } from "@/lib/journal.functions";
import { JournalComposer } from "@/components/JournalComposer";
import { useT } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

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
  const fetchJournal = useServerFn(listJournal);

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
  const past = (entries ?? []).filter((e) => e.entry_date !== today);

  return (
    <AppShell title={t("journal.title")}>
      {/* 書く所は `JournalComposer` が持つ。ホームの見開きの右ページも
          同じ部品を描くので、下書きの保存も添削の上限も足場も1つで済む。 */}
      <JournalComposer />

      {/* これまでの日記。読み込み中と失敗を「まだ1件も無い」と描かない —
          何日も書いてきた人にとっては、記録が消えたように見える。 */}
      {isLoading && (
        <section className="mt-10" role="status" aria-label={t("common.loading")}>
          <h3 className="mb-3 text-footnote label-caps text-muted-foreground">
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
          <h3 className="mb-3 text-footnote label-caps text-muted-foreground">
            {t("journal.past")}
          </h3>
          <LoadFailed
            onRetry={() => void refetch()}
            retrying={isFetching}
            what={t("err.whatJournal")}
          />
        </section>
      )}

      {!isLoading && !isError && past.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-3 text-footnote label-caps text-muted-foreground">
            {t("journal.past")}
          </h3>
          <ul className="space-y-3">
            {past.map((e) => (
              <li key={e.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-1 text-footnote text-muted-foreground">{e.entry_date}</div>
                {e.correction && <p className="text-body leading-relaxed">{e.correction}</p>}
                {!e.correction && e.body_zh && (
                  <p className="text-body leading-relaxed">{e.body_zh}</p>
                )}
                {e.feedback_ja && (
                  <p className="mt-2 whitespace-pre-line text-footnote text-muted-foreground">
                    {e.feedback_ja}
                  </p>
                )}
                {e.native_phrases && e.native_phrases.length > 0 && (
                  <div className="mt-3">
                    <NativePhrases phrases={e.native_phrases} compact />
                  </div>
                )}
                {!e.correction && e.body_ja && (
                  <p className="mt-2 text-body text-muted-foreground">{e.body_ja}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}

/**
 * 「ネイティブならこう言う」。日記を直したあとに出る、言い換えの一覧。
 *
 * `export` にしたのは検査の雛形から描くため。ここは問い合わせを持たない。
 */
export function NativePhrases({
  phrases,
  compact,
}: {
  phrases: NativePhrase[];
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div className={compact ? "" : "rounded-2xl border border-primary/20 bg-primary/5 p-4"}>
      <div className="mb-2 flex items-center gap-1.5 text-caption label-caps text-primary-ink">
        <Quote className="h-3 w-3" /> {t("journal.nativeWould")}
      </div>
      <ul className="space-y-2">
        {phrases.map((p, i) => (
          <li key={i} className="rounded-xl bg-card p-3 shadow-sm ring-1 ring-border/60">
            <p lang="zh-Hant" className="text-body font-semibold leading-relaxed">
              {p.zh}
            </p>
            <p className="mt-0.5 text-body text-muted-foreground">{p.ja}</p>
            {p.note && (
              <p className="mt-1 text-footnote leading-relaxed text-muted-foreground/90">
                {p.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 直した文と、その下に添える気づき。日記の結果の主役。
 */
export function EntryBlock({
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
      <div className="mb-1 text-caption label-caps text-muted-foreground">{label}</div>
      <p className="text-body leading-relaxed tracking-wide">{body}</p>
      {subtle && (
        <>
          <div className="mt-3 text-caption label-caps text-muted-foreground">{subtleLabel}</div>
          <p className="whitespace-pre-line text-footnote text-muted-foreground">{subtle}</p>
        </>
      )}
    </div>
  );
}
