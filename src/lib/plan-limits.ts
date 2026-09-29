/**
 * **無料と Pro の境目**（オーナー決定 2026-09-28。`docs/monetization.md` §2）。
 *
 * > 「無料は1日3つまで。切り抜きはまだ実装してない。解説の作り直しはプロユーザーのみで、
 * > 無料ユーザーはエラーの報告だけ。（無料ユーザーがエラーの報告として解答を再生成する
 * > 裏技を避けたい）」
 *
 * - **切り抜き**: 無料は1日3枚（ごほうび広告を見ると、その日だけ1枚ずつ増える）。
 *   Pro は上限なし（ただし乱用よけの上限 `DAILY_CAPS.removebg` は全員に残る）。
 *   切り抜きの機能そのものはまだ本番で動いていない（`CUTOUT_ENABLED`）。動き出した日から
 *   この上限が効く（サーバ `cutout.functions.ts` が数える）。
 * - **解説の作り直し**: Pro だけ（サーバ `runSectionRegen` が拒む）。
 * - **誤りの報告**: 全員。ただし無料の人の報告は**記録するだけ**で、その場で AI に
 *   作り直させない（辞書と照らすだけの読み・品詞の直しは作り直しではないので全員）。
 *   報告は開発者の確認待ちに残り、確かめてから直す。
 */
export const FREE_CUTOUTS_PER_DAY = 3;
/** ごほうび広告1回で増える切り抜きの枚数と、1日に増やせる上限。 */
export const REWARDED_CUTOUT_BONUS = 1;
export const MAX_REWARDED_PER_DAY = 3;

export function cutoutAllowance(p: { isPro: boolean; usedToday: number; rewardedToday: number }): {
  allowed: boolean;
  remaining: number | null;
} {
  if (p.isPro) return { allowed: true, remaining: null };
  const bonus = Math.min(p.rewardedToday, MAX_REWARDED_PER_DAY) * REWARDED_CUTOUT_BONUS;
  const remaining = Math.max(0, FREE_CUTOUTS_PER_DAY + bonus - p.usedToday);
  return { allowed: remaining > 0, remaining };
}

/**
 * 誤りの報告を受けたとき、その場で AI に項目を作り直させてよいか。
 * 無料の人は記録だけ（作り直しの裏道にしない）。辞書で照らす読み・品詞は全員。
 */
export function reportMayRegenerate(p: {
  isPro: boolean;
  item: string;
}): "ai" | "dictionary" | "record_only" {
  if (p.item === "pronunciation" || p.item === "pos") return "dictionary";
  return p.isPro ? "ai" : "record_only";
}

/** 1日の区切り（端末の日付ではなく、サーバが使う「日本時間の0時」）。 */
export function startOfTokyoDay(now: Date): Date {
  const JST = 9 * 60 * 60 * 1000;
  const t = new Date(now.getTime() + JST);
  t.setUTCHours(0, 0, 0, 0);
  return new Date(t.getTime() - JST);
}
