import { askJev, jevAvailable } from "./jev.server";
import {
  acceptCategory,
  categoryQuestion,
  entryFixQuestion,
  entryOpinion,
  exampleQuestion,
  intervalDaysFrom,
  intervalQuestion,
  recallQuestion,
  speakingQuestion,
  type EntryFields,
  type EntryOpinion,
  type RecallState,
} from "./jev-tasks";

/**
 * Jev の問いを実際に投げる所。**どれも失敗を投げない**（従来の処理に戻る）。
 */

type Db = {
  // 生成済みの型より新しい表（20260923020000）なので、緩い形で受ける。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};

/**
 * 記憶の**影の実行**。予定（復習の日）は一切動かさない。
 *
 * 復習の答えを受けた後で、**答える前の状態だけ**を Jev に見せて「いま
 * 思い出せるか」を聞き、このアプリの式の見込み・実際の正誤と並べて記録する。
 * 後で両者の当たり方（較正）を比べ、良ければ予定に使うかを決める
 * （ROADMAP 6）。
 *
 * 鍵が無ければ何もしない（問い合わせも DB も触らない）。
 */
export async function recordRecallShadow(
  db: Db,
  args: { userId: string; stickerId: string; state: RecallState; outcome: boolean },
): Promise<void> {
  if (!jevAvailable()) return;
  try {
    let state = args.state;
    if (!state.headword) {
      // 語そのものの難しさも効くので、語を引いてから聞く（本人の札だけ）。
      const { data } = await db
        .from("stickers")
        .select("words(headword, meaning_ja)")
        .eq("id", args.stickerId)
        .eq("user_id", args.userId)
        .maybeSingle();
      const w = (data as { words?: { headword?: string; meaning_ja?: string } } | null)?.words;
      if (!w?.headword) return;
      state = { ...state, headword: w.headword, meaning: w.meaning_ja ?? null };
    }
    const q = recallQuestion(state);
    // 同じ呼び出しで「次はいつ見せるのがよいか」（復習のタイミング）も聞く。
    const res = await askJev(
      q.state,
      { ...q.questions, interval: intervalQuestion() },
      { timeoutMs: 4000 },
    );
    const a = res?.answers.recall;
    if (!res || !a || a.type !== "noul") return;
    const iv = res.answers.interval;
    const days = intervalDaysFrom(iv);
    if (days != null && iv && iv.type === "score") {
      await db.from("model_shadow_predictions").insert({
        user_id: args.userId,
        sticker_id: args.stickerId,
        task: "interval",
        model: res.model,
        // 間隔は確率ではないので、Jev の自信を入れ、日数は meta に置く。
        predicted: Math.max(0, Math.min(1, iv.confidence)),
        outcome: args.outcome,
        meta: { jev_days: days, srs_days_before: state.intervalDays },
      });
    }
    await db.from("model_shadow_predictions").insert({
      user_id: args.userId,
      sticker_id: args.stickerId,
      task: "recall",
      model: res.model,
      predicted: a.noul,
      baseline: state.baselineRecall,
      outcome: args.outcome,
      meta: {
        interval_days: state.intervalDays,
        repetitions: state.repetitions,
        days_since: state.daysSinceLastReview,
      },
    });
  } catch (e) {
    console.warn("[jev] recall shadow skipped:", (e as Error)?.message ?? e);
  }
}

/**
 * 生成が「その他」に逃げたときだけ、Jev に棚を聞く。自信が6割以上で
 * 「その他」以外なら、その棚を返す。そうでなければ `null`（「その他」のまま）。
 *
 * 語は利用者の間で共有されるので、**よく分かっている答えを上書きしない**。
 * 触るのは「その他」＝もともと分類に失敗している語だけ。
 */
export async function categoryFallback(
  word: { headword: string; meaning?: string | null; pos?: string | null },
  keys: readonly string[],
): Promise<string | null> {
  if (!jevAvailable()) return null;
  const q = categoryQuestion(word, keys);
  const res = await askJev(q.state, q.questions, { timeoutMs: 2500 });
  const picked = acceptCategory(res?.answers.category);
  return picked && keys.includes(picked) ? picked : null;
}

/**
 * 共有の辞書を直す前の**第二の目**（日々の点検・報告の仕分け）。
 * 鍵が無い・答えが無いときは `null`（呼ぶ側は従来の規則に戻る）。
 */
export async function entryJevOpinion(
  headword: string,
  current: EntryFields,
  proposed: EntryFields,
): Promise<EntryOpinion> {
  if (!jevAvailable()) return null;
  const q = entryFixQuestion(headword, current, proposed);
  const res = await askJev(q.state, q.questions, { timeoutMs: 4000 });
  return entryOpinion(res?.answers.which);
}

/** 影の記録を1行（失敗しても何もしない）。 */
async function logShadow(
  db: Db,
  row: {
    userId: string;
    stickerId?: string | null;
    task: string;
    model: string;
    predicted: number;
    outcome?: boolean | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.from("model_shadow_predictions").insert({
      user_id: row.userId,
      sticker_id: row.stickerId ?? null,
      task: row.task,
      model: row.model,
      predicted: Math.max(0, Math.min(1, row.predicted)),
      outcome: row.outcome ?? null,
      meta: row.meta ?? null,
    });
  } catch (e) {
    console.warn("[jev] shadow log skipped:", (e as Error)?.message ?? e);
  }
}

/**
 * 話す練習の**判定**（影）。添削の AI の判定と並べて記録し、両者の一致を
 * 後で見る。画面の判定は変えない。
 */
export async function recordSpeakingShadow(
  db: Db,
  args: { userId: string; headword: string; utterance: string; llmOk: boolean },
): Promise<void> {
  if (!jevAvailable() || !args.utterance.trim()) return;
  const q = speakingQuestion(args.headword, args.utterance);
  const res = await askJev(q.state, q.questions, { timeoutMs: 4000 });
  const a = res?.answers.used;
  if (!res || !a || a.type !== "noul") return;
  await logShadow(db, {
    userId: args.userId,
    task: "speaking_judge",
    model: res.model,
    predicted: a.noul,
    outcome: args.llmOk,
    meta: { headword: args.headword },
  });
}

/**
 * 生成した例文の**自然さ**（影）。いまは記録だけ。当たり方が確かめられたら、
 * 不自然と出た例文を作り直す判断に使う。
 */
export async function recordExampleShadow(
  db: Db,
  args: { userId: string; headword: string; sentence: string },
): Promise<void> {
  if (!jevAvailable() || !args.sentence.trim()) return;
  const q = exampleQuestion(args.headword, args.sentence);
  const res = await askJev(q.state, q.questions, { timeoutMs: 4000 });
  const a = res?.answers.natural;
  if (!res || !a || a.type !== "noul") return;
  await logShadow(db, {
    userId: args.userId,
    task: "example_natural",
    model: res.model,
    predicted: a.noul,
    meta: { headword: args.headword, sentence: args.sentence.slice(0, 120) },
  });
}
