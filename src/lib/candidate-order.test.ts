import { describe, expect, it } from "vitest";
import { orderByRegister } from "./candidate-order";

describe("候補の並び（ふだんの呼び方を上に。2026-09-27）", () => {
  it("ふだんの呼び方 → 正確な名前 → 固有名詞。消さない", () => {
    const out = orderByRegister([
      { h: "女王頭", register: "proper" as const },
      { h: "文旦", register: "specific" as const },
      { h: "柚子", register: "common" as const },
      { h: "奇岩", register: "common" as const },
    ]);
    expect(out.map((x) => x.h)).toEqual(["柚子", "奇岩", "文旦", "女王頭"]);
  });
  it("印が無い候補は、ふだんの呼び方として扱い、AI の順を保つ", () => {
    const out = orderByRegister([
      { h: "三杯雞" },
      { h: "滷肉飯" },
      { h: "卡車帽", register: "specific" as const },
    ]);
    expect(out.map((x) => x.h)).toEqual(["三杯雞", "滷肉飯", "卡車帽"]);
  });
});
