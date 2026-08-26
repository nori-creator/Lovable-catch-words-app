import { describe, expect, it, beforeEach, vi } from "vitest";
import { surfaceKey, getSurfaceRole, setSurfaceRole, resolveSurfaceRole } from "./photo-surface";

describe("surfaceKey — 画面をまたいで混ざらない", () => {
  it("同じ札でも画面が違えば別の鍵", () => {
    expect(surfaceKey("album", "s1")).not.toBe(surfaceKey("detail", "s1"));
  });
  it("同じ画面・同じ札なら同じ鍵", () => {
    expect(surfaceKey("album", "s1")).toBe(surfaceKey("album", "s1"));
  });
});

describe("resolveSurfaceRole — 強い順に3つ", () => {
  it("その画面で選んだ物がいちばん強い", () => {
    expect(
      resolveSurfaceRole({ surfaceRole: "selfie", heroRole: "cutout", screenIntent: "object" }),
    ).toBe("selfie");
  });
  it("次に、その札の共通の選択", () => {
    expect(resolveSurfaceRole({ heroRole: "cutout", screenIntent: "object" })).toBe("cutout");
  });
  it("最後に画面の意図", () => {
    expect(resolveSurfaceRole({ screenIntent: "cutout" })).toBe("cutout");
  });
  it("何も無ければ null(呼ぶ側の既定に任せる)", () => {
    expect(resolveSurfaceRole({})).toBeNull();
    expect(
      resolveSurfaceRole({ surfaceRole: null, heroRole: null, screenIntent: null }),
    ).toBeNull();
  });
  it("**知らない `hero_role` は無視する**(古い値で落ちない)", () => {
    expect(resolveSurfaceRole({ heroRole: "banana", screenIntent: "cutout" })).toBe("cutout");
    expect(resolveSurfaceRole({ heroRole: "", screenIntent: "object" })).toBe("object");
  });
});

describe("端末に憶える", () => {
  // 本物の DOM は使わない(この作業場の他の設定の試験と同じ形)。
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { dispatchEvent: () => true });
  });

  it("画面ごとに別々に憶える", () => {
    setSurfaceRole("album", "s1", "cutout");
    setSurfaceRole("detail", "s1", "object");
    expect(getSurfaceRole("album", "s1")).toBe("cutout");
    expect(getSurfaceRole("detail", "s1")).toBe("object");
  });

  it("札ごとに別々に憶える", () => {
    setSurfaceRole("album", "s1", "cutout");
    expect(getSurfaceRole("album", "s2")).toBeNull();
  });

  it("選んでいなければ null", () => {
    expect(getSurfaceRole("album", "nope")).toBeNull();
  });

  it("**壊れた値で落ちない**(選択が消えるだけ)", () => {
    store.set("photo-surface-role-v1", "{{{ not json");
    expect(getSurfaceRole("album", "s1")).toBeNull();
    // 書き直せば元どおり動く。
    setSurfaceRole("album", "s1", "selfie");
    expect(getSurfaceRole("album", "s1")).toBe("selfie");
  });

  it("知らない役は読み捨てる", () => {
    store.set(
      "photo-surface-role-v1",
      JSON.stringify({ "album:s1": "banana", "album:s2": "cutout" }),
    );
    expect(getSurfaceRole("album", "s1")).toBeNull();
    expect(getSurfaceRole("album", "s2")).toBe("cutout");
  });
});
