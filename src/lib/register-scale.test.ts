import { describe, it, expect } from "vitest";
import {
  clampRegisterScale,
  registerLabelKey,
  registerScaleFromTag,
  registerScaleOf,
  type RegisterScale,
} from "./register-scale";

/**
 * ここで守るのは1つ:
 * **「分からない」を「中立」に落とさない。**
 * 中立は「どちらでも使う」という主張で、知らないこととは違う。
 * 真ん中に針を置いてしまうと、読む人は言い切られたと思う。
 */
describe("registerScaleFromTag", () => {
  it("口語だけなら左端", () => {
    expect(registerScaleFromTag("口語")).toBe(-2);
    expect(registerScaleFromTag("会話でよく使う")).toBe(-2);
  });

  it("書面だけなら右端", () => {
    expect(registerScaleFromTag("書面")).toBe(2);
    expect(registerScaleFromTag("新聞で使う硬い言い方")).toBe(2);
  });

  it("両方書いてあるものだけが中立", () => {
    expect(registerScaleFromTag("口語・書面")).toBe(0);
  });

  it("**どちらとも読めない文字列は null。中立にしない**", () => {
    expect(registerScaleFromTag("よく使う")).toBeNull();
    expect(registerScaleFromTag("")).toBeNull();
    expect(registerScaleFromTag(null)).toBeNull();
    expect(registerScaleFromTag(undefined)).toBeNull();
  });
});

describe("clampRegisterScale", () => {
  it("範囲に収める", () => {
    expect(clampRegisterScale(-5)).toBe(-2);
    expect(clampRegisterScale(9)).toBe(2);
    expect(clampRegisterScale(0)).toBe(0);
  });

  it("小数は丸める", () => {
    expect(clampRegisterScale(1.4)).toBe(1);
    expect(clampRegisterScale(-1.6)).toBe(-2);
  });

  it("数でないものは null(**投げない**)", () => {
    expect(clampRegisterScale("なにか")).toBeNull();
    expect(clampRegisterScale(Number.NaN)).toBeNull();
    expect(clampRegisterScale(null)).toBeNull();
    expect(clampRegisterScale(undefined)).toBeNull();
  });
});

describe("registerScaleOf", () => {
  it("数があればそれを使う", () => {
    expect(registerScaleOf({ register_scale: -1, register_tag: "書面" })).toBe(-1);
  });

  it("数が無ければ古い文字列から写す", () => {
    expect(registerScaleOf({ register_tag: "口語" })).toBe(-2);
  });

  it("どちらも無ければ null(メーターを出さない)", () => {
    expect(registerScaleOf({})).toBeNull();
    expect(registerScaleOf({ register_scale: null, register_tag: "" })).toBeNull();
  });

  it("壊れた数でも古い文字列に落ちる", () => {
    expect(registerScaleOf({ register_scale: Number.NaN, register_tag: "書面" })).toBe(2);
  });
});

describe("registerLabelKey", () => {
  it("5段すべてに別の言葉がある(色だけに頼らないため)", () => {
    const keys = ([-2, -1, 0, 1, 2] as RegisterScale[]).map(registerLabelKey);
    expect(new Set(keys).size).toBe(5);
    for (const k of keys) expect(k.startsWith("card.reg")).toBe(true);
  });
});
