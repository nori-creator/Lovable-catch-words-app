import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-07 の報告: Web 版で「Googleで続ける」を押しても反応しないように見え、
 * Google の画面を経ずに、ブラウザで入っていた試験用のアカウントでログインした。
 */
describe("ログイン画面の Google・Apple のボタン", () => {
  const screen = readFileSync(
    new URL("../components/screens/AuthScreen.tsx", import.meta.url),
    "utf8",
  );
  const google = screen.slice(
    screen.indexOf("async function handleGoogle()"),
    screen.indexOf("async function handleApple()"),
  );

  it("Google は毎回アカウントを選ぶ画面を出す", () => {
    expect(google).toMatch(/extraParams: \{ prompt: "select_account" \}/);
  });

  it("画面が移るまでは押した印を残し、bfcache で戻った時は押せる状態に戻す", () => {
    expect(google).toMatch(/redirected = "redirected" in res && !!res\.redirected;/);
    expect(google).toMatch(/if \(!redirected\) \{\s*setLoading\(false\);\s*setPending\(null\);/);
    expect(screen).toMatch(/addEventListener\("pageshow", onShow\)/);
    expect(screen).toMatch(/pending === "google" \?/);
    expect(screen).toMatch(/pending === "apple" \?/);
  });

  it("窓口から失敗で戻った時は理由を出す", () => {
    expect(screen).toMatch(/back\.get\("error_description"\) \|\| back\.get\("error"\)/);
  });
});
