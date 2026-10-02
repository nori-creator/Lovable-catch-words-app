import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_PRIMER_VARIANT,
  androidBrowserName,
  cameraFixSteps,
  cameraPlatform,
  cameraProblemOf,
  cameraStart,
  externalBrowserUrl,
  inAppBrowser,
  mayAutoOpenExternal,
  osCameraKind,
  readCameraPermission,
} from "./camera-access";

const IOS_LINE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0";
const ANDROID_LINE =
  "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 Line/14.9.1/IAB";
const ANDROID_WV =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0";

describe("camera-access", () => {
  it("アプリ内ブラウザを見分ける（ふつうのブラウザは null）", () => {
    expect(inAppBrowser(IOS_LINE)).toBe("line");
    expect(inAppBrowser(ANDROID_LINE)).toBe("line");
    expect(inAppBrowser(ANDROID_WV)).toBe("webview");
    expect(inAppBrowser(IOS_INSTAGRAM)).toBe("instagram");
    expect(inAppBrowser(ANDROID_CHROME)).toBeNull();
    expect(inAppBrowser(IOS_SAFARI)).toBeNull();
  });

  it("端末を見分ける", () => {
    expect(cameraPlatform(IOS_SAFARI)).toBe("ios");
    expect(cameraPlatform(ANDROID_CHROME)).toBe("android");
  });

  it("LINE は openExternalBrowser=1 を付けて開き直す（既存の検索文字列は残す）", () => {
    expect(externalBrowserUrl("https://catchwords.lovable.app/welcome?a=1", IOS_LINE)).toBe(
      "https://catchwords.lovable.app/welcome?a=1&openExternalBrowser=1",
    );
  });

  it("Android の他のアプリ内ブラウザは Chrome を指名する", () => {
    expect(externalBrowserUrl("https://catchwords.lovable.app/welcome", ANDROID_WV)).toBe(
      "intent://catchwords.lovable.app/welcome#Intent;scheme=https;package=com.android.chrome;end",
    );
  });

  it("iPhone の他のアプリ内ブラウザは Safari に渡す・ふつうのブラウザは URL を作らない", () => {
    expect(externalBrowserUrl("https://catchwords.lovable.app/welcome?x=1", IOS_INSTAGRAM)).toBe(
      "x-safari-https://catchwords.lovable.app/welcome?x=1",
    );
    expect(externalBrowserUrl("https://catchwords.lovable.app/", IOS_SAFARI)).toBeNull();
    expect(externalBrowserUrl("https://catchwords.lovable.app/", ANDROID_CHROME)).toBeNull();
  });

  it("自動で開き直すのは1度だけ（LINE で開き直した後は繰り返さない）", () => {
    expect(mayAutoOpenExternal("https://a.app/welcome", false)).toBe(true);
    expect(mayAutoOpenExternal("https://a.app/welcome", true)).toBe(false);
    expect(mayAutoOpenExternal("https://a.app/welcome?openExternalBrowser=1", false)).toBe(false);
  });

  it("失敗の理由を振り分ける", () => {
    expect(cameraProblemOf({ name: "NotAllowedError" }, null)).toBe("denied");
    expect(cameraProblemOf({ name: "NotReadableError" }, null)).toBe("unavailable");
    expect(cameraProblemOf({ name: "NotAllowedError" }, "line")).toBe("inapp");
    expect(cameraProblemOf(new TypeError("x"), null)).toBe("unsupported");
  });

  it("Android の手順はそのブラウザの名前で書く", () => {
    expect(androidBrowserName(ANDROID_CHROME)).toBe("Chrome");
    expect(
      androidBrowserName(
        "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
      ),
    ).toBe("Samsung Internet");
  });

  it("Android の Google アプリ内ブラウザも Chrome で開き直す", () => {
    const gsa =
      "Mozilla/5.0 (Linux; Android 14; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 GSA/15.20";
    expect(inAppBrowser(gsa)).toBe("google");
    expect(externalBrowserUrl("https://catchwords.lovable.app/welcome", gsa)).toMatch(
      /^intent:\/\/catchwords\.lovable\.app\/welcome#Intent;scheme=https;package=com\.android\.chrome;end$/,
    );
  });
});

const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1";

/**
 * **撮る前の一枚**（オーナー指示 2026-10-02「許可の画面がダサい…どこからでもカメラを
 * 許可して、新規登録前にこのアプリを体験できるように」）。どの端末・どの状態で、
 * 前置き・すぐ映す・直し方のどれを出すか。
 */
