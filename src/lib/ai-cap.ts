import {
  pruneBudgetRows,
  reserveBudgetSlot,
  shouldPruneAfter,
  type BudgetDb,
} from "./budget-slots";
import { taipeiDay } from "./taipei-day";

/**
 * **AI の費用の蓋**（Phase B-2 の乱用よけ + 監査 2026-10-03）。
 *
 * これは課金の壁ではない（constitution: スキャンに課金壁を置かない）。人の使い方では
 * まず届かない数に置き、暴走したループや機械的な乱用で AI の予算が溶けるのを止める。
 *
 * ## 3つの蓋
 * 1. **その人の 24 時間の上限**（種類ごと、`DAILY_CAPS`）。数えるのは `usage_events`。
 * 2. **全員を合わせた 1 日の上限**（`AI_GLOBAL_DAILY_CAP`、既定 5,000 回、台湾の日付で
 *    区切る）。`app_config` の一意の鍵で数える（`budget-slots.ts`）— 利用者が自分で
 *    行を足せる `usage_events` で数えると、1人が行を足すだけで全員を止められるため。
 *    発音（`tts`）は数えない（AI の文章生成ではなく、貯めた音の再利用が多いため）。
 * 3. **数えられないときは断る**（前は通していた）。有料にする以上、数えられない間に
 *    費用が青天井になる方が困る。
 *
 * ## 呼ぶ前に1回ぶんを確保する
 * 前は「数える → AI を呼ぶ（数秒〜数十秒）→ 記録する」だったので、同時に何本も
 * 送ると全部が数える段を通り抜けて上限を超えられた。最初のキャッチの会員の道
 * （`first-catch-ai.server.ts`）と同じく、**呼ぶ前に `usage_events` に1行入れる**。
 * 失敗した呼び出しも1回に数える（呼んだ分は費用がかかる）。呼ぶ側は成功の後に
 * 同じ種類をもう一度記録しない。
 *
 * ## 失敗の文
 * 画面の言語で出せるよう、文の頭に印（`AI_DAILY_CAP` など）を付ける
 * （`errors.ts` の `KNOWN_CODES`）。iOS の道（`native-fn.ts`）は日本語の文でも
 * 見分けるので、日本語の文も残す。
 */

/** その人の 24 時間の上限（種類ごと）。 */
export const DAILY_CAPS: Readonly<Record<string, number>> = {
  scan_detect: 300,
  scan_parts: 300,
  tts: 500,
  correction: 100,
  journal_prompt: 60,
  card: 200,
  wordbook: 60, // 1枚の写真で最大60語。取り込みは1日に何度もやる物ではない
  phrase_card: 100,
  suggest: 300,
  removebg: 100, // paid per image — tighter than the free-tier guards
  native_text: 200, // iOS 版の添削・例文など（/api/native-ai の text）
  // 読む人の言語の意味だけを埋める（`fillReaderMeanings`。1回で最大24語、辞書に無い語だけ）。
  reader_meaning: 100,
};

/** 全員を合わせた 1 日の上限の既定。 */
export const DEFAULT_GLOBAL_AI_DAILY_CAP = 5_000;

/** 全体の上限に数えない種類。 */
export const GLOBAL_CAP_EXEMPT_KINDS: ReadonlySet<string> = new Set(["tts"]);

/** 全体の上限の枠の鍵の頭（`<頭><台湾の日付>:<番号>`）。 */
export const GLOBAL_AI_BUDGET_ROOT = "ai-global-budget:";

/** 失敗の印（`errors.ts` の `KNOWN_CODES` が画面の言語の文に直す）。 */
export const AI_CAP_CODES = {
  daily: "AI_DAILY_CAP",
  global: "AI_GLOBAL_CAP",
  unavailable: "AI_USAGE_CHECK_FAILED",
} as const;

