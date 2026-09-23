/**
 * ホームが白紙の日（今日まだ1枚も無い日）に出す一言。
 *
 * （オーナー指示 2026-09-23「今日のページは白紙です。は ①今日も知らない単語を
 *  1つ覚えよう！ ②目の前にあるもの何て言う？ ③〇〇日連続で新しい単語に
 *  出会っています！ ④〇〇枚目の単語を記録してみよう！ みたいにユーザーの
 *  状態によって表示を自動的に変更する」）
 *
 * **作り話はしない。** 連続日数も枚数も、手元の記録から数えた数だけを書く。
 * 決め方（上から先に当てはまったもの）:
 *   1. まだ1枚も無い人        → ②「目の前にあるもの何て言う？」
 *   2. 昨日まで2日以上続いている → ③「N日連続で…」（途切れさせたくない気持ちに届く）
 *   3. 次が区切りの枚数（10枚ごと・最初の5枚目）→ ④「N枚目の単語を…」
 *   4. それ以外は日替わりで ① と ②（毎日同じ言葉だと読まれなくなる）
 */
export type BlankMessage =
  | { key: "home.blankLearnOne" }
  | { key: "home.blankWhatIsThat" }
  | { key: "home.blankStreak"; n: number }
  | { key: "home.blankNth"; n: number };

export function homeBlankMessage(input: {
  /** これまでに捕まえた語の数。 */
  total: number;
  /** 昨日から遡って、1枚以上撮った日が何日続いているか。 */
  streakDays: number;
  /** 日替わりに使う数（その日の通し番号など）。 */
  dayIndex: number;
}): BlankMessage {
  const total = Math.max(0, Math.floor(input.total));
  if (total === 0) return { key: "home.blankWhatIsThat" };
  if (input.streakDays >= 2) return { key: "home.blankStreak", n: input.streakDays };
  const next = total + 1;
  if (next === 5 || next % 10 === 0) return { key: "home.blankNth", n: next };
  return Math.abs(input.dayIndex) % 2 === 0
    ? { key: "home.blankLearnOne" }
    : { key: "home.blankWhatIsThat" };
}

/**
 * 昨日から遡って、撮った日が何日続いているか。`dayKeys` は撮った日の鍵
 * （`YYYY-MM-DD`、端末の時刻）。今日はまだ撮っていない前提なので昨日から数える。
 */
export function streakEndingYesterday(dayKeys: ReadonlySet<string>, today: Date): number {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  let n = 0;
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dayKeys.has(key)) return n;
    n += 1;
    d.setDate(d.getDate() - 1);
  }
}
