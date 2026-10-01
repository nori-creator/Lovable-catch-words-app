import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseJevIntervalMode } from "./jev-tasks";
import { isAlreadyGraded } from "./review-grade-guard";

/** 復習の採点の安全（2026-10-01）。 */
describe("次の復習の日を誰が決めるか", () => {
  it("既定・読めない値は SM-2（影の実行）。live と書いた時だけ Jev", () => {
    expect(parseJevIntervalMode(null)).toBe("shadow");
    expect(parseJevIntervalMode({})).toBe("shadow");
    expect(parseJevIntervalMode({ mode: "LIVE" })).toBe("shadow");
    expect(parseJevIntervalMode({ mode: "live" })).toBe("live");
  });

  it("採点は影の実行のとき Jev を待たない（Jev に聞くのは live のときだけ）", () => {
    const src = fs.readFileSync("src/lib/reviews.functions.ts", "utf8");
    expect(src).toMatch(/mode === "live" && score >= LAPSE_SCORE\s*\?\s*await jevScheduleDays/);
    expect(src).toMatch(/mode === "shadow" && score >= LAPSE_SCORE/);
  });
});

describe("同じ答えが2回届いても1回分しか進めない", () => {
  it("期限がまだ先の札は採点済み（1分の余裕）", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    expect(isAlreadyGraded(null, now)).toBe(false);
    expect(isAlreadyGraded("2026-09-30T00:00:00Z", now)).toBe(false);
    expect(isAlreadyGraded("2026-10-01T00:00:30Z", now)).toBe(false);
    expect(isAlreadyGraded("2026-10-02T00:00:00Z", now)).toBe(true);
  });

  it("書く時は読んだ時の期限のままの行だけ（同時に2回届いた後の方は0行）", () => {
    const src = fs.readFileSync("src/lib/reviews.functions.ts", "utf8");
    expect(src).toMatch(/updateQuery\.eq\("due_at", row\.due_at\)/);
    expect(src).toMatch(/updateQuery\.is\("due_at", null\)/);
  });

  it("忘却曲線の記録の失敗を見ている", () => {
    const src = fs.readFileSync("src/lib/reviews.functions.ts", "utf8");
    expect(src).toMatch(/review_history insert failed/);
    expect(src).toMatch(/history_saved: !histErr/);
  });
});

describe("裏の処理の失敗を記録に残す", () => {
  afterEach(() => vi.resetModules());

  it("同じ種類は1分に1回だけ数える", async () => {
    const logAppEvent = vi.fn(() => Promise.resolve({ ok: true }));
    vi.doMock("@/lib/metrics.functions", () => ({ logAppEvent }));
    vi.doMock("@/lib/lovable-error-reporting", () => ({ reportLovableError: vi.fn() }));
    const { reportBackgroundFailure, resetBackgroundFailureForTest } =
      await import("./background-failure");
    resetBackgroundFailureForTest();
    reportBackgroundFailure("tts", new Error("x"));
    reportBackgroundFailure("tts", new Error("y"));
    reportBackgroundFailure("photo_upload", new Error("z"));
    expect(logAppEvent).toHaveBeenCalledTimes(2);
    expect(logAppEvent).toHaveBeenCalledWith({ data: { kind: "bg_failed_tts" } });
    expect(logAppEvent).toHaveBeenCalledWith({ data: { kind: "bg_failed_photo_upload" } });
  });

  it("発音・写真・縮小写真・採点の失敗を捨てていない", () => {
    const read = (p: string) => fs.readFileSync(p, "utf8");
    expect(read("src/lib/use-pronounce.tsx")).toMatch(/reportBackgroundFailure\("tts"/);
    expect(read("src/lib/sticker-upload.ts")).toMatch(/reportBackgroundFailure\("thumb_upload"/);
    expect(read("src/routes/_authenticated/capture.tsx")).toMatch(
      /reportBackgroundFailure\("photo_upload"/,
    );
    expect(read("src/components/ScanCatchSheet.tsx")).toMatch(
      /reportBackgroundFailure\("photo_upload"/,
    );
    expect(read("src/routes/_authenticated/review.tsx")).toMatch(
      /reportBackgroundFailure\("review_grade"/,
    );
  });
});
