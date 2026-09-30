import { describe, expect, it } from "vitest";
import { cameraPlatform, cameraProblemOf, externalBrowserUrl, inAppBrowser } from "./camera-access";

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

  it("iOS の他のアプリ内ブラウザ・ふつうのブラウザは URL を作らない", () => {
    expect(externalBrowserUrl("https://catchwords.lovable.app/", IOS_INSTAGRAM)).toBeNull();
    expect(externalBrowserUrl("https://catchwords.lovable.app/", IOS_SAFARI)).toBeNull();
  });

  it("失敗の理由を振り分ける", () => {
    expect(cameraProblemOf({ name: "NotAllowedError" }, null)).toBe("denied");
    expect(cameraProblemOf({ name: "NotReadableError" }, null)).toBe("unavailable");
    expect(cameraProblemOf({ name: "NotAllowedError" }, "line")).toBe("inapp");
    expect(cameraProblemOf(new TypeError("x"), null)).toBe("unsupported");
  });
});
