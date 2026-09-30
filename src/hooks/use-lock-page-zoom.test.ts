import { describe, expect, it } from "vitest";
import { lockedViewportContent, ZOOM_LOCK_VIEWPORT } from "./use-lock-page-zoom";

describe("R27: カメラの画面はページ全体の拡大を止める", () => {
  it("viewport に拡大を止める指定を足し、元の指定は残す", () => {
    expect(lockedViewportContent("width=device-width, initial-scale=1, viewport-fit=cover")).toBe(
      `width=device-width, initial-scale=1, viewport-fit=cover, ${ZOOM_LOCK_VIEWPORT}`,
    );
  });
  it("すでに拡大の指定があっても重複させない", () => {
    const out = lockedViewportContent("width=device-width, maximum-scale=5, user-scalable=yes");
    expect(out).toBe(`width=device-width, ${ZOOM_LOCK_VIEWPORT}`);
    expect(out.match(/user-scalable/g)).toHaveLength(1);
  });
  it("空でも壊れない", () => {
    expect(lockedViewportContent("")).toBe(ZOOM_LOCK_VIEWPORT);
  });
});
