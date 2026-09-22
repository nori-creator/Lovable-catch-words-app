import { describe, expect, it } from "vitest";
import { decorFor } from "./collage-decor";

const ids = Array.from({ length: 60 }, (_, i) => `sticker-${i}`);

describe("写真を壁にどう留めるか", () => {
  it("**何度描いても同じ**（描き直すたびにテープが動かない）", () => {
    for (const id of ids) expect(decorFor(id)).toEqual(decorFor(id));
  });

  it("**テープと四隅が混ざる**（全部同じだと貼り物の並び、全部違うと散らかる）", () => {
    const kinds = ids.map((id) => decorFor(id).kind);
    const tape = kinds.filter((k) => k === "tape").length;
    expect(tape).toBeGreaterThan(ids.length * 0.4);
    expect(tape).toBeLessThan(ids.length * 0.8);
  });

  it("角のテープは角を押さえる向きに傾く", () => {
    for (const id of ids) {
      const d = decorFor(id);
      if (d.kind !== "tape") continue;
      for (const t of d.tapes) {
        if (t.spot === "corner-tl") expect(t.rot).toBeLessThan(-25);
        if (t.spot === "corner-tr") expect(t.rot).toBeGreaterThan(25);
        if (t.spot === "top") expect(Math.abs(t.rot)).toBeLessThanOrEqual(5);
      }
    }
  });
});
