/**
 * **日記の赤ペン**（オーナー指示 2026-10-01）。
 *
 * > ①添削を進研ゼミの赤ペン先生みたいに自分の回答の近くの空白に赤で正しい、自然な回答を
 * >  書き足す。②書きたいこと・気持ちを読み取ってレベルに合わせたネイティブの単語・
 * >  チャンク・文法を解説。③言いたいことをもとに模範解答。
 * > 書き終わったあとに全部添削されても、解答を読んで満足して覚えられない。タイプしている
 * > ときに1文ずつ添削し、書き終わったあとに新しく覚えた型・フレーズ・文法・単語をまとめる。
 *
 * ここは画面にも server にも依らない部品だけを置く（文の切り方・赤を入れる位置・端末の控え）。
 * AI を呼ぶ所は `diary-redpen.functions.ts`、描く所は `components/DiaryRedPen.tsx`。
 */

/** 赤ペンの判定。 */
export type RedPenVerdict =
  /** 文法も語も自然。花丸だけ付ける。 */
  | "good"
  /** 文法・語の誤りがある。 */
  | "fix"
  /** 誤りではないが、ネイティブはこう言う。 */
  | "better"
  /** 学ぶ言語で書かれていない（母語で書いた）。言いたいことを学ぶ言語にする。 */
  | "say";

/** 直した所。`wrong` は学習者の文から一字一句そのまま抜き出した部分。 */
export type RedPenMark = { wrong: string; right: string; why: string };

/** 1文ぶんの赤ペン。 */
export type RedPenLine = {
  verdict: RedPenVerdict;
  /** 学習者の言いたいことを、意図を変えずに自然にした1文（`good` なら元の文）。 */
  corrected: string;
  marks: RedPenMark[];
  /** 赤ペンの一言（表示言語）。 */
  note: string;
};

/** 書き終わった後のまとめで覚える物の種類。 */
export type RedPenLearnKind = "word" | "chunk" | "pattern" | "grammar";

export type RedPenLearnItem = {
  kind: RedPenLearnKind;
  /** 学ぶ言語の語・型。 */
  text: string;
  /** 読み（注音・拼音・発音記号）。無ければ空。 */
  reading: string;
  /** 意味（表示言語）。 */
  meaning: string;
  /** いつ・どう使うか、日記のどの文に関係するか（表示言語）。 */
  note: string;
  /** 使い方の一文（学ぶ言語）。無ければ空。 */
  example: string;
};

/** 書き終わった後のまとめ。 */
export type RedPenSummary = {
  /** その日記で一番伝えたかったこと・気持ち（表示言語）。 */
  intent: string;
  /** 本人の文を、意図を変えずに最小限だけ直した全文（学ぶ言語）。 */
  correction: string;
  /** 言いたいことをもとに、目標レベルで書いたネイティブの模範解答（学ぶ言語）。 */
  model_answer: string;
  /** 模範解答の訳（表示言語）。 */
  model_answer_translation: string;
  learn: RedPenLearnItem[];
};

/** 和文・中文の文末（打った瞬間に1文とみなす）。 */
const CJK_END = /[。！？!?…]/u;
/** 欧文の文末（次に空白を打った時に1文とみなす — `3.5` や `Mr.` で切らない）。 */
const LATIN_END = /[.!?]/;

/**
 * 打っている欄の文字から、**書き終わった文**を切り出す。
 *
 * - 和文・中文の文末（。！？）は打った時点で1文
 * - 欧文の文末（. ! ?）は次の空白を打った時点で1文（空白は前の文に付ける）
 * - 改行も文の切れ目（改行は前の文に付ける — つなぎ直すと元の文に戻る）
 *
 * 返す `done` を `join("")` して `rest` を足すと、必ず元の文字列に戻る。
 */
export function takeFinishedSentences(input: string): { done: string[]; rest: string } {
  const done: string[] = [];
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    let end = -1;
    if (ch === "\n") end = i + 1;
    else if (CJK_END.test(ch)) {
      end = i + 1;
      // 続けて打った文末記号・閉じかっこは同じ文に入れる（「好吃！！」「…。」」）。
      while (end < input.length && /[。！？!?…」』）)"'”’]/u.test(input[end])) end++;
      // 文末のすぐ後の改行も同じ文に入れる（段落の終わり）。
      if (input[end] === "\n") end++;
    } else if (LATIN_END.test(ch) && /\s/.test(input[i + 1] ?? "")) {
      end = i + 1;
      while (end < input.length && /[ \t]/.test(input[end])) end++;
      if (input[end] === "\n") end++;
    }
    if (end > 0) {
      const piece = input.slice(start, end);
      if (piece.trim()) done.push(piece);
      else if (done.length) done[done.length - 1] += piece;
      else done.push(piece);
      start = end;
      i = end - 1;
    }
  }
  return { done, rest: input.slice(start) };
}

