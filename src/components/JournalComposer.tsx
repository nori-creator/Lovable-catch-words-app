import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookText, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { JournalScaffold } from "@/components/JournalScaffold";
import { EntryBlock, NativePhrases } from "@/routes/_authenticated/journal";
import { listJournal, correctMyJournal, getJournalPrompts } from "@/lib/journal.functions";
import { draftKeyFor, readLeftoverDrafts } from "@/lib/journal-drafts";
import { useT } from "@/lib/i18n";

/**
 * 今日の日記を**書く**ところ。
 *
 * ## なぜ部品にしたか
 * オーナー: 「今日の日記を書くボタンを押したら、ホームのアルバムのページが
 * めくれて、左に今日撮った写真、右ページに日記を書く。**いまはアルバムの
 * 写真と日記が別の機能として分離してる。**」
 *
 * 見開きの**右ページ**にこれを置くには、書く仕組みが `/journal` の中に
 * 直書きされていては足りない。写して2つにすると、下書きの保存も添削の
 * 上限も足場も**2箇所に分かれて必ず食い違う** — この app が
 * 声の選び方で3回、写真の選び方で10箇所やった間違いと同じ形。
 * だから1つに切り出して、日記の画面とホームの見開きが同じ物を描く。
 *
 * 問い合わせの鍵(`["journal"]` / `["journal-prompts"]`)は元のまま。
 * ホームも同じ鍵で日記を読んでいるので、置き場所が増えても通信は増えない。
 */
export function JournalComposer({
  /**
   * 見出し(「今日の日記」)を出すか。
   * **見開きの右ページでは出さない** — 紙の上に「今日の日記を書く」と
   * 既に書いてあるので、同じことが2行続く(検査の絵で見つけた)。
   */
  showHeading = true,
}: {
  showHeading?: boolean;
} = {}) {
  const t = useT();
  const qc = useQueryClient();
  const fetchJournal = useServerFn(listJournal);
  const correct = useServerFn(correctMyJournal);
  const promptsFn = useServerFn(getJournalPrompts);

  const { data: entries, isError } = useQuery({
    queryKey: ["journal"],
    queryFn: () => fetchJournal(),
  });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const todayEntry = entries?.find((e) => e.entry_date === today);

  /**
   * 書く**前**の足場(要望 #88)。今日撮った物から質問を作る。
   *
   * **添削が済んだ日は出さない。** もう書いた人に「書き出しの質問」を
   * 出しても、済んだことを勧めているだけになる。
   * 失敗しても黙って消える — 足場が無いこと自体は日記を止めない。
   */
  const { data: scaffold } = useQuery({
    queryKey: ["journal-prompts", today],
    queryFn: () => promptsFn(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

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
    <section className="space-y-3">
      <div>
        {showHeading && (
          <h2 className="flex items-center gap-2 text-body font-semibold tracking-tight">
            <BookText className="h-4 w-4 text-primary" /> {t("journal.today")}
          </h2>
        )}
        <p className={`text-footnote text-muted-foreground${showHeading ? " mt-1" : ""}`}>
          {t("journal.intro")}
        </p>
      </div>

      {/* 取得に失敗したときは**書く前に言う**。今日の書きかけがあっても
            読めていないので、空の欄に書いて送ると上書きになる。
            書くこと自体は止めない — それがこの画面の用事だから。 */}
      {isError && (
        <p
          role="alert"
          className="rounded-xl bg-secondary px-3 py-2 text-footnote text-muted-foreground"
        >
          {t("journal.loadFailedNote")}
        </p>
      )}

      {/* 日をまたいだ書きかけ。**自分で押したときだけ**入れる。
            添削の上限に当たった日の文章は、翌日ここからしか戻せない。 */}
      {leftover && !draft.trim() && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-footnote text-muted-foreground">
            {t("journal.leftover", { d: leftover.date, s: leftover.text.slice(0, 24) })}
          </p>
          <button
            onClick={() => {
              setDraft(leftover.text);
              setLeftover(null);
            }}
            className="min-h-11 shrink-0 rounded-full px-3 text-footnote font-semibold text-primary-ink"
          >
            {t("journal.leftoverRestore")}
          </button>
        </div>
      )}

      {/* 白紙を渡さない。**まだ添削していない日だけ**出す。 */}
      {scaffold && !todayEntry?.correction && (
        <JournalScaffold
          data={scaffold}
          onUsePattern={(zh) =>
            // 末尾に足す。**書いた物を消さない** — 押し間違いで
            // 途中まで書いた文が消えるのがいちばん困る。
            setDraft((d) => (d.trim() ? `${d.replace(/\s+$/, "")}\n${zh}` : zh))
          }
        />
      )}

      <Textarea
        rows={6}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("journal.placeholder")}
      />
      {savedLocally && (
        <p className="text-caption text-muted-foreground">{t("journal.keptOnDevice")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          disabled={correctMut.isPending || draft.trim().length < 2}
          onClick={() => correctMut.mutate()}
          className="lift inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-footnote font-semibold text-primary-foreground shadow-sm shadow-primary/30 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
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
  );
}
