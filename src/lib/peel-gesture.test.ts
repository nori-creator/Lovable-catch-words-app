import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  movePeelDrag,
  peelOutcome,
  pointerDrives,
  PEEL_COMMIT,
  PEEL_TAP_MS,
  startPeelDrag,
} from "./peel-gesture";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const drag = (touch: number | null = null) =>
  startPeelDrag({ id: 7, x: 300, y: 300, width: 320, now: 1000, touch });

/** 実機の報告 2026-10-03: iPhone の Safari でシールがはがせず、図鑑に追加できなかった。 */
describe("peel gesture (iPhone Safari)", () => {
  it("a long diagonal pull peels; a short pull springs back", () => {
    const long = drag();
    movePeelDrag(long, 300 - 260, 300 - 260, Math.PI / 4);
    expect(long.p).toBeGreaterThanOrEqual(PEEL_COMMIT);
    expect(peelOutcome(long, 1400)).toBe("commit");

    const short = drag();
    movePeelDrag(short, 300 - 40, 300 - 40, Math.PI / 4);
    expect(short.p).toBeLessThan(PEEL_COMMIT);
    expect(peelOutcome(short, 1400)).toBe("settle");
  });

  it("a tap peels too (someone who taps the sticker is not stuck)", () => {
    const tap = drag();
    movePeelDrag(tap, 303, 302, Math.PI / 4);
    expect(peelOutcome(tap, 1000 + 120)).toBe("commit");
    // 長押しは写真を見ているだけ — はがさない。
    expect(peelOutcome(tap, 1000 + PEEL_TAP_MS + 200)).toBe("settle");
  });

  it("a cancelled gesture never peels", () => {
    const d = drag();
    movePeelDrag(d, 0, 0, Math.PI / 4);
    expect(peelOutcome(d, 1200, true)).toBe("settle");
  });

  it("once Touch Events track the finger, iOS's pointercancel cannot cut the pull", () => {
    const viaPointer = drag();
    expect(pointerDrives(viaPointer, 7)).toBe(true);
    expect(pointerDrives(viaPointer, 8)).toBe(false);
    const viaTouch = drag(0);
    // pointermove / pointerup / pointercancel / lostpointercapture are ignored for this drag.
    expect(pointerDrives(viaTouch, 7)).toBe(false);
    expect(pointerDrives(null, 7)).toBe(false);
  });

  it("the sticker listens to touch itself, non-passive, and stops the page from scrolling", () => {
    const peel = source("components/PeelSticker.tsx");
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"])
      expect(peel).toMatch(
        new RegExp(`addEventListener\\("${type}", \\w+, \\{ passive: false \\}\\)`),
      );
    expect(peel).toMatch(
      /if \(e\.cancelable\) e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*update\(/,
    );
    // pointer handlers go through `pointerDrives`, so a touch-tracked pull ignores pointercancel.
    expect(peel.match(/pointerDrives\(drag\.current, e\.pointerId\)/g)?.length).toBe(2);
    // 写真の読み込みの知らせが来なくても、はがせる面は出す。
    expect(peel).toMatch(/image\.onerror = done/);
    expect(peel).toMatch(/setTimeout\(done, READY_TIMEOUT\)/);
    expect(source("components/peel-sticker.css")).toMatch(
      /\.cw-peel-touch \{[^}]*touch-action: none/,
    );
  });

  it("the hidden face of a flip card is not hit-tested (iOS stacks the turned-away back on top)", () => {
    const css = source("styles.css");
    expect(css).toMatch(
      /\.card-flip:not\(\.flipped\) > \.card-back,\s*\.card-flip\.flipped > \.card-face:not\(\.card-back\) \{\s*visibility: hidden;/,
    );
  });
});

describe("adding the first catch to the Dex never waits on sound or animation", () => {
  const flow = source("components/onboarding/FirstCatchFlow.tsx");
  const catchWord = flow.slice(
    flow.indexOf("function catchWord()"),
    flow.indexOf("function account()"),
  );
  it("speech, the landing and the save each have a deadline", () => {
    expect(catchWord).toMatch(/withDeadline\(\s*Promise\.resolve\(\)\.then\(\(\) => pronounce\(/);
    expect(catchWord).toMatch(/SPEAK_DEADLINE_MS/);
    expect(catchWord).toMatch(/withDeadline\(\s*runCatchLanding\(/);
    expect(catchWord).toMatch(/LANDING_DEADLINE_MS/);
    expect(catchWord).toMatch(/SAVE_DEADLINE_MS/);
  });
  it("once saved, the Dex opens even if the animation failed or hung", () => {
    expect(catchWord).toMatch(
      /if \(saved === "failed"\) throw new Error\("FIRST_CATCH_STORAGE"\);\s*openDex\(\);/,
    );
    // openDex is idempotent: a late animation cannot pull the learner back.
    expect(catchWord).toMatch(/if \(opened \|\| !mounted\.current\) return;/);
  });
});

describe("the real-app check uses a finger on WebKit (iPhone Safari stand-in)", () => {
  const driver = readFileSync(new URL("../../e2e/real-app/run.mjs", import.meta.url), "utf8");
  it("taps and peels with touch, with iOS's pointercancel, and flags a peel that does not take", () => {
    expect(driver).toMatch(
      /const touch = browserName === "webkit" \|\| process\.env\.TOUCH === "1";/,
    );
    expect(driver).toMatch(/if \(touch\) await context\.addInitScript\(IOS_POINTER_CANCEL\);/);
    expect(driver).toMatch(/await touchDrag\(page, from, to/);
    expect(driver).toMatch(/シールがはがれない/);
    expect(driver).not.toMatch(/page\.mouse\.click\(ring\./);
  });
});
