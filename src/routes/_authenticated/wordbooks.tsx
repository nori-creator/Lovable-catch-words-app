import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookMarked, Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import { EmptyState } from "@/components/EmptyState";
import { WordbookShelf } from "@/components/WordbookShelf";
import { WordbookReviewCard } from "@/components/WordbookReviewCard";
import { Zh } from "@/components/Zh";
import { usePronounce } from "@/lib/use-pronounce";
import { formatCount } from "@/lib/count";
import { useT, tStatic } from "@/lib/i18n";
import { fileToDataUrl } from "@/lib/file-data-url";
import {
  extractWordbook,
  createWordbook,
  listWordbooks,
  getWordbookDue,
  gradeWordbookEntry,
  deleteWordbook,
  type WordbookCard,
} from "@/lib/wordbook.functions";
import type { WordbookEntryDraft } from "@/lib/wordbook";

export const Route = createFileRoute("/_authenticated/wordbooks")({
  head: () => ({
    meta: [
      { title: tStatic("page.wordbooks") },
      {
        name: "description",
        content: "単語帳を写真に撮ると、そこに並ぶ語をまとめて取り込んで復習できる。",
      },
    ],
  }),
  component: WordbooksPage,
});

/**
 * 単語帳の取り込みと、単語帳だけを回す復習(オーナー指摘 2026-08-20)。
 *
 * > 「単語帳の取り込みは単語帳を写真撮ったら、そこにある単語のカードを
 * >  一括で作成でき、復習も図鑑の単語とは別に、単語帳を選択すると
 * >  単語帳で取り込んだものを SRS で復習できるように。」
 *
 * 画面は3つの状態しか持たない: 本棚 / 取り込みの確認 / 復習。
 * 別々のルートに割らないのは、**取り込んだ直後にそのまま回せる**のが
 * この機能の値打ちだから。
 */
function WordbooksPage() {
  const t = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listWordbooks);
  const {
    data: books,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({ queryKey: ["wordbooks"], queryFn: () => listFn() });

  /** 取り込みの確認中(まだ保存していない)。 */
  const [draft, setDraft] = useState<{ title: string; entries: WordbookEntryDraft[] } | null>(null);
  /** 復習中の本。 */
  const [reviewing, setReviewing] = useState<string | null>(null);

  if (reviewing) {
    return <WordbookReview bookId={reviewing} onClose={() => setReviewing(null)} />;
  }

  return (
    <AppShell title={t("wb.title")}>
      {draft ? (
        <ImportConfirm
          draft={draft}
          onCancel={() => setDraft(null)}
          onSaved={(id) => {
            setDraft(null);
            void qc.invalidateQueries({ queryKey: ["wordbooks"] });
            setReviewing(id);
          }}
          onChange={setDraft}
        />
      ) : (
        <>
          {/* **棚が先、取り込みが後**(オーナー指摘 2026-08-21
              「復習の単語帳の復習は**上部に**リアルな本の本棚を作って」)。
              前は「単語帳を撮る」が上に居て、持っている本を見るのに
              一度その下まで目を落とす必要があった。持っている人にとっては
              棚が本体で、撮るのは足すときだけの入口。 */}
          <section>
            {isLoading ? (
              <div className="space-y-2" role="status" aria-label={t("common.loading")}>
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />
                ))}
              </div>
            ) : isError ? (
              // 空ではなく**失敗**。ここを「まだ1冊も無い」と描くと、
              // 何冊も取り込んだ人には記録が消えたように見える。
              <LoadFailed
                onRetry={() => void refetch()}
                retrying={isFetching}
                what={t("wb.whatShelf")}
              />
            ) : (books?.length ?? 0) === 0 ? (
              <EmptyState icon={BookMarked} title={t("wb.emptyTitle")} hint={t("wb.emptyBody")} />
            ) : (
              <WordbookShelf
                books={books ?? []}
                onOpen={setReviewing}
                onDelete={(id) => void removeBook(id)}
              />
            )}
          </section>
          <div className="mt-6">
            <ImportButton onExtracted={setDraft} />
          </div>
        </>
      )}
    </AppShell>
  );

  async function removeBook(id: string) {
    const book = books?.find((b) => b.id === id);
    // **消す前に見せる。** 語ごと消えるので、取り返しがつかない。
    if (!window.confirm(t("wb.confirmDelete", { title: book?.title ?? "" }))) return;
    try {
      await deleteWordbook({ data: { wordbook_id: id } });
      await qc.invalidateQueries({ queryKey: ["wordbooks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wb.deleteFailed"));
    }
  }
}

/** 写真を撮って読み取る。**保存はまだしない。** */
function ImportButton({
  onExtracted,
}: {
  onExtracted: (d: { title: string; entries: WordbookEntryDraft[] }) => void;
}) {
  const t = useT();
  const extract = useServerFn(extractWordbook);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const out = await extract({ data: { imageBase64: dataUrl } });
      onExtracted(out);
    } catch (e) {
      // **理由をそのまま出す。** 「読み取れませんでした」だけだと、
      // 撮り方を変えればいいのか、上限に当たったのかが分からない。
      toast.error(e instanceof Error ? e.message : t("wb.extractFailed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {/* `<label>` で包む。**ボタンから programmatic に click しない** —
          その形にすると端末によってはカメラが開かない(自撮りで踏んだ穴)。 */}
      <label className="block">
        <span
          className={`press-in flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-body font-semibold ${
            busy
              ? "bg-secondary text-muted-foreground"
              : "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
          }`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="h-4 w-4" aria-hidden />
          )}
          {busy ? t("wb.reading") : t("wb.shootBook")}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && void handle(e.target.files[0])}
        />
      </label>
      <p className="ja-phrase mt-2 text-caption text-muted-foreground">{t("wb.shootHint")}</p>
    </div>
  );
}

