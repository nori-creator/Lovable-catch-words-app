import { askJev, jevAvailable } from "./jev.server";
import { acceptCategory, categoryQuestion, recallQuestion, type RecallState } from "./jev-tasks";

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
    const res = await askJev(q.state, q.questions, { timeoutMs: 4000 });
    const a = res?.answers.recall;
    if (!res || !a || a.type !== "noul") return;
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
