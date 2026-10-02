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

/** 設定アプリの中でのブラウザの名前（Android の手順で使う）。 */
export function androidBrowserName(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/EdgA\//i.test(ua)) return "Edge";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/OPR\//i.test(ua)) return "Opera";
  return "Chrome";
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
 * - iPhone の他のアプリ内ブラウザ: `x-safari-https://` で Safari に渡す（iOS 17 以降の
 *   Safari が受ける指定。アプリによっては効かないので、手順とリンクのコピーも残す）。
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
  const platform = cameraPlatform(ua);
  if (platform === "android") {
    const scheme = url.protocol.replace(":", "");
    return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  }
  if (platform === "ios" && url.protocol === "https:") {
    return `x-safari-https://${url.host}${url.pathname}${url.search}${url.hash}`;
  }
  return null;
}

/**
 * 自動で開き直してよいか。**1度だけ**（開き直した先がまた同じアプリ内ブラウザ
 * だったとき、行ったり来たりを繰り返さない）。LINE は開き直した URL に目印が残る。
 */
export function mayAutoOpenExternal(href: string, alreadyTried: boolean): boolean {
  if (alreadyTried) return false;
  try {
    return new URL(href).searchParams.get("openExternalBrowser") !== "1";
  } catch {
    return false;
  }
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

/* ------------------------------------------------------------------
 * **カメラを頼む前の一枚**（オーナー指示 2026-10-02「新規登録前のユーザーがこのアプリで
 * カメラを使おうとするときに…許可の画面が出た。ダサいからどうにかならない？…iPhone
 * ユーザーでもAndroid ユーザーでもブラウザからでもどこからでもカメラを許可して、この
 * 新規登録前にこのアプリを体験できるようにして」）。
 *
 * ブラウザ自身の許可の画面（Brave の「…wants to use your camera」など）は、ページから
 * 形を変えることも消すこともできない。ページにできるのは:
 *  1. 頼む**前に**、アプリの言葉で「なぜカメラか・写真はどこへ行くか」を見せ、押して
 *     もらってから頼む（ブラウザの画面は押した直後にだけ出る。断られにくい）
 *  2. 端末のカメラアプリで撮ってもらう（`<input capture>` — サイトの許可は要らない）
 *  3. 断られていたら、端末ごとの直し方と、2 の道をすぐに出す
 * ------------------------------------------------------------------ */

/** 前置きの見せ方。本番は {@link CAMERA_PRIMER_VARIANT} の1つ。見本で3つを見比べる。 */
export type CameraPrimerVariant = "sheet" | "full" | "inline";

/**
 * **本番で使う前置きの見せ方**（ここ1か所で切り替える）。
 * - `sheet` … 暗いカメラの上に浮く下のシート（端末の許可の画面に近い・親指が届く）
 * - `full`  … 画面いっぱいのカード（写真の絵つき）
 * - `inline`… 案内の札の位置に、2つの釦つきの札
 */
export const CAMERA_PRIMER_VARIANT: CameraPrimerVariant = "sheet";

/** ブラウザに聞いたカメラの許可の状態。聞けなければ `unknown`。 */
export type CameraPermission = "granted" | "denied" | "prompt" | "unknown";

/**
 * 撮る画面を開いたとき、最初に何をするか。
 * - `live` … すぐにカメラを頼む（許可済み・前置きを使わない画面）
 * - `primer` … 前置きを見せ、押してもらってから頼む
 * - それ以外 … 頼んでも無駄なので、直し方（と端末のカメラで撮る道）を出す
 */
export type CameraStart = "live" | "primer" | CameraProblem;

export function cameraStart({
  ua,
  hasGetUserMedia,
  secure,
  permission,
  primer,
  grantedBefore = false,
}: {
  ua: string;
  /** `navigator.mediaDevices.getUserMedia` が在るか。 */
  hasGetUserMedia: boolean;
  /** https か（`window.isSecureContext`）。http ではカメラは頼めない。 */
  secure: boolean;
  permission: CameraPermission;
  /** 前置きを使う画面か（チュートリアルだけ。ログイン後の撮る画面は今まで通りすぐ頼む）。 */
  primer: boolean;
  /** この端末で前にカメラが使えたか（許可の状態を聞けないブラウザで、前置きを省くため）。 */
  grantedBefore?: boolean;
}): CameraStart {
  const app = inAppBrowser(ua);
  if (!secure || !hasGetUserMedia) return app ? "inapp" : "unsupported";
  if (permission === "denied") return app ? "inapp" : "denied";
  if (permission === "granted") return "live";
  if (!primer) return "live";
  if (permission === "unknown" && grantedBefore) return "live";
  return "primer";
}

/**
 * 端末のカメラアプリで撮れるか。スマホ（iPhone・Android）は `<input capture>` で
 * 端末のカメラが開く。パソコンは `capture` が効かず、ファイルを選ぶ画面になるので
 * 「写真を選ぶ」と書く。
 */
export function osCameraKind(ua: string): "camera" | "file" {
  return cameraPlatform(ua) === "other" ? "file" : "camera";
}

/** 画面の手順1行（i18n の鍵と差し込む値）。 */
export type CameraFixStep = { key: string; vars?: Record<string, string> };

/**
 * **許可を直す手順**（端末・ブラウザごと）。純粋な関数にして試験で固定する。
 * - iPhone の Safari … アドレス欄の「ぁあ」→ Webサイトの設定 → カメラ（このサイトだけ）。
 *   出てこない時は「設定」アプリの Safari の項目。
 * - iPhone の Chrome … 「設定」アプリ → Chrome → カメラ（アプリそのものの許可）。
 * - Android … アドレス欄の左のアイコン → 権限 → カメラ。出てこない時は端末の設定の
 *   ブラウザのアプリの権限（Brave は自分を名乗らないので `brave` で受け取る）。
 */
export function cameraFixSteps(
  problem: CameraProblem,
  ua: string,
  { brave = false, external = false }: { brave?: boolean; external?: boolean } = {},
): CameraFixStep[] {
  const platform = cameraPlatform(ua);
  if (problem === "denied") {
    if (platform === "ios")
      return /CriOS/i.test(ua)
        ? [{ key: "camhelp.iosChrome1" }, { key: "camhelp.iosChrome2" }]
        : [
            { key: "camhelp.iosSafari1" },
            { key: "camhelp.iosSafari2" },
            { key: "camhelp.iosSettings" },
          ];
    if (platform === "android")
      return [
        { key: "camhelp.android1" },
        { key: "camhelp.android2" },
        { key: "camhelp.android3", vars: { browser: brave ? "Brave" : androidBrowserName(ua) } },
      ];
    return [{ key: "camhelp.desktop1" }];
  }
  if (problem === "inapp" && !external)
    return [{ key: platform === "ios" ? "camhelp.inappIos" : "camhelp.inappOther" }];
  return [];
}

/** 許可の状態をブラウザに聞く。聞けない・答えが遅いときは `unknown`（前置きを出す側に倒す）。 */
export async function readCameraPermission(timeoutMs = 700): Promise<CameraPermission> {
  try {
    const query = navigator.permissions?.query?.bind(navigator.permissions);
    if (!query) return "unknown";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const status = await Promise.race([
      query({ name: "camera" as PermissionName }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    const state = status?.state;
    return state === "granted" || state === "denied" || state === "prompt" ? state : "unknown";
  } catch {
    // Firefox などは `camera` を知らないと投げる。
    return "unknown";
  }
}

const GRANTED_KEY = "catchwords-camera-granted-v1";

/** この端末でカメラが使えたことを覚える（覚えられなくても動く）。 */
export function rememberCameraGranted() {
  try {
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    /* 覚えられない端末では、次も前置きを出すだけ。 */
  }
}

export function cameraGrantedBefore(): boolean {
  try {
    return localStorage.getItem(GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}
