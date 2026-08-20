import { describe, it, expect } from "vitest";
import { pickAreaName, pickPlaceName, placeLine, type GeocodeResult } from "./place-name";

/**
 * オーナー指摘:「最も具体的な地名を書いて。今は Taipei City みたいに
 * 英語であいまいな地名になってる」。
 *
 * 元の選び方は行政区画しか見ていなかったので、区が取れない点では
 * **市の名前**(直径20km)に落ちていた。
 */

const comp = (long_name: string, ...types: string[]) => ({ long_name, types });

/** 士林夜市の前で撮った、という想定の答え。 */
const SHILIN: GeocodeResult[] = [
  {
    address_components: [
      comp("士林夜市", "point_of_interest", "establishment"),
      comp("基河路", "route"),
      comp("士林區", "sublocality_level_1", "sublocality"),
      comp("台北市", "locality"),
      comp("台湾", "country"),
      comp("111", "postal_code"),
    ],
  },
];

describe("pickPlaceName", () => {
  it("目印が在れば目印を採る", () => {
    expect(pickPlaceName(SHILIN)).toBe("士林夜市");
  });

  it("目印が無ければ道、それも無ければ小さい区", () => {
    const noPoi: GeocodeResult[] = [
      { address_components: [comp("基河路", "route"), comp("台北市", "locality")] },
    ];
    expect(pickPlaceName(noPoi)).toBe("基河路");
    const onlyArea: GeocodeResult[] = [
      { address_components: [comp("士林區", "sublocality_level_1"), comp("台北市", "locality")] },
    ];
    expect(pickPlaceName(onlyArea)).toBe("士林區");
  });

  /** **これが指摘そのもの。** 市まで落ちるのは最後の手段。 */
  it("何も無ければ市に落ちる(が、それが最後)", () => {
    const cityOnly: GeocodeResult[] = [
      { address_components: [comp("Taipei City", "locality"), comp("Taiwan", "country")] },
    ];
    expect(pickPlaceName(cityOnly)).toBe("Taipei City");
  });

  /** **国名だけを返すぐらいなら、何も言わない。** */
  it("国名・郵便番号・番地は名前にしない", () => {
    const junk: GeocodeResult[] = [
      {
        address_components: [
          comp("台湾", "country"),
          comp("111", "postal_code"),
          comp("3", "street_number"),
          comp("台北市", "administrative_area_level_2"),
        ],
      },
    ];
    expect(pickPlaceName(junk)).toBeNull();
  });

  it("数字だけの名前は捨てる", () => {
    const numeric: GeocodeResult[] = [
      { address_components: [comp("110", "route"), comp("士林區", "sublocality_level_1")] },
    ];
    expect(pickPlaceName(numeric)).toBe("士林區");
  });

  it("空・null でも落ちない", () => {
    expect(pickPlaceName(null)).toBeNull();
    expect(pickPlaceName(undefined)).toBeNull();
    expect(pickPlaceName([])).toBeNull();
    expect(pickPlaceName([{}])).toBeNull();
    expect(pickPlaceName([{ address_components: [comp("  ", "route")] }])).toBeNull();
  });

  it("具体的な答えが後ろに来ていても拾う", () => {
    const reversed: GeocodeResult[] = [
      { address_components: [comp("台北市", "locality")] },
      { address_components: [comp("士林夜市", "point_of_interest")] },
    ];
    expect(pickPlaceName(reversed)).toBe("士林夜市");
  });
});

describe("pickAreaName", () => {
  it("広い名前だけを取る", () => {
    expect(pickAreaName(SHILIN)).toBe("士林區");
  });
  it("区が無ければ市", () => {
    expect(pickAreaName([{ address_components: [comp("台北市", "locality")] }])).toBe("台北市");
  });
});

describe("placeLine", () => {
  it("目印と区を並べる", () => {
    expect(placeLine("士林夜市", "士林區")).toBe("士林夜市（士林區）");
  });

  /** **同じ物を2度言わない。** */
  it.each([
    ["士林區", "士林區"],
    ["士林夜市", "士林夜市"],
  ])("同じ名前なら1つだけ (%s / %s)", (a, b) => {
    expect(placeLine(a, b)).toBe(a);
  });

  it("片方が他方に含まれていたら1つだけ", () => {
    expect(placeLine("士林區公所", "士林區")).toBe("士林區公所");
  });

  it("片方しか無ければそれだけ", () => {
    expect(placeLine(null, "士林區")).toBe("士林區");
    expect(placeLine("士林夜市", null)).toBe("士林夜市");
    expect(placeLine(null, null)).toBeNull();
    expect(placeLine("", "")).toBeNull();
  });
});
