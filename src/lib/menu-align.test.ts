import { describe, it, expect } from "vitest";
import { pickMenuSide, MENU_EDGE_MARGIN } from "./menu-align";

/**
 * 「図鑑の絞り込みの札が画面の外で切れる」の受け皿。
 * `position:absolute` の切れ方は**横スクロールを作らない**ので、
 * 数の検査では捕まらない。ここで捕まえる。
 */

const VIEW = 390; // よくある電話の幅

describe("pickMenuSide", () => {
  it("左端のボタンは**左揃え**(右揃えにすると画面の外へ出る)", () => {
    expect(pickMenuSide({ left: 16, right: 126, width: 224, viewport: VIEW })).toBe("left");
  });

  it("右端のボタンは**右揃え**(左揃えにすると画面の外へ出る)", () => {
    expect(pickMenuSide({ left: 280, right: 374, width: 224, viewport: VIEW })).toBe("right");
  });

  it("真ん中は左揃え(収まるなら読む向きと同じ側)", () => {
    expect(pickMenuSide({ left: 120, right: 220, width: 160, viewport: VIEW })).toBe("left");
  });

  it("**縁ぎりぎりは収まらない扱い**(端に貼り付けない)", () => {
    // 左揃えで右端ちょうどに着く = 余白が無い → 右へ倒す
    expect(pickMenuSide({ left: VIEW - 224, right: VIEW - 8, width: 224, viewport: VIEW })).toBe(
      "right",
    );
    // 余白ぶん内側なら左のまま
    expect(
      pickMenuSide({
        left: VIEW - 224 - MENU_EDGE_MARGIN,
        right: VIEW - 8,
        width: 224,
        viewport: VIEW,
      }),
    ).toBe("left");
  });

  it("**どちらも収まらないときは左**(いつも同じ側から読める)", () => {
    expect(pickMenuSide({ left: 100, right: 200, width: 500, viewport: VIEW })).toBe("left");
  });

  it("余白は変えられる", () => {
    const box = { left: VIEW - 224, right: VIEW - 8, width: 224, viewport: VIEW };
    expect(pickMenuSide({ ...box, margin: 0 })).toBe("left");
  });

  it("画面いっぱいのボタンでも落ちない", () => {
    expect(pickMenuSide({ left: 0, right: VIEW, width: 224, viewport: VIEW })).toBe("left");
  });
});
