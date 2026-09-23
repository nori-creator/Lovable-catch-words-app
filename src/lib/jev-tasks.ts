import { choice, noul, score, type JevAnswer, type JevEntry, type JevQuestion } from "./jev";

/**
 * Jev に聞く問いの**中身**と、答えの読み方。通信は `jev-tasks.server.ts`。
 *
 * どれも「落ちたら従来の処理」。Jev の答えが無い・自信が低いときは
 * 何も変えない（`null` を返す）。
 */

// --- 1) スキャンの候補: どれをいちばん調べたいか ----------------------------

export type CandidateInput = {
  headword: string;
  meaning?: string | null;
  kind?: "object" | "text" | string;
  /** 検出の確かさ 0〜1。 */
  confidence?: number;
  /** もう図鑑に在るか。 */
  owned?: boolean;
};

/**
 * 候補ごとの名前は `c0`, `c1`… にする。語そのものを選択肢の名前にすると、
 * 同じ語が2つ来たときや記号を含む語で名前が壊れる。
 */
export function candidateQuestion(items: CandidateInput[]): {
  state: JevEntry;
  questions: Record<string, JevQuestion>;
} {
  const criteria: Record<string, JevEntry> = {};
  items.forEach((it, i) => {
    criteria[`c${i}`] = `${it.headword}${it.meaning ? `（${it.meaning}）` : ""}`;
  });
  return {
    state: {
      task: "A language learner pointed their camera at a scene and these words were detected.",
      candidates: items.map((it) => ({
        word: it.headword,
        meaning: it.meaning ?? null,
        kind: it.kind ?? null,
        detection_confidence: typeof it.confidence === "number" ? it.confidence : null,
        already_in_collection: Boolean(it.owned),
      })),
    },
    questions: {
      wanted: choice(
        "Which one word is this learner most likely trying to look up right now? Prefer the main subject of the photo and words they do not own yet.",
        criteria,
      ),
    },
  };
}

/**
 * 候補を「調べたい見込み」の高い順に並べ替える。**答えが無い・自信が低い
 * ときは元の順のまま**（`null`）。元の順は検出の順で、それも意味を持つ。
 */
export function rankByWanted<T>(
  items: T[],
  answer: JevAnswer | undefined,
  minConfidence = 0.35,
): { order: number[]; probs: number[] } | null {
  if (!answer || answer.type !== "choice") return null;
  if (answer.confidence < minConfidence) return null;
  const probs = items.map((_, i) => answer.probabilities[`c${i}`] ?? 0);
  if (probs.every((p) => p === 0)) return null;
  const order = items.map((_, i) => i).sort((a, b) => probs[b] - probs[a] || a - b);
  return { order, probs };
}

// --- 2) カテゴリー: 生成が「その他」に逃げたときだけ -------------------------

export function categoryQuestion(
  word: { headword: string; meaning?: string | null; pos?: string | null },
  keys: readonly string[],
): { state: JevEntry; questions: Record<string, JevQuestion> } {
  const criteria: Record<string, JevEntry> = {};
  for (const k of keys) criteria[k] = null;
  return {
    state: { word: word.headword, meaning: word.meaning ?? null, part_of_speech: word.pos ?? null },
    questions: {
      category: choice(
        "Which collection shelf does this word belong on? Choose 'other' only if none fits.",
        criteria,
      ),
    },
  };
}

/** 「その他」から上げてよい答えか。自信が十分で、「その他」以外を選んだときだけ。 */
export function acceptCategory(answer: JevAnswer | undefined, minConfidence = 0.6): string | null {
  if (!answer || answer.type !== "choice") return null;
  if (answer.choice === "other" || answer.confidence < minConfidence) return null;
  return answer.choice;
}

// --- 3) 記憶: いま思い出せるか（**影の実行**・予定は動かさない） ------------

export type RecallState = {
  headword: string;
  meaning?: string | null;
  daysSinceLastReview: number | null;
  intervalDays: number;
  ease: number;
  /** SM-2 の連続正解数。 */
  repetitions: number;
  /** このアプリの式（`retentionNow`）が出している見込み 0〜1。比べる相手。 */
  baselineRecall: number;
};

export function recallQuestion(s: RecallState): {
  state: JevEntry;
  questions: Record<string, JevQuestion>;
} {
  return {
    state: {
      word: s.headword,
      meaning: s.meaning ?? null,
      days_since_last_review: s.daysSinceLastReview,
      current_interval_days: s.intervalDays,
      ease_factor: Math.round(s.ease * 100) / 100,
      consecutive_correct: s.repetitions,
    },
    questions: {
      recall: noul("Will the learner correctly recall this vocabulary word if tested right now?", {
        true: "recalls it correctly",
        false: "fails to recall it",
      }),
    },
  };
}

