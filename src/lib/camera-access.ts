/**
 * **アプリの中のカメラを必ず使ってもらうための判定**（オーナー指示 2026-09-30
 * 「どんなブラウザで開いても、LINEのリンクから開いても…カメラの許可をとる、
 * 必要であればスマホの設定を変えるように誘導して。必ずアプリ内のカメラで
 * 新規ユーザーにカメラ撮影させたい」）。
 *
 * 画面に触れない純粋な関数だけを置く（試験で固定するため）。
 */

export type CameraPlatform = "ios" | "android" | "other";

/**
 * アプリ内ブラウザ（LINE・Instagram・Facebook・Google アプリなど）。
 * これらはカメラの映像を渡さないことが多いので、ふつうのブラウザで開き直してもらう。
 */
export type InAppBrowser = "line" | "instagram" | "facebook" | "google" | "webview" | null;

export function cameraPlatform(ua: string): CameraPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS の Safari は Mac を名乗る。触れる画面かどうかは呼ぶ側では分からないので、
  // ここでは「Mac を名乗り、かつ Mobile を含む」ものだけを iOS とみなす。
  if (/Macintosh/i.test(ua) && /Mobile/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function inAppBrowser(ua: string): InAppBrowser {
  if (/\bLine\//i.test(ua)) return "line";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/\bGSA\//i.test(ua)) return "google";
  // Android の WebView は「; wv)」を名乗る（Chrome のカスタムタブは名乗らない）。
  if (/Android/i.test(ua) && /;\s*wv\)/i.test(ua)) return "webview";
  return null;
}

/**
 * ふつうのブラウザで開き直すための URL。作れなければ null（手順だけを見せる）。
 *
 * - LINE: URL に `openExternalBrowser=1` を付けると、LINE が端末の標準ブラウザで開く
 *   （LINE の公式ヘルプに載っている指定）。
 * - Android の他のアプリ内ブラウザ: `intent://` で Chrome を指名して開く。
 * - iOS の他のアプリ内ブラウザ: 外から Safari を開かせる確かな手段が無いので null。
 */
export function externalBrowserUrl(
  href: string,
  ua: string,
  app: InAppBrowser = inAppBrowser(ua),
): string | null {
  if (!app) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (app === "line") {
    url.searchParams.set("openExternalBrowser", "1");
    return url.toString();
  }
  if (cameraPlatform(ua) === "android") {
    const scheme = url.protocol.replace(":", "");
    return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  }
  return null;
}

/** カメラが使えない理由。画面の文言と手順を選ぶのに使う。 */
export type CameraProblem =
  /** 許可されていない（断った・設定で止まっている）。 */
  | "denied"
  /** この画面（アプリ内ブラウザなど）ではカメラを渡してもらえない。 */
  | "inapp"
  /** カメラが無い・他のアプリが使っている・映像が届かない。 */
  | "unavailable"
  /** https でない・古いブラウザなど、そもそも仕組みが無い。 */
  | "unsupported";

/**
 * `getUserMedia` の失敗を理由に振り分ける。
 * アプリ内ブラウザでは、許可の問題に見えても開き直しのほうが確実なので `inapp` を優先する。
 */
export function cameraProblemOf(error: unknown, app: InAppBrowser): CameraProblem {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (app) return "inapp";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return "denied";
  if (name === "TypeError") return "unsupported";
  return "unavailable";
}
