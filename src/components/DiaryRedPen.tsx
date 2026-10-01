import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { useT } from "@/lib/i18n";
import { diaryFont, loadDiaryFont, type DiaryFontId } from "@/lib/diary-fonts";
import {
  markSegments,
  needsRedInk,
  readRedPen,
  redPenKey,
  splitDiary,
  takeFinishedSentences,
  writeRedPen,
  type RedPenLearnKind,
  type RedPenLine,
  type RedPenSummary,
} from "@/lib/red-pen";

/**
 * **日記の赤ペン**（オーナー指示 2026-10-01、`lib/red-pen.ts` の注）。
 *
 * 書く欄はノートの形にする: 書き終わった文（。！？・改行で1文）は上の紙に上がり、
 * **その文のすぐ下の空白に**赤で自然な形と直した理由が書き足される（進研ゼミの赤ペン先生）。
 * 直す所が無い文には花丸だけ。いま打っている文は下の欄に残る。上の文を押すと書き直せる。
 *
 * 全部書いてからまとめて直すと「答えを読んで満足して覚えない」ので、1文ずつその場で返す。
 * 書き終えた後のまとめ（言いたかったこと・模範解答・覚える物）は `RedPenSummarySheet`。
 */

/** 1文に赤を入れる関数（本番は server、見本は決まった答え）。 */
export type RedPenChecker = (sentence: string, before: string[]) => Promise<RedPenLine>;

/** まとめに渡す、書いている間に入れた赤ペン。 */
export type RedPenLineRecord = { sentence: string; corrected: string; verdict: string };

type Result = RedPenLine | "pending" | "error";

/** 同時に AI に見せる文の数（打つ速さに追いつきつつ、並べすぎない）。 */
const PARALLEL = 2;

