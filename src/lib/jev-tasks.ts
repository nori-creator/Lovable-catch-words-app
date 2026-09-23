import { choice, noul, type JevAnswer, type JevEntry, type JevQuestion } from "./jev";

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
