import { describe, expect, it } from "vitest";
import { markFlown, resetFlownForTest, wasFlown } from "./catch-flight";

/** 2026-09-28「一度図鑑から写真が消えて、また現れてバウンス」しない。 */
describe("飛んで着いた札の控え", () => {
  it("飛行が受け持った札だけが印付き", () => {
    resetFlownForTest();
    expect(wasFlown("a")).toBe(false);
    markFlown("a");
    expect(wasFlown("a")).toBe(true);
    expect(wasFlown("b")).toBe(false);
    expect(wasFlown(null)).toBe(false);
  });
});
