import { describe, expect, it } from "vitest";
import { CUTOUT_ENABLED } from "./cutout-feature";
import { DEX_SHELF_ENABLED, JOURNAL_ENABLED, SOCIAL_ENABLED } from "./features";

/**
 * Product guardrails for the Web MVP.
 *
 * These are deliberately small tests around flags whose code must be preserved
 * while the corresponding UI remains hidden/paused. A cleanup pass must not
 * “helpfully” turn these on or delete their pipelines.
 */
describe("Web MVP feature guardrails", () => {
  it("keeps browser background cutout off the Catch critical path", () => {
    expect(CUTOUT_ENABLED).toBe(false);
  });

  it("keeps deferred social, journal and shelf surfaces hidden", () => {
    expect(SOCIAL_ENABLED).toBe(false);
    expect(JOURNAL_ENABLED).toBe(false);
    expect(DEX_SHELF_ENABLED).toBe(false);
  });
});
