/**
 * もう採点済みの札か（2026-10-01「同じ答えが2回届くと進捗が2回進む」）。
 *
 * 復習に出す札は期限が来た物だけ（`getDueReviews` の `due_at <= 今`）。採点すると期限が
 * 先へ動くので、期限がまだ先の札への採点は「もう採点済み」— 通信のやり直し・二重送信・
 * 別の端末で先に済ませた札。期限の無い札は採点できる。数秒の時計のずれで、いま期限が
 * 来た札を弾かないよう1分の余裕を見る。
 */
export function isAlreadyGraded(dueAt: string | null | undefined, nowMs: number): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  return Number.isFinite(due) && due > nowMs + 60_000;
}
