import { describe, expect, it } from "vitest";
import { toggleHidden } from "./album-hidden";

/** 2026-09-28「ホームアルバムだけから消して。またあとから戻すこともできるようにして」。 */
describe("アルバムから外す・戻す", () => {
  it("外すと集合に入り、戻すと抜ける。元の集合は書き換えない", () => {
    const a = new Set(["x"]);
    const b = toggleHidden(a, "y", true);
    expect([...b].sort()).toEqual(["x", "y"]);
    expect([...a]).toEqual(["x"]);
    expect([...toggleHidden(b, "x", false)]).toEqual(["y"]);
  });
});
