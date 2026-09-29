import { logAppEvent } from "@/lib/metrics.functions";
import { reportLovableError } from "@/lib/lovable-error-reporting";

/**
 * **撮った写真の保存に失敗したことを、開発者の記録に残す。**
 *
 * （オーナー報告 2026-09-30「手掌の画像を撮ってステッカーを剥がすアニメーションまで
 * やったのに、画像が保存されなかった。私の開発者の記録にものこってない」）
 * 以前は失敗しても端末の `console` に出すだけで、どこにも届いていなかった。
 *
 * 2か所に残す:
 * - **利用者ごとの画面**（`/admin/users` → その人 → 「保存の失敗」）の回数。
 *   既存の `usage_events` 表に1行足すだけ（新しい表は作らない）。
 * - Lovable のエラー記録（エラーの中身・どの段で落ちたか）。
 *
 * どちらも**失敗しても利用者の操作を止めない**（記録のための通信が落ちても黙って捨てる）。
 */
export type SaveFailureWhere = "catch" | "reencounter" | "first_transfer";

export function reportSaveFailure(
  where: SaveFailureWhere,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  try {
    reportLovableError(error, { boundary: "save_failure", where, ...context });
  } catch {
    // 記録のための処理で利用者を止めない
  }
  void logAppEvent({ data: { kind: `save_failed_${where}` } }).catch(() => {});
}