/**
 * 読み取った語を確かめてから入れる。
 *
 * **読み違いをそのまま溜めない。** 単語帳は一度に何十語も入るので、
 * 間違いが混ざったまま保存すると、あとで1語ずつ直すことになる。
 */
function ImportConfirm({
  draft,
  onCancel,
  onSaved,
  onChange,
}: {
  draft: { title: string; entries: WordbookEntryDraft[] };
  onCancel: () => void;
  onSaved: (wordbookId: string) => void;
  onChange: (d: { title: string; entries: WordbookEntryDraft[] }) => void;
}) {
  const t = useT();
  const create = useServerFn(createWordbook);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const out = await create({
        data: {
          title: draft.title,
          entries: draft.entries.map((e) => ({
            headword: e.headword,
            reading_zhuyin: e.reading_zhuyin ?? null,
            pinyin: e.pinyin ?? null,
            meaning_ja: e.meaning_ja ?? null,
          })),
        },
      });
      toast.success(t("wb.saved", { n: formatCount(out.added) }));
      onSaved(out.wordbook_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wb.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-title font-semibold tracking-tight">{t("wb.confirmTitle")}</h2>
        <p className="ja-phrase mt-1 text-footnote text-muted-foreground">{t("wb.confirmHint")}</p>
      </div>

      <label className="block">
        <span className="text-caption label-caps text-muted-foreground">{t("wb.bookTitle")}</span>
        <input
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder={t("wb.bookTitlePlaceholder")}
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-body"
        />
      </label>

      <ul className="space-y-1.5">
        {draft.entries.map((e, i) => (
          <li
            key={`${e.headword}-${i}`}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold">
                <Zh>{e.headword}</Zh>
              </span>
              {e.meaning_ja && (
                <span className="block truncate text-caption text-muted-foreground">
                  {e.meaning_ja}
                </span>
              )}
            </span>
            <button
              onClick={() =>
                onChange({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })
              }
              aria-label={t("wb.dropWord", { word: e.headword })}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={saving || draft.entries.length === 0}
          onClick={() => void save()}
          className="press-in inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {t("wb.saveN", { n: formatCount(draft.entries.length) })}
        </button>
        <button
          onClick={onCancel}
          className="min-h-11 rounded-full px-4 text-body font-semibold text-muted-foreground"
        >
          {t("common.cancel")}
        </button>
      </div>
    </section>
  );
}

/** その本だけを回す復習。間隔の計算は図鑑の復習と同じ `nextSrs`。 */
function WordbookReview({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const dueFn = useServerFn(getWordbookDue);
  const gradeFn = useServerFn(gradeWordbookEntry);
  const pronounce = usePronounce();
  const [idx, setIdx] = useState(0);
  const [tally, setTally] = useState({ answered: 0, correct: 0 });

  const {
    data: cards,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["wordbook-due", bookId],
    queryFn: () => dueFn({ data: { wordbook_id: bookId } }),
    staleTime: 0,
  });

  const current: WordbookCard | undefined = cards?.[idx];
  const done = cards && idx >= cards.length;

  async function answer(correct: boolean) {
    if (!current) return;
    setTally((v) => ({ answered: v.answered + 1, correct: v.correct + (correct ? 1 : 0) }));
    setIdx((i) => i + 1);
    try {
      await gradeFn({ data: { entry_id: current.id, correct } });
    } catch {
      // 採点が届かなくても、その場の学習は止めない。次に開いたときに
      // また出るだけ — **黙って進んでいるように見せない**ほうが害が大きい。
      toast.error(t("wb.gradeFailed"));
    }
    void qc.invalidateQueries({ queryKey: ["wordbooks"] });
  }

  return (
    <AppShell title={t("wb.reviewTitle")}>
      <button
        onClick={onClose}
        className="mb-3 min-h-11 text-footnote font-semibold text-primary-ink"
      >
        {t("wb.backToShelf")}
      </button>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-secondary" role="status" />
      ) : isError ? (
        <LoadFailed onRetry={() => void refetch()} retrying={isFetching} what={t("wb.whatDue")} />
      ) : (cards?.length ?? 0) === 0 ? (
        <EmptyState icon={CheckCircle2} title={t("wb.allDoneTitle")} hint={t("wb.allDoneBody")} />
      ) : done ? (
        <section className="rounded-3xl border border-border bg-card p-6 text-center">
          <p className="text-title font-bold">{t("wb.finished")}</p>
          <p className="mt-1 text-body text-muted-foreground">
            {t("wb.score", {
              correct: formatCount(tally.correct),
              total: formatCount(tally.answered),
            })}
          </p>
          <button
            onClick={onClose}
            className="press-in mt-4 min-h-11 rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground"
          >
            {t("wb.backToShelf")}
          </button>
        </section>
      ) : current ? (
        <>
          <p className="mb-2 text-footnote text-muted-foreground">
            {t("wb.progress", {
              done: formatCount(idx),
              total: formatCount(cards?.length ?? 0),
            })}
          </p>
          <WordbookReviewCard
            key={current.id}
            card={current}
            onAnswer={(correct) => void answer(correct)}
            onSpeak={(w) => void pronounce(w)}
          />
        </>
      ) : null}
    </AppShell>
  );
}
