import { describe, it, expect } from "vitest";
import { resolveServerFnUrl } from "./server-origin";

/**
 * サーバー関数の呼び先の付け替え。
 *
 * ここが狂うと、**アプリのすべての通信が間違った場所へ行く**か、
 * 一切行かなくなる。画面の不具合と違って、目で見て気づける類ではない。
 */

const ORIGIN = "https://catchwords.example";

describe("resolveServerFnUrl", () => {
  it("呼び先が無ければ何もしない(ブラウザ版はいまのまま)", () => {
    expect(resolveServerFnUrl("/_serverFn/listMyStickers", null)).toBe("/_serverFn/listMyStickers");
  });

  it("相対パスに呼び先を付ける", () => {
    expect(resolveServerFnUrl("/_serverFn/listMyStickers", ORIGIN)).toBe(
      `${ORIGIN}/_serverFn/listMyStickers`,
    );
  });

  it("先頭のスラッシュが無くても壊れない", () => {
    expect(resolveServerFnUrl("_serverFn/x", ORIGIN)).toBe(`${ORIGIN}/_serverFn/x`);
  });

  it("すでに絶対URLなら触らない", () => {
    // 呼び出し側が意図して外を指している場合(画像の取得など)を
    // 勝手に書き換えると、まったく別の場所へ投げることになる。
    expect(resolveServerFnUrl("https://other.example/x", ORIGIN)).toBe("https://other.example/x");
    expect(resolveServerFnUrl("http://other.example/x", ORIGIN)).toBe("http://other.example/x");
  });

  it("scheme 相対(//host/x)も絶対URLとして扱う", () => {
    // `//` を相対パスと誤判定すると `https://origin//host/x` になる。
    expect(resolveServerFnUrl("//other.example/x", ORIGIN)).toBe("//other.example/x");
  });

  it("capacitor:// のような独自 scheme も触らない", () => {
    expect(resolveServerFnUrl("capacitor://localhost/x", ORIGIN)).toBe("capacitor://localhost/x");
  });

  it("呼び先の末尾スラッシュで二重にならない", () => {
    // configuredServerOrigin() 側で落としているが、ここでも確かめる。
    expect(resolveServerFnUrl("/_serverFn/x", "https://a.example")).toBe(
      "https://a.example/_serverFn/x",
    );
  });
});
