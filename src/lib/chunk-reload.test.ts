import { describe, expect, it } from "vitest";
import { canReloadNow, isChunkLoadError } from "./chunk-reload";

describe("画面の部品を取りに行けなかった時の立ち直り（2026-09-29「読み込みに失敗しました」）", () => {
  it("各ブラウザの「部品を取れなかった」を見分ける", () => {
    expect(
      isChunkLoadError(
        new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/a.css"))).toBe(true);
    // 描画の失敗（本物の不具合）は読み直しで隠さない。
    expect(
      isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'key')")),
    ).toBe(false);
  });

  it("読み直しは 30 秒に1回まで（読み直し続ける輪にしない）", () => {
    expect(canReloadNow(null, 1_000_000)).toBe(true);
    expect(canReloadNow(1_000_000, 1_010_000)).toBe(false);
    expect(canReloadNow(1_000_000, 1_031_000)).toBe(true);
  });
});
