import { describe, expect, it } from "vitest";
import {
  NATIVE_CALLBACK,
  clearLocalSupabaseSession,
  nativeAuthPath,
  nativeCallbackUrl,
  sanitizeNativeProvider,
  sanitizeNativeState,
} from "./native-auth";

describe("native-auth (iPhone アプリへのログインの受け渡し)", () => {
  it("state はアプリが作った乱数の形だけ受け付ける", () => {
    expect(sanitizeNativeState("abcDEF0123456789-_.")).toBe("abcDEF0123456789-_.");
    expect(sanitizeNativeState("short")).toBe("");
    expect(sanitizeNativeState("has space 0123456789")).toBe("");
    expect(sanitizeNativeState("x".repeat(129))).toBe("");
    expect(sanitizeNativeState(undefined)).toBe("");
  });

  it("provider は google / apple だけ", () => {
    expect(sanitizeNativeProvider("google")).toBe("google");
    expect(sanitizeNativeProvider("apple")).toBe("apple");
    expect(sanitizeNativeProvider("facebook")).toBe("");
  });

  it("アプリへ戻る URL: トークンはフラグメントに、state を添える", () => {
    const url = nativeCallbackUrl(
      { access_token: "a.b.c", refresh_token: "r=1&x", expires_at: 1700000000.7, expires_in: 3600 },
      "state0123456789abcdef",
    );
    expect(url.startsWith(`${NATIVE_CALLBACK}#`)).toBe(true);
    expect(url).not.toContain("?");
    const frag = new URLSearchParams(url.slice(url.indexOf("#") + 1));
    expect(frag.get("access_token")).toBe("a.b.c");
    expect(frag.get("refresh_token")).toBe("r=1&x");
    expect(frag.get("expires_at")).toBe("1700000000");
    expect(frag.get("expires_in")).toBe("3600");
    expect(frag.get("state")).toBe("state0123456789abcdef");
  });

  it("やり直し用の自分の URL", () => {
    expect(nativeAuthPath("google", "s0123456789abcdef")).toBe(
      "/native-auth?state=s0123456789abcdef&provider=google",
    );
    expect(nativeAuthPath("", "s0123456789abcdef")).toBe("/native-auth?state=s0123456789abcdef");
  });

  it("ブラウザのセッションの控えだけ消す（ほかの鍵は残す）", () => {
    const store = new Map<string, string>([
      ["sb-abc-auth-token", "{}"],
      ["sb-abc-auth-token-code-verifier", "v"],
      ["cw-sound-level", "subtle"],
    ]);
    const fake = {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    const removed = clearLocalSupabaseSession(fake);
    expect(removed.sort()).toEqual(["sb-abc-auth-token", "sb-abc-auth-token-code-verifier"]);
    expect(Array.from(store.keys())).toEqual(["cw-sound-level"]);
  });
});
