import { describe, expect, it } from "vitest";
import { focusPointFromTap } from "./camera-focus";

describe("R25: tap to focus maps the tap into the video frame", () => {
  const rect = { left: 0, top: 100, width: 300, height: 400 };
  it("maps the centre of a same-aspect video to (0.5, 0.5)", () => {
    expect(focusPointFromTap(150, 300, rect, 1440, 1920)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("accounts for letterboxing and ignores taps on the bars", () => {
    // 横長の映像（4:3）を縦長の枠に contain: 高さ 225、上下に 87.5 ずつ余白。
    expect(focusPointFromTap(150, 120, rect, 1920, 1440)).toBeNull();
    const p = focusPointFromTap(300, 300, rect, 1920, 1440)!;
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(0.5);
  });
  it("returns null before the video has a size", () => {
    expect(focusPointFromTap(150, 300, rect, 0, 0)).toBeNull();
  });
});