/** 書き直す時、保存してある日記を文の並びに戻す（最後の書きかけも1文に数える）。 */
export function splitDiary(text: string): string[] {
  const { done, rest } = takeFinishedSentences(text);
  return rest.trim() ? [...done, rest] : done;
}

/**
 * 学習者の文の中で、赤の波線を引く所を返す。`wrong` が文に見つからない印は飛ばす
 * （AI が言い換えて返した時に、違う所へ線を引かない）。重なる印は先の物を採る。
 */
export function markSegments(
  sentence: string,
  marks: ReadonlyArray<RedPenMark>,
): Array<{ text: string; mark: RedPenMark | null }> {
  const spans: Array<{ from: number; to: number; mark: RedPenMark }> = [];
  for (const m of marks) {
    const w = (m.wrong ?? "").trim();
    if (!w) continue;
    let from = sentence.indexOf(w);
    while (from >= 0 && spans.some((s) => from < s.to && from + w.length > s.from)) {
      from = sentence.indexOf(w, from + 1);
    }
    if (from < 0) continue;
    spans.push({ from, to: from + w.length, mark: m });
  }
  spans.sort((a, b) => a.from - b.from);
  const out: Array<{ text: string; mark: RedPenMark | null }> = [];
  let at = 0;
  for (const s of spans) {
    if (s.from > at) out.push({ text: sentence.slice(at, s.from), mark: null });
    out.push({ text: sentence.slice(s.from, s.to), mark: s.mark });
    at = s.to;
  }
  if (at < sentence.length) out.push({ text: sentence.slice(at), mark: null });
  return out;
}

/** 赤を入れる必要があるか（`good` は花丸だけ）。 */
export function needsRedInk(line: RedPenLine): boolean {
  return line.verdict !== "good" && !!line.corrected.trim();
}

/** 同じ文をもう一度 AI に見せないための鍵。 */
export function redPenKey(target: string, sentence: string): string {
  return `${target}|${sentence.trim()}`;
}

const STORE = "red-pen-v1";
const MAX = 300;

/** 端末に覚えた赤ペン。書き直しで同じ文をもう一度打っても、通信を待たずに出す。 */
export function readRedPen(key: string): RedPenLine | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(STORE);
    const list = raw ? (JSON.parse(raw) as Array<{ k: string; v: RedPenLine }>) : [];
    return Array.isArray(list) ? list.find((e) => e.k === key)?.v : undefined;
  } catch {
    return undefined;
  }
}

export function writeRedPen(key: string, value: RedPenLine): void {
  try {
    const raw = globalThis.localStorage?.getItem(STORE);
    const list = raw ? (JSON.parse(raw) as Array<{ k: string; v: RedPenLine }>) : [];
    const rest = (Array.isArray(list) ? list : []).filter((e) => e.k !== key);
    globalThis.localStorage?.setItem(
      STORE,
      JSON.stringify([{ k: key, v: value }, ...rest].slice(0, MAX)),
    );
  } catch {
    // 書けない端末でも、赤ペンはその場の通信の結果で出る。
  }
}

/** 残した行をまとめの形に戻す。模範解答が無い行（赤ペン以前の日記）は「まだ無い」。 */
export function toSummary(row: unknown): RedPenSummary | null {
  const r = (row ?? null) as {
    correction?: string | null;
    feedback_ja?: string | null;
    body_zh?: string | null;
    body_ja?: string | null;
    native_phrases?: unknown;
  } | null;
  if (!r || !(r.body_zh ?? "").trim()) return null;
  const kinds = new Set(["word", "chunk", "pattern", "grammar"]);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const learn = (Array.isArray(r.native_phrases) ? r.native_phrases : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      kind: (kinds.has(str(p.kind)) ? str(p.kind) : "chunk") as RedPenLearnKind,
      text: str(p.zh),
      reading: str(p.reading),
      meaning: str(p.ja),
      note: str(p.note),
      example: str(p.example),
    }))
    .filter((l) => l.text);
  return {
    intent: (r.feedback_ja ?? "").trim(),
    correction: (r.correction ?? "").trim(),
    model_answer: (r.body_zh ?? "").trim(),
    model_answer_translation: (r.body_ja ?? "").trim(),
    learn,
  };
}
