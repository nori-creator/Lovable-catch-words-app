import { describe, expect, it } from "vitest";
import { boxCenter, validBox2d, withObjectPoints } from "./suggestion-position";

describe("validBox2d", () => {
  it("keeps a [ymin, xmin, ymax, xmax] box on the 0-1000 scale (rounded)", () => {
    expect(validBox2d([100, 200, 300.4, 400.6])).toEqual([100, 200, 300, 401]);
  });

  it("drops anything that is not four numbers inside the photo with a size", () => {
    expect(validBox2d(undefined)).toBeNull();
    expect(validBox2d([1, 2, 3])).toBeNull();
    expect(validBox2d([100, 200, "300", 400])).toBeNull();
    expect(validBox2d([100, 200, 1300, 400])).toBeNull();
    expect(validBox2d([-1, 200, 300, 400])).toBeNull();
    expect(validBox2d([300, 200, 100, 400])).toBeNull();
    expect(validBox2d([100, 400, 300, 400])).toBeNull();
  });
});

describe("boxCenter", () => {
  it("is [x, y] (the order the iOS app reads), not Gemini's [y, x]", () => {
    expect(boxCenter([100, 600, 300, 1000])).toEqual([800, 200]);
  });
});

describe("withObjectPoints", () => {
  it("gives every name of one object that object's box and centre point", () => {
    const out = withObjectPoints([
      { headword: "珍珠奶茶", group: 0, box_2d: [400, 100, 900, 300] },
      { headword: "機車", group: 1, box_2d: [200, 500, 800, 1000] },
      // The other name of the bubble tea came without a box (the prompt allows that).
      { headword: "珍奶", group: 0 },
    ]);
    expect(out.map((s) => s.point)).toEqual([
      [200, 650],
      [750, 500],
      [200, 650],
    ]);
    expect(out[2].box_2d).toEqual([400, 100, 900, 300]);
  });

  it("uses the object's first valid box even when a later name carries another one", () => {
    const out = withObjectPoints([
      { headword: "杯子", group: 2, box_2d: [0, 0, 100, 100] },
      { headword: "馬克杯", group: 2, box_2d: [500, 500, 900, 900] },
    ]);
    expect(out[1].point).toEqual([50, 50]);
  });

  it("leaves names without a usable box (or without a group and box) unpositioned", () => {
    const out = withObjectPoints([
      { headword: "桌子", group: 3, box_2d: [500, 500, 400, 900] },
      { headword: "招牌" },
      { headword: "傘", box_2d: [0, 0, 500, 500] },
    ]);
    expect(out[0]).not.toHaveProperty("point");
    expect(out[0]).not.toHaveProperty("box_2d");
    expect(out[1]).not.toHaveProperty("point");
    expect(out[2].point).toEqual([250, 250]);
  });
});
