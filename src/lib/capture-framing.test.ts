import { describe, expect, it } from "vitest";
import { viewfinderCrop } from "./capture-framing";

describe("captured photo matches the viewfinder", () => {
  it("crops landscape video to the portrait viewport without stretching", () => {
    const crop = viewfinderCrop(1920, 1080, 390, 780);
    expect(crop).toEqual({ sx: 690, sy: 0, sw: 540, sh: 1080 });
  });
  it("preserves decimal digital zoom in the saved photo", () => {
    const crop = viewfinderCrop(1920, 1080, 390, 780, 1.5);
    expect(crop).toEqual({ sx: 780, sy: 180, sw: 360, sh: 720 });
  });
  it("keeps a square camera centered in a wide viewport", () => {
    expect(viewfinderCrop(1200, 1200, 800, 400)).toEqual({ sx: 0, sy: 300, sw: 1200, sh: 600 });
  });
});
