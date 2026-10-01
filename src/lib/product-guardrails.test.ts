import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { DEX_SHELF_ENABLED } from "./features";

/**
 * Product guardrails for the Web MVP.
 *
 * These are deliberately small tests around flags whose code must be preserved
 * while the corresponding UI remains hidden/paused. A cleanup pass must not
 * “helpfully” turn these on or delete their pipelines.
 */
describe("Web MVP feature guardrails", () => {
  // Owner decision 2026-10-01: the long-paused background cutout was deleted as code.
  // Existing saved cutout images (cutout_image_url) still display.
  it("browser background cutout stays deleted", () => {
    expect(fs.existsSync("src/lib/cutout.ts")).toBe(false);
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.dependencies?.["@imgly/background-removal"]).toBeUndefined();
  });

  it("keeps the deferred shelf surface hidden", () => {
    expect(DEX_SHELF_ENABLED).toBe(false);
  });

  // Owner decision 2026-10-01: social, the AI-corrected /journal page and wordbooks were
  // deleted as code (their DB tables and saved rows stay). Do not bring the routes back
  // by accident.
  it("deleted social / journal / wordbooks routes stay deleted", () => {
    for (const r of ["feed", "discover", "notifications", "journal", "wordbooks"]) {
      expect(fs.existsSync(`src/routes/_authenticated/${r}.tsx`)).toBe(false);
    }
  });
});