describe("cameraStart（撮る画面を開いた時に最初に何をするか）", () => {
  const base = { hasGetUserMedia: true, secure: true, primer: true } as const;

  it("まだ許可していない iPhone の Safari・Android の Chrome は、前置きを出す（すぐ頼まない）", () => {
    expect(cameraStart({ ...base, ua: IOS_SAFARI, permission: "prompt" })).toBe("primer");
    expect(cameraStart({ ...base, ua: ANDROID_CHROME, permission: "prompt" })).toBe("primer");
    expect(cameraStart({ ...base, ua: DESKTOP_CHROME, permission: "prompt" })).toBe("primer");
  });

  it("許可済みなら前置きを省いてすぐ映す", () => {
    expect(cameraStart({ ...base, ua: IOS_SAFARI, permission: "granted" })).toBe("live");
    expect(cameraStart({ ...base, ua: ANDROID_CHROME, permission: "granted" })).toBe("live");
  });

  it("許可の状態を聞けないブラウザは、前に使えた端末だけ前置きを省く", () => {
    expect(cameraStart({ ...base, ua: IOS_SAFARI, permission: "unknown" })).toBe("primer");
    expect(
      cameraStart({ ...base, ua: IOS_SAFARI, permission: "unknown", grantedBefore: true }),
    ).toBe("live");
    // 「まだ」と答えるブラウザ（iPhone の「確認」設定）は、前に使えていても前置きを出す。
    expect(
      cameraStart({ ...base, ua: IOS_SAFARI, permission: "prompt", grantedBefore: true }),
    ).toBe("primer");
  });

  it("断ってあるなら頼まずに直し方へ（アプリ内ブラウザは開き直しの案内）", () => {
    expect(cameraStart({ ...base, ua: IOS_SAFARI, permission: "denied" })).toBe("denied");
    expect(cameraStart({ ...base, ua: ANDROID_CHROME, permission: "denied" })).toBe("denied");
    expect(cameraStart({ ...base, ua: IOS_LINE, permission: "denied" })).toBe("inapp");
  });

  it("カメラの仕組みが無い・https でないときは行き止まりにせず、端末のカメラの道へ", () => {
    expect(
      cameraStart({ ...base, ua: ANDROID_LINE, permission: "unknown", hasGetUserMedia: false }),
    ).toBe("inapp");
    expect(
      cameraStart({ ...base, ua: ANDROID_WV, permission: "prompt", hasGetUserMedia: false }),
    ).toBe("inapp");
    expect(cameraStart({ ...base, ua: IOS_SAFARI, permission: "prompt", secure: false })).toBe(
      "unsupported",
    );
  });

  it("アプリ内ブラウザでもカメラの仕組みが在れば、まず前置き（その画面のカメラを試す）", () => {
    expect(cameraStart({ ...base, ua: IOS_LINE, permission: "prompt" })).toBe("primer");
  });

  it("前置きを使わない画面（ログイン後の撮る画面）は今まで通りすぐ頼む", () => {
    expect(cameraStart({ ...base, primer: false, ua: IOS_SAFARI, permission: "prompt" })).toBe(
      "live",
    );
    expect(cameraStart({ ...base, primer: false, ua: IOS_SAFARI, permission: "unknown" })).toBe(
      "live",
    );
  });

  it("本番の見せ方は3つのうちの1つ", () => {
    expect(["sheet", "full", "inline"]).toContain(CAMERA_PRIMER_VARIANT);
  });
});

describe("osCameraKind（端末のカメラアプリで撮れるか）", () => {
  it("スマホは端末のカメラ、パソコンは写真を選ぶ", () => {
    expect(osCameraKind(IOS_SAFARI)).toBe("camera");
    expect(osCameraKind(ANDROID_CHROME)).toBe("camera");
    expect(osCameraKind(IOS_LINE)).toBe("camera");
    expect(osCameraKind(DESKTOP_CHROME)).toBe("file");
  });
});

describe("cameraFixSteps（許可を直す手順）", () => {
  const keys = (steps: ReturnType<typeof cameraFixSteps>) => steps.map((s) => s.key);

  it("iPhone の Safari はアドレス欄の「ぁあ」から（出なければ設定アプリ）", () => {
    expect(keys(cameraFixSteps("denied", IOS_SAFARI))).toEqual([
      "camhelp.iosSafari1",
      "camhelp.iosSafari2",
      "camhelp.iosSettings",
    ]);
  });

  it("iPhone の Chrome は設定アプリの Chrome の項目", () => {
    expect(keys(cameraFixSteps("denied", IOS_CHROME))).toEqual([
      "camhelp.iosChrome1",
      "camhelp.iosChrome2",
    ]);
  });

  it("Android はアドレス欄のアイコン → 権限、出なければそのブラウザのアプリの権限（Brave は名指し）", () => {
    const steps = cameraFixSteps("denied", ANDROID_CHROME);
    expect(keys(steps)).toEqual(["camhelp.android1", "camhelp.android2", "camhelp.android3"]);
    expect(steps[2].vars).toEqual({ browser: "Chrome" });
    expect(cameraFixSteps("denied", ANDROID_CHROME, { brave: true })[2].vars).toEqual({
      browser: "Brave",
    });
  });

  it("アプリ内ブラウザは、自動で開き直せる時は手順を出さない", () => {
    expect(keys(cameraFixSteps("inapp", IOS_INSTAGRAM))).toEqual(["camhelp.inappIos"]);
    expect(cameraFixSteps("inapp", IOS_LINE, { external: true })).toEqual([]);
    expect(cameraFixSteps("unavailable", IOS_SAFARI)).toEqual([]);
  });
});

describe("readCameraPermission（許可の状態を聞く）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("答えをそのまま返す", async () => {
    vi.stubGlobal("navigator", {
      permissions: { query: async () => ({ state: "granted" }) },
    });
    expect(await readCameraPermission()).toBe("granted");
  });

  it("知らないと投げるブラウザ（Firefox）・聞けないブラウザは unknown", async () => {
    vi.stubGlobal("navigator", {
      permissions: {
        query: async () => {
          throw new TypeError("'camera' is not a valid value for enumeration PermissionName.");
        },
      },
    });
    expect(await readCameraPermission()).toBe("unknown");
    vi.stubGlobal("navigator", {});
    expect(await readCameraPermission()).toBe("unknown");
  });

  it("答えが来ないときは待ち続けない", async () => {
    vi.stubGlobal("navigator", {
      permissions: { query: () => new Promise(() => {}) },
    });
    expect(await readCameraPermission(20)).toBe("unknown");
  });
});
