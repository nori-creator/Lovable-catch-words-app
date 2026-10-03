/**
 * お支払いの管理の画面（`createPortalSession`）が開けなかった時の言葉の鍵。
 * サーバの生の文（`STRIPE_PORTAL_FAILED 400` など）は画面に出さない（`errors.ts` と同じ考え）。
 */
export function portalErrorKey(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (msg.includes("NO_SUBSCRIPTION")) return "pro.manageNoSub";
  if (msg.includes("BILLING_NOT_CONFIGURED")) return "pro.notConfigured";
  return "pro.manageFailed";
}
