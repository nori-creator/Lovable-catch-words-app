import { createHmac } from "node:crypto";
import { FirstCatchAIInput } from "./first-catch-ai-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
) {
  const count = await db
    .from("app_config")
    .select("key", { count: "exact", head: true })
    .like("key", `${prefix}%`);
  if (count.error || count.count == null) throw new Error("FIRST_CATCH_AI_UNAVAILABLE");
  for (let slot = count.count; slot < limit; slot++) {
    const result = await db.from("app_config").insert({ key: `${prefix}${slot}`, value: {} });
    if (!result.error) return;
    if (result.error.code !== "23505") throw new Error("FIRST_CATCH_AI_UNAVAILABLE");
  }
  throw new Error("FIRST_CATCH_LIMIT");
}
export async function executeGuestFirstCatch(raw: unknown, request: Request) {
  const data = FirstCatchAIInput.parse(raw);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("FIRST_CATCH_ORIGIN");
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("FIRST_CATCH_AI_UNAVAILABLE");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const day = new Date().toISOString().slice(0, 10);
  const ip =
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const hash = createHmac("sha256", secret).update(`${day}:${ip}`).digest("hex").slice(0, 32);
  await reserveGuestSlot(supabaseAdmin, `first-catch-budget:${day}:ip:${hash}:`, 12);
  await reserveGuestSlot(supabaseAdmin, `first-catch-budget:${day}:global:`, 200);
  const { generateFirstCatchAI } = await import("./first-catch-ai.server");
  return generateFirstCatchAI(data);
}
