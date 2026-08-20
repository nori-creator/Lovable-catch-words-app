import { describe, it, expect } from "vitest";
import { normalizePhotoPref, resolvePrefer } from "./photo-pref";

describe("normalizePhotoPref", () => {
  it("使える値だけを通す", () => {
    for (const v of ["auto", "object", "cutout", "selfie", "placeholder"]) {
      expect(normalizePhotoPref(v)).toBe(v);
    }
  });

  // **保存されている値が古くても画面を壊さない。**
  it.each([null, undefined, "", "CUTOUT", "写真", 0, 1, true, {}, []])(
    "%p は auto に落ちる",
    (bad) => {
      expect(normalizePhotoPref(bad)).toBe("auto");
    },
  );
});

describe("resolvePrefer", () => {
  it("既定(auto)なら画面の意図をそのまま通す", () => {
    expect(resolvePrefer("auto", "cutout")).toBe("cutout");
    expect(resolvePrefer("auto", "selfie")).toBe("selfie");
    expect(resolvePrefer("auto", null)).toBeNull();
    expect(resolvePrefer("auto")).toBeNull();
  });

  it("人が選んだら、そちらが画面の意図に勝つ", () => {
    expect(resolvePrefer("object", "cutout")).toBe("object");
    expect(resolvePrefer("selfie", "cutout")).toBe("selfie");
    expect(resolvePrefer("cutout", "selfie")).toBe("cutout");
  });

  it("壊れた設定は画面の意図に落ちる(今まで通りになる)", () => {
    expect(resolvePrefer(null, "cutout")).toBe("cutout");
    expect(resolvePrefer("きりぬき", "cutout")).toBe("cutout");
  });
});
