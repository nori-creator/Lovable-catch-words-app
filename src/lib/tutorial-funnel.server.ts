import { createHmac } from "node:crypto";
import {
  BUDGET_KEEP_DAYS,
  pruneBudgetRows,
  reserveBudgetSlot,
  shouldPruneAfter,
  type BudgetDb,
} from "./budget-slots";
import {
  FUNNEL_RATE_ROOT,
  FUNNEL_ROOT,
  FUNNEL_SESSION_ID,
  funnelKey,
  isTutorialStep,
  type TutorialStep,
} from "./funnel-events";
import { taipeiDay } from "./taipei-day";

/**
 * **登録前のチュートリアルの段を、人を特定せずに数える**（ベータの計測、2026-10-03）。
 *
 * 登録前の人には user_id が無いので `usage_events` に書けない。最初のキャッチの枠
 * （`first-catch-guest.server.ts`）と同じく、サーバしか書けない `app_config` に一意の鍵で
 * 1行ずつ入れる（表を足さない・マイグレーション不要）。
 *
 * - 鍵は `funnel:<台湾の日付>:<段>:<セッションの印>`。**同じセッションの同じ段は1回だけ**
 *   （一意の制約 23505 = もう数えてある）。
 * - 値は空（`{}`）。写真・語・メール・IP・利用者の番号は入れない。セッションの印は
 *   ブラウザのタブの乱数をサーバの鍵で混ぜた物で、元に戻せない。
 * - **送りすぎを止める**: 回線（IP の混ぜ値。日付も混ぜるので日をまたいで追えない）ごとに
 *   1日 `FUNNEL_IP_LIMIT_PER_DAY` 行、全体で1日 `FUNNEL_GLOBAL_LIMIT_PER_DAY` 行まで。
 *   枠の行は2日で消える。生の IP はどこにも残さない。
 * - **画面を止めない**: 数えられなくても投げない（結果を返すだけ）。
 */

/** 1つの回線から1日に数える行の上限（9段 × 約20回。学校や会場の Wi-Fi で並んで試しても足りる数）。 */
export const FUNNEL_IP_LIMIT_PER_DAY = 200;
/** 全体で1日に数える行の上限（9段 × 約330回）。それより多いのはベータでは送りすぎ。 */
export const FUNNEL_GLOBAL_LIMIT_PER_DAY = 3000;
/** 段の行を残す日数（ベータの 2〜4 週と D30 を見られる長さ）。 */
export const FUNNEL_KEEP_DAYS = 120;

export type FunnelResult =
  | { counted: true }
  | { counted: false; reason: "duplicate" | "rate" | "cap" | "invalid" | "unavailable" | "origin" };

/** サーバの鍵で混ぜる（元に戻せない・日付ごとに変わる値を作る）。 */
export function funnelHash(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

const RATE_ERRORS = { unavailable: "FUNNEL_UNAVAILABLE", limit: "FUNNEL_RATE" } as const;

/**
 * 1つの段を数える（書き込みの形だけを受ける — 試験で偽物を渡せるように）。
 * `ipHash` は回線ごとの混ぜ値（取れない環境では null = 全体の上限だけで止める）。
 */
export async function recordTutorialStepWith(
  db: BudgetDb,
  input: {
    step: string;
    sid: string;
    ipHash: string | null;
    secret: string;
    now?: Date;
    ipLimit?: number;
    globalLimit?: number;
  },
): Promise<FunnelResult> {
  if (!isTutorialStep(input.step) || !FUNNEL_SESSION_ID.test(input.sid))
    return { counted: false, reason: "invalid" };
  const step: TutorialStep = input.step;
  const now = input.now ?? new Date();
  const day = taipeiDay(now);
  try {
    if (input.ipHash) {
      const prefix = `${FUNNEL_RATE_ROOT}${day}:ip:${input.ipHash}:`;
      let slot: number;
      try {
        slot = await reserveBudgetSlot(
          db,
          prefix,
          input.ipLimit ?? FUNNEL_IP_LIMIT_PER_DAY,
          RATE_ERRORS,
        );
      } catch (e) {
        return {
          counted: false,
          reason: e instanceof Error && e.message === RATE_ERRORS.limit ? "rate" : "unavailable",
        };
      }
      // 古い行の掃除（枠は2日、段の行は FUNNEL_KEEP_DAYS 日）。毎回は消さない。
      if (shouldPruneAfter(slot)) {
        await pruneBudgetRows(db, FUNNEL_RATE_ROOT, now, BUDGET_KEEP_DAYS);
        await pruneBudgetRows(db, FUNNEL_ROOT, now, FUNNEL_KEEP_DAYS);
      }
    }
    const today = await db
      .from("app_config")
      .select("key", { count: "exact", head: true })
      .like("key", `${FUNNEL_ROOT}${day}:%`);
    if (today.error || today.count == null) return { counted: false, reason: "unavailable" };
    if (today.count >= (input.globalLimit ?? FUNNEL_GLOBAL_LIMIT_PER_DAY))
      return { counted: false, reason: "cap" };
    const sid = funnelHash(input.secret, `sid:${input.sid}`);
    const result = await db
      .from("app_config")
      .insert({ key: funnelKey(day, step, sid), value: {} });
    if (!result.error) return { counted: true };
    return { counted: false, reason: result.error.code === "23505" ? "duplicate" : "unavailable" };
  } catch {
    return { counted: false, reason: "unavailable" };
  }
}

/** 公開の受け口から呼ぶ（同じ場所からの呼び出しだけ・サーバの鍵がある時だけ）。 */
export async function executeTutorialStep(
  data: { step: string; sid: string },
  request: Request,
): Promise<FunnelResult> {
  const { guestClientIp, guestIpBucket, isSameOriginRequest } =
    await import("./first-catch-guest.server");
  if (!isSameOriginRequest(request)) return { counted: false, reason: "origin" };
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return { counted: false, reason: "unavailable" };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = guestClientIp(request.headers);
    const day = taipeiDay();
    const ipHash = ip ? funnelHash(secret, `ip:${day}:${guestIpBucket(ip)}`) : null;
    const result = await recordTutorialStepWith(supabaseAdmin as unknown as BudgetDb, {
      ...data,
      ipHash,
      secret,
    });
    if (!result.counted && result.reason !== "duplicate")
      console.warn("[funnel] step not counted:", result.reason);
    return result;
  } catch {
    return { counted: false, reason: "unavailable" };
  }
}
