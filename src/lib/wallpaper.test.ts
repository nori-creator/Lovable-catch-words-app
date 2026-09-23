import { describe, expect, it } from "vitest";
import { WALLPAPERS, parseWallpaper, wallClass } from "./wallpaper";

describe("ホームの壁紙", () => {
  it("紙・ノート・実際の壁・額・コルク（画鋲）の5つ", () => {
    expect(WALLPAPERS.map((w) => w.id)).toEqual(["paper", "notebook", "wall", "frame", "cork"]);
  });
  it("知らない値・前の版に無い値は紙", () => {
    expect(parseWallpaper("stars")).toBe("paper");
    expect(parseWallpaper(null)).toBe("paper");
    expect(parseWallpaper("cork")).toBe("cork");
  });
  it("選択子", () => {
    expect(wallClass("wall")).toBe("album-bg-wall");
  });
});
