/**
 * **退会のときに「Apple でサインイン」の許可を取り消す**（Apple の退会の決まり・TN3194）。
 *
 * Apple の決まり（2026-10-03 に公式の文書で確かめた）:
 * - 取り消しの口は `POST https://appleid.apple.com/auth/revoke`
 *   （`application/x-www-form-urlencoded`）。送る物は `client_id`（Supabase の Apple ログインに
 *   使っている Services ID）・`client_secret`（下の JWT）・`token`（利用者の refresh token か
 *   access token）・`token_type_hint`（`refresh_token` / `access_token`）。
 *   取り消せた・前に無効になっていた時は **200 で本文なし**。失敗は `{"error":"invalid_client"}` など。
 * - `client_secret` は ES256（P-256 + SHA-256）で署名した JWT。頭は `alg: ES256`・`kid: Key ID`、
 *   中身は `iss: Team ID`・`iat`・`exp`（今から **15777000 秒（6か月）以内**）・
 *   `aud: https://appleid.apple.com`・`sub: client_id と同じ Services ID`。
 * - 取り消す token が無い人（この変更より前に Apple で登録した人）でも退会は必ず終える。
 *   その人は Apple の「Apple でサインイン」の設定から自分で外せる（TN3194）。
 *
 * ここは Cloudflare でも動くように **Web Crypto だけ**を使う（Node の crypto・JWT の道具は使わない）。
 * DB を読む所は `apple-revoke.server.ts`。
 */

export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
export const APPLE_AUDIENCE = "https://appleid.apple.com";
/** Apple が受ける `exp` の上限（今から 6 か月 = 15777000 秒）。少し余して 1 時間にする。 */
export const CLIENT_SECRET_TTL_S = 60 * 60;
export const CLIENT_SECRET_MAX_TTL_S = 15_777_000;

export type AppleConfig = {
  teamId: string;
  keyId: string;
  /** p8 の中身（`-----BEGIN PRIVATE KEY-----` …）。改行が `\n` の文字になっていても読む。 */
  privateKey: string;
  servicesId: string;
};

/** 環境変数から読む。どれか欠けていれば null と足りない名前。 */
export function readAppleConfig(env: Record<string, string | undefined>): {
  config: AppleConfig | null;
  missing: string[];
} {
  const names = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_SERVICES_ID"];
  const missing = names.filter((n) => !env[n]?.trim());
  if (missing.length) return { config: null, missing };
  return {
    config: {
      teamId: env.APPLE_TEAM_ID!.trim(),
      keyId: env.APPLE_KEY_ID!.trim(),
      privateKey: env.APPLE_PRIVATE_KEY!,
      servicesId: env.APPLE_SERVICES_ID!.trim(),
    },
    missing: [],
  };
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromJson(v: unknown): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(v)));
}

/** p8（PKCS#8 の PEM）から鍵の中身（DER）を取り出す。 */
export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) throw new Error("APPLE_PRIVATE_KEY is empty");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Apple に渡す `client_secret`（ES256 の JWT）を作る。Web Crypto の ECDSA の署名は
 * r‖s の 64 バイト（IEEE P1363）で、JWS の ES256 が求める形そのもの。
 */
export async function makeAppleClientSecret(
  config: AppleConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = CLIENT_SECRET_TTL_S,
): Promise<string> {
  const ttl = Math.min(Math.max(60, ttlSeconds), CLIENT_SECRET_MAX_TTL_S);
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const payload = {
    iss: config.teamId,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
    aud: APPLE_AUDIENCE,
    sub: config.servicesId,
  };
  const signingInput = `${base64UrlFromJson(header)}.${base64UrlFromJson(payload)}`;
  const der = pemToDer(config.privateKey);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(sig))}`;
}

export type AppleTokenKind = "refresh_token" | "access_token";

export type RevokeResult =
  { ok: true; status: number } | { ok: false; status: number | null; error: string };

/** Apple の取り消しの口を呼ぶ。**投げない**（退会を止めないため、結果で返す）。 */
export async function revokeAppleToken(
  input: { token: string; kind: AppleTokenKind; config: AppleConfig },
  deps: { fetch?: typeof fetch; now?: number } = {},
): Promise<RevokeResult> {
  const doFetch = deps.fetch ?? fetch;
  try {
    const secret = await makeAppleClientSecret(input.config, deps.now);
    const body = new URLSearchParams({
      client_id: input.config.servicesId,
      client_secret: secret,
      token: input.token,
      token_type_hint: input.kind,
    });
    const res = await doFetch(APPLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, status: res.status };
    let error = `http_${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) error = j.error;
    } catch {
      // 本文が JSON でない
    }
    return { ok: false, status: res.status, error };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
}
