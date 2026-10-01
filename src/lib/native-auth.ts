import { DEEP_LINK_SCHEME } from "./deep-link";

/**
 * **iPhone アプリへのログインの受け渡し**（`/native-auth`）。
 *
 * iOS 版の Google / Apple ログインは、アプリ内の安全なブラウザ
 * （`ASWebAuthenticationSession`）でこの Web 版のログインを済ませ、できた
 * セッションをアプリに渡す。Lovable Cloud の Google / Apple は Lovable の
 * OAuth 窓口を通るので、アプリから直接つなぐ設定ができない。Web 版と**同じ
 * アカウント**になるのもこの方式の利点。
 *
 * 渡し方: `catchwords://auth-callback#access_token=…&refresh_token=…&state=…`。
 *  - トークンは `#` の後ろ（フラグメント）に置く。フラグメントはサーバーに
 *    送られないので、どこの記録にも残らない。
 *  - `state` はアプリが作った乱数。アプリは自分の `state` と同じ時だけ受け取る
 *    （よそから差し込まれた応答を捨てる）。
 *  - ブラウザ側の控えは消す（`clearLocalSupabaseSession`）。`signOut` は呼ばない
 *    — サーバーで更新トークンが失効し、渡したばかりのセッションが壊れるため。
 */
export const NATIVE_CALLBACK = `${DEEP_LINK_SCHEME}://auth-callback`;

const STATE = /^[A-Za-z0-9_.-]{16,128}$/;

/** アプリが付けた `state`。形が違えば空（= 受け付けない）。 */
export function sanitizeNativeState(raw: unknown): string {
  return typeof raw === "string" && STATE.test(raw) ? raw : "";
}

export type NativeProvider = "google" | "apple";

export function sanitizeNativeProvider(raw: unknown): NativeProvider | "" {
  return raw === "google" || raw === "apple" ? raw : "";
}

export type HandoffSession = {
  access_token: string;
  refresh_token: string;
  /** 期限（UNIX 秒）。 */
  expires_at?: number | null;
  expires_in?: number | null;
};

/** アプリへ戻る URL。トークンはフラグメントに、`state` を必ず添える。 */
export function nativeCallbackUrl(session: HandoffSession, state: string): string {
  const p = new URLSearchParams();
  p.set("access_token", session.access_token);
  p.set("refresh_token", session.refresh_token);
  if (session.expires_at) p.set("expires_at", String(Math.floor(session.expires_at)));
  if (session.expires_in) p.set("expires_in", String(Math.floor(session.expires_in)));
  p.set("token_type", "bearer");
  p.set("state", state);
  return `${NATIVE_CALLBACK}#${p.toString()}`;
}

/** この Web の `/native-auth` を、同じ `state` で開き直す URL（やり直し用）。 */
export function nativeAuthPath(provider: NativeProvider | "", state: string): string {
  const p = new URLSearchParams({ state });
  if (provider) p.set("provider", provider);
  return `/native-auth?${p.toString()}`;
}

/**
 * ブラウザに残った Supabase のセッションの控え（`sb-<ref>-auth-token`）を消す。
 * サーバーには何も送らない。
 */
export function clearLocalSupabaseSession(
  storage: Pick<Storage, "length" | "key" | "removeItem">,
): string[] {
  const removed: string[] = [];
  for (let i = storage.length - 1; i >= 0; i--) {
    const k = storage.key(i);
    if (k && /^sb-.*-auth-token/.test(k)) {
      storage.removeItem(k);
      removed.push(k);
    }
  }
  return removed;
}
