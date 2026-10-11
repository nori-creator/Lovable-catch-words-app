import { afterEach, describe, expect, it } from "vitest";
import { CAPTURE_WARM_EVERY_MS, resetCaptureWarm, shouldWarmCapture } from "./capture-warm";

afterEach(() => resetCaptureWarm());

describe("shouldWarmCapture", () => {
  it("warms on the first camera open, then at most once a minute", () => {
    expect(shouldWarmCapture(1_000)).toBe(true);
    expect(shouldWarmCapture(1_000 + 5_000)).toBe(false);
    expect(shouldWarmCapture(1_000 + CAPTURE_WARM_EVERY_MS - 1)).toBe(false);
    expect(shouldWarmCapture(1_000 + CAPTURE_WARM_EVERY_MS)).toBe(true);
  });
});