// --- 4) 辞書の日々の点検・報告の仕分け: 直してよいかの**第二の目** ------------

export type EntryFields = { zhuyin: string | null; pinyin: string | null; meaning: string | null };

/**
 * 共有の辞書の1行について、「いまの中身」と「直した案」のどちらが正しいかを
 * 聞く。点検の AI とは**別の目**（`QA.md`「利用者の報告による正本の修正は、
 * 全体へ広げる前に確かめる」）。
 */
export function entryFixQuestion(
  headword: string,
  current: EntryFields,
  proposed: EntryFields,
): { state: JevEntry; questions: Record<string, JevQuestion> } {
  return {
    state: {
      language: "Taiwan Mandarin (Traditional Chinese, Taiwan Ministry of Education standard)",
      word: headword,
      current: { zhuyin: current.zhuyin, pinyin: current.pinyin, meaning_ja: current.meaning },
      proposed: { zhuyin: proposed.zhuyin, pinyin: proposed.pinyin, meaning_ja: proposed.meaning },
    },
    questions: {
      which: choice(
        "Which dictionary entry is correct for this word in Taiwan Mandarin? Mainland-only pronunciations or meanings are not correct here.",
        { current: "the current entry", proposed: "the proposed fix", unsure: "cannot tell" },
      ),
    },
  };
}

export type EntryOpinion = { pProposed: number; pCurrent: number } | null;

export function entryOpinion(answer: JevAnswer | undefined): EntryOpinion {
  if (!answer || answer.type !== "choice") return null;
  return {
    pProposed: answer.probabilities.proposed ?? 0,
    pCurrent: answer.probabilities.current ?? 0,
  };
}

/**
 * **直す**のは、点検の AI が 0.85 以上で確信し、かつ Jev も直した案を
 * 6割以上で選んだときだけ。Jev が使えないときは従来どおり（AI の確信だけ）。
 * 二つの目がそろわない修正は、人間の確認へ回る。
 */
export function allowEntryFix(llmConfidence: number, jev: EntryOpinion): boolean {
  if (llmConfidence < 0.85) return false;
  return jev == null || jev.pProposed >= 0.6;
}

/** 報告を**却下**するのも同じ。Jev がいまの中身を6割以上で選んだときだけ。 */
export function allowDismiss(llmConfidence: number, jev: EntryOpinion): boolean {
  if (llmConfidence < 0.85) return false;
  return jev == null || jev.pCurrent >= 0.6;
}

// --- 5) 復習のタイミング（**影の実行**）--------------------------------------

/** 次の復習までの間隔の段（日）。記憶の問いと同じ呼び出しで聞く。 */
export const INTERVAL_BUCKETS = [1, 3, 7, 14, 30, 60] as const;

export function intervalQuestion(): JevQuestion {
  return score(
    "After this review, how many days until this learner should see the word again so that they are just about to forget it?",
    INTERVAL_BUCKETS.map((d) => `${d} days`),
  );
}

/** 段の期待値から日数へ（段の間は線形に）。 */
export function intervalDaysFrom(answer: JevAnswer | undefined): number | null {
  if (!answer || answer.type !== "score") return null;
  const x = Math.max(0, Math.min(INTERVAL_BUCKETS.length - 1, answer.score));
  const lo = Math.floor(x);
  const hi = Math.min(INTERVAL_BUCKETS.length - 1, lo + 1);
  return Math.round(
    INTERVAL_BUCKETS[lo] + (INTERVAL_BUCKETS[hi] - INTERVAL_BUCKETS[lo]) * (x - lo),
  );
}

// --- 6) 話す練習の判定（**影の実行**）・7) 例文の自然さ（**影の実行**）------

export function speakingQuestion(
  headword: string,
  utterance: string,
): { state: JevEntry; questions: Record<string, JevQuestion> } {
  return {
    state: { target_word: headword, learner_utterance: utterance },
    questions: {
      used: noul(
        "Did the learner use the target word correctly and naturally in Taiwan Mandarin?",
        { true: "correct and natural use", false: "missing, wrong, or unnatural" },
      ),
    },
  };
}

export function exampleQuestion(
  headword: string,
  sentence: string,
): { state: JevEntry; questions: Record<string, JevQuestion> } {
  return {
    state: { target_word: headword, example_sentence: sentence },
    questions: {
      natural: noul(
        "Would a native Taiwan Mandarin speaker naturally say this sentence in everyday life?",
        { true: "natural", false: "unnatural or textbook-like" },
      ),
    },
  };
}
