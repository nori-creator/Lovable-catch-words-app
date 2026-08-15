/**
 * サーバー関数の呼び先を、別のドメインへ向け直すための小道具。
 *
 * ## なぜ要るか(スマホアプリに同梱するとき)
 * いまスマホアプリは `server.url` で**公開中のサイトをそのまま表示**して
 * いる。画面もサーバー関数も同じ場所にあるので何も考えなくていい。
 *
 * 画面を端末に同梱する方式へ移ると、そこが崩れる。画面は
 * `capacitor://localhost`(iOS)や `https://localhost`(Android)から
 * 開かれるのに、サーバー関数の呼び先は**ビルド時に焼き込まれた相対パス**
 * だから:
 *
 *     node_modules/@tanstack/start-client-core/.../createClientRpc.js
 *     const url = process.env.TSS_SERVER_FN_BASE + functionId;  // "/_serverFn/…"
 *
 * つまり `capacitor://localhost/_serverFn/…` を叩きに行く。そこには何も
 * 無いので、**AIも図鑑も復習も全部動かない**。設定を1行変えるだけの
 * 話ではない、というのがここの要点。
 *
 * TanStack Start には差し込み口がある(`createStart({ serverFns: { fetch } })`)。
 * そこへ「相対パスなら決めた場所に付け替える」fetch を渡す。
 *
 * ## 認証は問題にならない
 * このアプリはサーバー関数の認証を **Authorization ヘッダのトークン**で
 * やっている(`auth-attacher.ts`)。Cookie ではないので、別ドメインへ
 * 投げても SameSite の面倒が無い。必要なのはサーバー側の CORS 許可だけ。
 *
 * ## いまは何も起きない
 * 呼び先が設定されていなければ素通し。ブラウザ版の挙動は一切変わらない。
 */

/** 呼び先。ビルド時に決める。未設定なら付け替えない。 */
export function configuredServerOrigin(): string | null {
  const raw =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
          ?.VITE_SERVER_ORIGIN
      : undefined;
  const trimmed = (raw ?? "").trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

/**
 * 呼び先へ付け替えた URL を返す。
 *
 * - `origin` が無ければそのまま(= いまの挙動)
 * - すでに絶対URLならそのまま(呼び出し側が意図して外を指している)
 * - 相対パスのときだけ `origin` を前に付ける
 */
export function resolveServerFnUrl(url: string, origin: string | null): string {
  if (!origin) return url;
  // `//example.com/x` は「同じ scheme の絶対URL」。相対パスではない。
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return url;
  return origin + (url.startsWith("/") ? url : `/${url}`);
}

/**
 * `createStart({ serverFns: { fetch } })` へ渡す fetch。
 * 呼び先が未設定なら素の fetch と同じ。
 */
export function makeServerFnFetch(origin: string | null): typeof fetch {
  if (!origin) return fetch;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return fetch(resolveServerFnUrl(input, origin), init);
    }
    if (input instanceof URL) {
      return fetch(resolveServerFnUrl(input.toString(), origin), init);
    }
    // Request オブジェクトは URL を差し替えられないので、作り直す。
    const next = new Request(resolveServerFnUrl(input.url, origin), input);
    return fetch(next, init);
  }) as typeof fetch;
}