export function DiaryWriteSheet({
  title,
  initialText,
  font,
  inputFontFamily,
  target,
  check,
  onCancel,
  onSave,
  style,
  initialResults,
}: {
  title: string;
  initialText: string;
  font: DiaryFontId;
  /** 打つ欄の字（IME の途中で字が消えない別名。`diary-fonts.ts` の `diaryInputFamily`）。 */
  inputFontFamily: string;
  /** 学ぶ言語（端末の控えの鍵）。 */
  target: string;
  check: RedPenChecker;
  onCancel: () => void;
  onSave: (text: string, lines: RedPenLineRecord[]) => void;
  style?: React.CSSProperties;
  /** 見本用: 最初から入っている赤ペン（鍵は `redPenKey`）。 */
  initialResults?: Record<string, RedPenLine>;
}) {
  const t = useT();
  const [sentences, setSentences] = useState<string[]>(() => splitDiary(initialText));
  const [input, setInput] = useState("");
  /** 書き直している上の文の番号と、書き直す前に下の欄にあった文。 */
  const [editing, setEditing] = useState<{ index: number; draft: string } | null>(null);
  const [results, setResults] = useState<Record<string, Result>>(() => ({ ...initialResults }));
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const queue = useRef<Array<{ key: string; sentence: string; before: string[] }>>([]);
  const running = useRef(0);
  const alive = useRef(true);
  const composing = useRef(false);
  const paper = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const family = diaryFont(font).family;
  const redFamily = diaryFont("hand").family;
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    // 開発時の二重の取り付け（StrictMode）でも、付け直したら届いた赤を受け取る。
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const pump = useCallback(() => {
    while (running.current < PARALLEL && queue.current.length) {
      const job = queue.current.shift()!;
      running.current++;
      void checkRef
        .current(job.sentence, job.before)
        .then((line) => {
          writeRedPen(job.key, line);
          // 赤の字（繁体字の手書き）を先に読んでおく。読めるまで別の字で描かない。
          void loadDiaryFont("hand", `${line.corrected}${line.note}`).catch(() => undefined);
          if (alive.current) setResults((r) => ({ ...r, [job.key]: line }));
        })
        .catch(() => {
          if (alive.current) setResults((r) => ({ ...r, [job.key]: "error" }));
        })
        .finally(() => {
          running.current--;
          pump();
        });
    }
  }, []);

  // 上がった文に、まだ赤が無ければ頼む（端末に控えがあればそれを使う）。
  useEffect(() => {
    const found: Record<string, Result> = {};
    sentences.forEach((s, i) => {
      if (!s.trim()) return;
      const key = redPenKey(target, s);
      if (resultsRef.current[key] || found[key]) return;
      const cached = readRedPen(key);
      if (cached) {
        found[key] = cached;
        return;
      }
      found[key] = "pending";
      queue.current.push({
        key,
        sentence: s.trim(),
        before: sentences.slice(Math.max(0, i - 3), i),
      });
    });
    if (Object.keys(found).length) setResults((r) => ({ ...r, ...found }));
    pump();
  }, [sentences, target, pump]);

  // 新しい文が上がったら、紙をいちばん下（いま書いた文と赤ペン）まで送る。
  useLayoutEffect(() => {
    const el = paper.current;
    if (el && !editing) el.scrollTop = el.scrollHeight;
  }, [sentences.length, results, editing]);

  /** 直前に切り分けた欄の文字。変換の確定で同じ値が2回届いても（Safari）、文を2度上げない。 */
  const lastSettled = useRef<string | null>(null);
  const settle = (value: string) => {
    if (value === lastSettled.current) return;
    lastSettled.current = value;
    const { done, rest } = takeFinishedSentences(value);
    if (!done.length) {
      setInput(value);
      return;
    }
    if (editing) {
      // 書き直していた文が書き終わった → 元の場所へ戻し、前に打っていた文を欄に戻す。
      setSentences((list) => {
        const next = [...list];
        next.splice(editing.index, 1, ...done, ...(rest.trim() ? [rest] : []));
        return next;
      });
      setInput(editing.draft);
      setEditing(null);
      return;
    }
    setSentences((list) => [...list, ...done]);
    setInput(rest);
  };

  const startEdit = (index: number) => {
    if (editing) return;
    const s = sentences[index];
    setEditing({ index, draft: input });
    setInput(s.replace(/\n+$/, ""));
    requestAnimationFrame(() => field.current?.focus());
  };

  const commitEdit = (list: string[], value: string, at: number): string[] => {
    const next = [...list];
    next.splice(at, 1, ...splitDiary(value));
    return next;
  };

  const finish = () => {
    const list = editing ? commitEdit(sentences, input, editing.index) : sentences;
    const tail = editing ? editing.draft : input;
    const text = [...list, tail].join("");
    const lines: RedPenLineRecord[] = list.flatMap((s) => {
      const r = results[redPenKey(target, s)];
      return r && typeof r === "object"
        ? [{ sentence: s.trim(), corrected: r.corrected, verdict: r.verdict }]
        : [];
    });
    onSave(text, lines);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 空の欄で後ろへ消す → 上の最後の文を欄に戻して書き直せる（ノートで消しゴムを当てる所）。
    if (e.key === "Backspace" && !input && !editing && sentences.length && !composing.current) {
      e.preventDefault();
      const last = sentences[sentences.length - 1];
      setSentences((list) => list.slice(0, -1));
      setInput(last.replace(/\n+$/, ""));
    }
  };

  return (
    <div role="dialog" aria-label={title} className="home-shelf__sheet" style={style}>
      <div className="home-shelf__sheet-card redpen-card">
        <div className="redpen-card__head">
          <div style={{ fontFamily: diaryFont("hand").family }} className="home-shelf__sheet-title">
            {title}
          </div>
          <span className="redpen-card__badge" style={{ fontFamily: redFamily }}>
            {t("redpen.badge")}
          </span>
        </div>
        <div ref={paper} className="redpen-paper" aria-live="polite">
          {sentences.length === 0 && !editing && (
            <p className="redpen-paper__hint">{t("redpen.hint")}</p>
          )}
          {sentences.map((s, i) =>
            !s.trim() ? null : (
              <RedPenSentence
                key={`${i}:${s}`}
                sentence={s}
                result={results[redPenKey(target, s)]}
                family={family}
                redFamily={redFamily}
                editing={editing?.index === i}
                onEdit={() => startEdit(i)}
                onRetry={() => {
                  const key = redPenKey(target, s);
                  setResults((r) => ({ ...r, [key]: "pending" }));
                  queue.current.push({
                    key,
                    sentence: s.trim(),
                    before: sentences.slice(Math.max(0, i - 3), i),
                  });
                  pump();
                }}
              />
            ),
          )}
        </div>
        {editing && (
          <div className="redpen-editing">
            <span>{t("redpen.editing")}</span>
            <button
              type="button"
              className="redpen-editing__btn"
              onClick={() => {
                setSentences((list) => commitEdit(list, input, editing.index));
                setInput(editing.draft);
                setEditing(null);
              }}
            >
              {t("redpen.editDone")}
            </button>
          </div>
        )}
        <textarea
          ref={field}
          autoFocus
          value={input}
          placeholder={sentences.length ? t("redpen.next") : t("redpen.placeholder")}
          onChange={(e) => {
            const v = e.target.value;
            if (composing.current || (e.nativeEvent as InputEvent).isComposing) setInput(v);
            else settle(v);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            settle((e.target as HTMLTextAreaElement).value);
          }}
          onKeyDown={onKeyDown}
          rows={2}
          className="home-shelf__textarea redpen-input"
          style={{ fontFamily: inputFontFamily }}
        />
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="home-shelf__btn flex-1">
            {t("shelf.home.cancel")}
          </button>
          <button
            type="button"
            onClick={finish}
            className="home-shelf__btn home-shelf__write flex-[2]"
          >
            {t("shelf.home.writeOnPage")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RedPenSentence({
  sentence,
  result,
  family,
  redFamily,
  editing,
  onEdit,
  onRetry,
}: {
  sentence: string;
  result: Result | undefined;
  family: string;
  redFamily: string;
  editing: boolean;
  onEdit: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  const line = result && typeof result === "object" ? result : null;
  const segments = markSegments(sentence.replace(/\n+$/, ""), line?.marks ?? []);
  const red = line && needsRedInk(line);
  return (
    <div className="redpen-line" data-editing={editing || undefined} data-verdict={line?.verdict}>
      <button
        type="button"
        className="redpen-line__mine"
        style={{ fontFamily: family }}
        onClick={onEdit}
        aria-label={`${sentence.trim()} — ${t("redpen.tapToEdit")}`}
      >
        {segments.map((seg, i) =>
          seg.mark ? (
            <span key={i} className="redpen-wrong">
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
        {line?.verdict === "good" && <Hanamaru />}
        {result === "pending" && (
          <span className="redpen-pending" role="status" aria-label={t("redpen.checking")} />
        )}
      </button>
      {result === "error" && (
        <button type="button" className="redpen-line__retry" onClick={onRetry}>
          {t("redpen.retry")}
        </button>
      )}
      {line && (red || line.note) && (
        <div className="redpen-line__red" style={{ fontFamily: redFamily }}>
          {red && (
            <p className="redpen-line__fixed">
              <span className="redpen-line__stamp">{t(`redpen.verdict.${line.verdict}`)}</span>
              {line.corrected}
            </p>
          )}
          {red &&
            line.marks.map((m, i) => (
              <p key={i} className="redpen-line__why">
                <span className="redpen-line__from">{m.wrong}</span> → {m.right}
                {m.why ? `：${m.why}` : ""}
              </p>
            ))}
          {line.note && <p className="redpen-line__note">{line.note}</p>}
        </div>
      )}
    </div>
  );
}

/** 花丸（直す所が無い文に付ける赤の丸）。 */
function Hanamaru() {
  const t = useT();
  return (
    <svg
      className="redpen-hanamaru"
      viewBox="0 0 40 40"
      role="img"
      aria-label={t("redpen.good")}
      focusable="false"
    >
      <path
        d="M20 5c9 0 15 6 15 14s-7 15-15 15S5 28 5 19 11 4 21 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M20 12c5 0 8 3 8 7s-3 8-8 8-8-3-8-7 3-8 9-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type RedPenSummaryState =
  | { status: "loading" }
  | { status: "ready"; summary: RedPenSummary }
  | { status: "error"; message: string };

const KIND_ORDER: RedPenLearnKind[] = ["pattern", "chunk", "word", "grammar"];

/**
 * **書き終わった後の赤ペンのまとめ**（③模範解答 ②言いたいことに合う単語・チャンク・型・文法）。
 * 上から: 言いたかったこと → 直した日記 → 模範解答（訳つき）→ 今日覚える物（種類ごと）。
 */
export function RedPenSummarySheet({
  state,
  font,
  onClose,
  onRetry,
  style,
}: {
  state: RedPenSummaryState;
  font: DiaryFontId;
  onClose: () => void;
  onRetry: () => void;
  style?: React.CSSProperties;
}) {
  const t = useT();
  const family = diaryFont(font).family;
  const redFamily = diaryFont("hand").family;
  return (
    <div
      role="dialog"
      aria-label={t("redpen.summaryTitle")}
      className="home-shelf__sheet"
      style={style}
    >
      <div className="home-shelf__sheet-card redpen-card redpen-summary">
        <div className="redpen-card__head">
          <div style={{ fontFamily: redFamily }} className="home-shelf__sheet-title redpen-red">
            {t("redpen.summaryTitle")}
          </div>
        </div>
        <div className="redpen-summary__body">
          {state.status === "loading" && (
            <p className="redpen-summary__wait" role="status">
              <span className="redpen-pending" aria-hidden />
              {t("redpen.summaryLoading")}
            </p>
          )}
          {state.status === "error" && (
            <div className="redpen-summary__wait" role="alert">
              <p>{state.message || t("redpen.summaryFailed")}</p>
              <button type="button" className="redpen-editing__btn" onClick={onRetry}>
                {t("redpen.retry")}
              </button>
            </div>
          )}
          {state.status === "ready" && (
            <>
              {state.summary.intent && (
                <section className="redpen-summary__sec">
                  <h3>{t("redpen.intent")}</h3>
                  <p>{state.summary.intent}</p>
                </section>
              )}
              {state.summary.correction && (
                <section className="redpen-summary__sec">
                  <h3>{t("redpen.corrected")}</h3>
                  <p
                    className="redpen-red redpen-summary__target"
                    style={{ fontFamily: redFamily }}
                  >
                    {state.summary.correction}
                  </p>
                </section>
              )}
              <section className="redpen-summary__sec">
                <h3>{t("redpen.model")}</h3>
                <p className="redpen-summary__target" style={{ fontFamily: family }}>
                  {state.summary.model_answer}
                </p>
                {state.summary.model_answer_translation && (
                  <p className="redpen-summary__sub">{state.summary.model_answer_translation}</p>
                )}
              </section>
              <section className="redpen-summary__sec">
                <h3>{t("redpen.learn")}</h3>
                {KIND_ORDER.map((kind) => {
                  const items = state.summary.learn.filter((l) => l.kind === kind);
                  if (!items.length) return null;
                  return (
                    <div key={kind} className="redpen-learn">
                      <span className="redpen-learn__kind">{t(`redpen.kind.${kind}`)}</span>
                      <ul>
                        {items.map((l, i) => (
                          <li key={i} className="redpen-learn__item">
                            <p className="redpen-learn__text">
                              {l.text}
                              {l.reading && (
                                <span className="redpen-learn__reading">{l.reading}</span>
                              )}
                            </p>
                            {l.meaning && <p className="redpen-learn__meaning">{l.meaning}</p>}
                            {l.note && <p className="redpen-learn__note">{l.note}</p>}
                            {l.example && <p className="redpen-learn__example">{l.example}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </div>
        <button type="button" onClick={onClose} className="home-shelf__btn home-shelf__write">
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
