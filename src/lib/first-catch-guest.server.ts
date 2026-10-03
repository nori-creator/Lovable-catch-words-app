import { createHmac } from "node:crypto";
import { FirstCatchAIInput } from "./first-catch-ai-schema";
import {
  pruneBudgetRows,
  reserveBudgetSlot,
  shouldPruneAfter,
  type BudgetDb,
} from "./budget-slots";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** A narrowly scoped public trial, not an authenticated-user impersonation.
 * Atomic unique-key reservations reuse the existing server-writable app_config
 * table, so enabling Supabase anonymous accounts or a schema migration is not
 * required. Values contain no photos, words, IPs, tokens or user identifiers.
 * Global ceiling remains effective even if a proxy forwards an untrusted IP.
 * Returns the reserved slot number (0 = the first of that prefix).
 */
export async function reserveGuestSlot(
  db: SupabaseClient<Database>,
  prefix: string,
  limit: number,
): Promise<number> {
  return reserveBudgetSlot(db as unknown as BudgetDb, prefix, limit, {
    unavailable: "FIRST_CATCH_AI_UNAVAILABLE",
    limit: "FIRST_CATCH_LIMIT",
  });
}

/** ゲストの枠の鍵の頭（日ごと・IP ごと・全体）。古い日の行はこの頭で消す。 */
export const GUEST_BUDGET_ROOT = "first-catch-budget:";
/**
 * 1回のチュートリアルで AI は最低3回(候補・カード・解説)、撮り直しや再試行で
 * もっと呼ぶ。12回/日では数回の体験(開発者の確認も同じ枠を使う)で尽きて、
 * 新規ユーザーが**原因の出ない失敗**になっていた。
 */
export const GUEST_IP_LIMIT_PER_DAY = 30;
export const GUEST_GLOBAL_LIMIT_PER_DAY = 1000;

/**
 * 枠を数える単位のアドレス（監査 2026-10-03）。
 *
 * **IPv6 は /64 でまとめる。** 1つの回線（家・携帯）には普通 /64 が丸ごと配られるので、
 * 1つずつ数えると、アドレスを変えるだけで 30 回/日の枠を何度でも取り直せる。
 * IPv4（`::ffff:1.2.3.4` の形も）はそのまま。読めない値はそのまま（小文字）で数える。
 */
export function guestIpBucket(ip: string): string {
  let v = ip.trim();
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (bracket) v = bracket[1];
  v = v.split("%")[0];
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(v)) return v.split(":")[0];
  if (!v.includes(":")) return v.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (mapped) return mapped[1];
  const groups = expandIpv6(v);
  if (!groups) return v.toLowerCase();
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** IPv6 を8つの16進の組に広げる（`::` と末尾の IPv4 表記も読む）。読めなければ null。 */
function expandIpv6(raw: string): string[] | null {
  let s = raw.toLowerCase();
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const b = v4.slice(1).map(Number);
    if (b.some((n) => n > 255)) return null;
    s =
      s.slice(0, s.length - v4[0].length) +
      `${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16).toString(16));
}

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

/**
 * 同じ場所から出した呼び出しだけを通す。中継で URL の場所が変わる環境も許す。
 *
 * **`Origin` が無い呼び出しは断る**（監査 2026-10-03）。ブラウザは POST に必ず
 * `Origin` を付ける（同じ場所からでも）。付いていないのは、ブラウザの外から直に
 * 叩いている呼び出し — ゲストの AI の枠をそこから使わせない。
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === new URL(request.url).origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return !!host && (origin === `https://${host}` || origin === `http://${host}`);
}

export async function executeGuestFirstCatch(raw: unknown, request: Request) {
  const data = FirstCatchAIInput.parse(raw);
  try {
    if (!isSameOriginRequest(request)) throw new Error("FIRST_CATCH_ORIGIN");
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error("FIRST_CATCH_AI_UNAVAILABLE");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const day = new Date().toISOString().slice(0, 10);
    const ip = guestClientIp(request.headers);
    if (ip) {
      const hash = createHmac("sha256", secret)
        .update(`${day}:${guestIpBucket(ip)}`)
        .digest("hex")
        .slice(0, 32);
      await reserveGuestSlot(
        supabaseAdmin,
        `${GUEST_BUDGET_ROOT}${day}:ip:${hash}:`,
        GUEST_IP_LIMIT_PER_DAY,
      );
    }
    const slot = await reserveGuestSlot(
      supabaseAdmin,
      `${GUEST_BUDGET_ROOT}${day}:global:`,
      GUEST_GLOBAL_LIMIT_PER_DAY,
    );
    // 古い日の枠の行を、ときどき消す（`app_config` が日ごとに増え続けないように）。
    if (shouldPruneAfter(slot)) {
      await pruneBudgetRows(supabaseAdmin as unknown as BudgetDb, GUEST_BUDGET_ROOT);
    }
  } catch (e) {
    // 原因は画面にコードで出す。ここにも残す(写真・単語・IPは含めない)。
    console.error("[first-catch] guest gate refused:", e instanceof Error ? e.message : "unknown");
    throw e;
  }
  const { generateFirstCatchAI } = await import("./first-catch-ai.server");
  return generateFirstCatchAI(data);
}