export function dailyCapMessage(limit: number): string {
  return `${AI_CAP_CODES.daily} 1日の利用上限(${limit}回)に達しました。24時間以内に自動で回復します。通常の学習でここに届くことはないため、心当たりがない場合はお問い合わせください。`;
}

export const GLOBAL_CAP_MESSAGE = `${AI_CAP_CODES.global} 本日のAIの利用が上限に達しました。時間をおいてもう一度お試しください。`;

export const USAGE_CHECK_FAILED_MESSAGE = `${AI_CAP_CODES.unavailable} 利用回数を確認できませんでした。少し待ってからもう一度お試しください。`;

/** `AI_GLOBAL_DAILY_CAP` を読む。正の整数でなければ既定。 */
export function globalAiDailyCap(raw: string | undefined | null): number {
  const n = Number((raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_GLOBAL_AI_DAILY_CAP;
}

/** 蓋が外の世界に触る所（試験で偽物を渡す）。 */
export type AiCapDeps = {
  /** その人のその種類の、`sinceIso` より後の回数。数えられなければ投げる。 */
  countUserKindSince: (userId: string, kind: string, sinceIso: string) => Promise<number>;
  /** 1回ぶんを記録する（確保）。書けなければ投げる。 */
  insertUsage: (userId: string, kind: string) => Promise<void>;
  /** 全体の枠を書く表（管理者の鍵）。 */
  budgetDb: BudgetDb;
  /** 全体の上限。 */
  globalLimit: number;
  now?: () => Date;
  warn?: (message: string, data?: Record<string, unknown>) => void;
};

let lastGlobalCapLog = 0;

/**
 * 上限の内側か確かめ、**1回ぶんを確保する**。上限・数えられないときは投げる。
 * 上限の無い種類は何もしない。
 */
export async function reserveAiCall(deps: AiCapDeps, userId: string, kind: string): Promise<void> {
  const limit = DAILY_CAPS[kind];
  if (!limit) return;
  const now = deps.now?.() ?? new Date();
  const warn = deps.warn ?? ((m, d) => console.warn(m, d));

  let count: number;
  try {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    count = await deps.countUserKindSince(userId, kind, since);
  } catch (e) {
    // **閉じる側に倒す。** 数えられなかったことはサーバの記録に残す。
    warn("[usage] cap check failed", { kind, message: (e as Error)?.message ?? String(e) });
    throw new Error(USAGE_CHECK_FAILED_MESSAGE);
  }
  if (count >= limit) throw new Error(dailyCapMessage(limit));

  if (!GLOBAL_CAP_EXEMPT_KINDS.has(kind)) {
    let slot: number;
    try {
      slot = await reserveBudgetSlot(
        deps.budgetDb,
        `${GLOBAL_AI_BUDGET_ROOT}${taipeiDay(now)}:`,
        deps.globalLimit,
        { unavailable: USAGE_CHECK_FAILED_MESSAGE, limit: GLOBAL_CAP_MESSAGE },
      );
    } catch (e) {
      if (e instanceof Error && e.message === GLOBAL_CAP_MESSAGE) {
        // 上限に届いたことを残す（同じ実体からは1分に1回）。
        if (now.getTime() - lastGlobalCapLog > 60_000) {
          lastGlobalCapLog = now.getTime();
          console.error("[usage] global AI daily ceiling reached", {
            limit: deps.globalLimit,
            day: taipeiDay(now),
            kind,
          });
        }
      } else {
        warn("[usage] global budget check failed", { kind });
      }
      throw e;
    }
    if (shouldPruneAfter(slot)) await pruneBudgetRows(deps.budgetDb, GLOBAL_AI_BUDGET_ROOT, now);
  }

  try {
    await deps.insertUsage(userId, kind);
  } catch (e) {
    warn("[usage] reservation failed", { kind, message: (e as Error)?.message ?? String(e) });
    throw new Error(USAGE_CHECK_FAILED_MESSAGE);
  }
}

/** 試験用。 */
export function resetAiCapLogForTest(): void {
  lastGlobalCapLog = 0;
}
