import { describe, expect, it } from "vitest";
import { memoryBadgeMap } from "./memory-badge";
import { memoryOf } from "./memory";

describe("札の画像の右上に出す記憶の印", () => {
  const w = { sticker_id: "a", retention: 97, interval_days: 3, ease: 2.5 };

  it("**復習の一覧と同じ関数で出す**（同じ語なら同じ段・同じ %）", () => {
    const got = memoryBadgeMap([w]).get("a");
    expect(got).toEqual(memoryOf(w));
  });

  it("復習の記録が無い札には印を出さない", () => {
    expect(memoryBadgeMap([w]).get("zzz")).toBeUndefined();
    expect(memoryBadgeMap(undefined).size).toBe(0);
  });

  it("壊れた値の札には印を出さない（NaN% を出さない）", () => {
    const m = memoryBadgeMap([{ ...w, sticker_id: "b", retention: Number.NaN }]);
    expect(m.has("b")).toBe(false);
  });
});
