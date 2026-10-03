import { createHmac, randomUUID } from "node:crypto";
import { FirstCatchAIInput } from "./first-catch-ai-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { FirstCatchRun } from "./first-catch-ai.server";

/** A narrowly scoped public trial, not an authenticated-user impersonation.
 * Atomic unique-key reservations reuse the existing server-writable app_config
 * table, so enabling Supabase anonymous accounts or a schema migration is not
 * required. Values contain no photos, words, IPs, tokens or user identifiers.
 * Global ceiling remains effective even if a proxy forwards an untrusted IP.
 */
export async function reserveGuestSlot(
  db: SupabaseClient<Database>,
  prefix: string,
  limit: number,
): Promise<string> {
  const count = await db
    .from("app_config")
    .select("key", { count: "exact", head: true })
    .like("key", `${prefix}%`);
  if (count.error || count.count == null) throw new Error("FIRST_CATCH_AI_UNAVAILABLE");
  for (let slot = count.count; slot < limit; slot++) {
    const key = `${prefix}${slot}`;
    const result = await db.from("app_config").insert({ key, value: {} });
    if (!result.error) return key;
    if (result.error.code !== "23505") throw new Error("FIRST_CATCH_AI_UNAVAILABLE");
  }
  throw new Error("FIRST_CATCH_LIMIT");
}
/**
 * 1回のチュートリアルで AI は最低3回(候補・カード・解説)、撮り直しや再試行で
 * もっと呼ぶ。12回/日では数回の体験(開発者の確認も同じ枠を使う)で尽きて、
 * 新規ユーザーが**原因の出ない失敗**になっていた。
 */
export const GUEST_IP_LIMIT_PER_DAY = 30;
export const GUEST_GLOBAL_LIMIT_PER_DAY = 1000;

/** 呼び出し元のアドレス。取れない環境では null(全員が1つの枠を共有しないため)。 */
export function guestClientIp(headers: Headers): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-nf-client-connection-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const value of candidates) {
    const ip = value?.trim();
    if (ip) return ip;
  }
  return null;
}

/** 同じ場所から出した呼び出しだけを通す。中継で URL の場所が変わる環境も許す。 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return !!host && (origin === `https://${host}` || origin === `http://${host}`);
}

export async function executeGuestFirstCatch(raw: unknown, request: Request) {
  const data = FirstCatchAIInput.parse(raw);
  const reserved: string[] = [];
  let db: SupabaseClient<Database> | null = null;
  try {
    if (!isSameOriginRequest(request)) throw new Error("FIRST_CATCH_ORIGIN");
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error("FIRST_CATCH_AI_UNAVAILABLE");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    db = supabaseAdmin;
    const day = new Date().toISOString().slice(0, 10);
    const ip = guestClientIp(request.headers);
    if (ip) {
      const hash = createHmac("sha256", secret).update(`${day}:${ip}`).digest("hex").slice(0, 32);
      reserved.push(
        await reserveGuestSlot(
          supabaseAdmin,
          `first-catch-budget:${day}:ip:${hash}:`,
          GUEST_IP_LIMIT_PER_DAY,
        ),
      );
    }
    reserved.push(
      await reserveGuestSlot(
        supabaseAdmin,
        `first-catch-budget:${day}:global:`,
        GUEST_GLOBAL_LIMIT_PER_DAY,
      ),
    );
  } catch (e) {
    // 原因は画面にコードで出す。ここにも残す(写真・単語・IPは含めない)。
    console.error("[first-catch] guest gate refused:", e instanceof Error ? e.message : "unknown");
    throw e;
  }
  const { runFirstCatchAI, failedRun } = await import("./first-catch-ai.server");
  try {
    const { value, run } = await runFirstCatchAI(data);
    if (db) await recordGuestRun(db, run);
    return value;
  } catch (e) {
    const run = failedRun(data.action, e);
    if (run && db) {
      // 返事を1つも受け取れなかった回は枠を返す（「もう一度試す」で2回分に数えない）。
      if (!run.chargeable) run.refunded = await releaseGuestSlots(db, reserved);
      await recordGuestRun(db, run);
    }
    throw e;
  }
}

/** 予約した枠を返す。返せなくても利用者は止めない（枠が1つ少なく数えられるだけ）。 */
export async function releaseGuestSlots(
  db: SupabaseClient<Database>,
  keys: string[],
): Promise<boolean> {
  if (!keys.length) return false;
  try {
    const result = await db.from("app_config").delete().in("key", keys);
    return !result.error;
  } catch {
    return false;
  }
}

/**
 * 未登録の人の結果を残す（`ai_runs` は本人の id が要るので使えない。予約と同じ app_config に、
 * 日付ごとの鍵で1行）。中身は機能・成否・待ち時間・試した AI の名前だけ — 写真・語・IP は無し。
 * 失敗率は `first-catch-run:<日付>:fail:%` と `…:ok:%` の行数で出る。
 */
async function recordGuestRun(db: SupabaseClient<Database>, run: FirstCatchRun) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const { runMeta } = await import("./first-catch-ai.server");
    const result = await db.from("app_config").insert({
      key: `first-catch-run:${day}:${run.ok ? "ok" : "fail"}:${randomUUID()}`,
      value: runMeta(run),
    });
    if (result.error) console.warn("[first-catch] guest run log failed:", result.error.message);
  } catch (e) {
    console.warn("[first-catch] guest run log failed:", e instanceof Error ? e.message : "");
  }
}
