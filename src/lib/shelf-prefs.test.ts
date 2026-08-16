import { describe, it, expect } from "vitest";
import { SHELF_STYLES, STYLE_SPEC, spineColor } from "./shelf-prefs";

/**
 * 棚の見え方の設定。
 *
 * 背表紙の色は「見た目の好み」ではなく**読めるかどうかの制約**を背負って
 * いる。白い文字を載せるので、いちばん明るくなる色相でも 4.5:1 を超えて
 * いなければならない。最初 38% の明度で作って 3.9:1 まで落ち、検査に
 * 落とされた。数字を上げるときは必ずここが止める。
 */

/** 背表紙の色は**棚(カテゴリー)**から決まる。語からではない。 */
const DAY_ONE_CATEGORIES = ["fruit", "vehicle", "drink", "shop", "tool", "plant", "a", ""];

function parseHsl(css: string): { h: number; s: number; l: number } {
  const m = css.match(/hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)/);
  if (!m) throw new Error(`hsl として読めない: ${css}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** WCAG の相対輝度。 */
function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** 白い文字とのコントラスト比。背の丸みのハイライト(白10%)込み。 */
function contrastWithWhite(h: number, s: number, l: number, gloss = 0.1): number {
  const [r, g, b] = hslToRgb(h, s, l);
  const mix = (c: number) => c * (1 - gloss) + 255 * gloss;
  return 1.05 / (luminance(mix(r), mix(g), mix(b)) + 0.05);
}

describe("spineColor", () => {
  it("同じ棚はいつも同じ色", () => {
    // 開くたびに色が変わったら「あの青い棚」で覚えられない。
    for (const w of DAY_ONE_CATEGORIES) {
      expect(spineColor(w)).toBe(spineColor(w));
    }
  });

  it("違う棚はだいたい違う色になる", () => {
    const colors = new Set(DAY_ONE_CATEGORIES.map(spineColor));
    expect(colors.size).toBeGreaterThan(DAY_ONE_CATEGORIES.length - 2);
  });

  it("**違う部屋の棚は色相が離れている**", () => {
    // カテゴリーのハッシュで色相を決めていたとき、果物(食べる)と
    // 乗り物(街)が同じ紫になった。54個を360度に散らせば当然衝突する。
    // 部屋で等分するようにしたので、部屋が違えば必ず離れる。
    const fruit = parseHsl(spineColor("fruit")).h;
    const vehicle = parseHsl(spineColor("vehicle")).h;
    const gap = Math.abs(fruit - vehicle);
    expect(Math.min(gap, 360 - gap), `果物 ${fruit}度 / 乗り物 ${vehicle}度`).toBeGreaterThan(15);
  });

  it("同じ部屋の棚はほぼ同じ色(部屋がひとつの帯として読める)", () => {
    const fruit = parseHsl(spineColor("fruit")).h;
    const drink = parseHsl(spineColor("drink")).h;
    const gap = Math.abs(fruit - drink);
    expect(Math.min(gap, 360 - gap)).toBeLessThanOrEqual(20);
  });

  it("どの色相でも白い文字が 4.5:1 を割らない", () => {
    // 色相だけ振って彩度と明度は固定にしている前提。360通り全部見る。
    const { s, l } = parseHsl(spineColor("芒果"));
    for (let h = 0; h < 360; h++) {
      const ratio = contrastWithWhite(h, s, l);
      expect(ratio, `色相 ${h} で ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("彩度と明度は棚によらず一定(並べたとき帯として揃う)", () => {
    const first = parseHsl(spineColor(DAY_ONE_CATEGORIES[0]));
    for (const w of DAY_ONE_CATEGORIES) {
      const c = parseHsl(spineColor(w));
      expect(c.s).toBe(first.s);
      expect(c.l).toBe(first.l);
    }
  });
});

describe("STYLE_SPEC", () => {
  it("すべての見え方に定義がある", () => {
    for (const v of SHELF_STYLES) {
      expect(STYLE_SPEC[v].perShelf).toBeGreaterThan(0);
    }
  });

  it("いちばん狭い端末(320px)でも1つ44pxを割らない", () => {
    // 44px はタップ領域の下限(§10)。背表紙を8列にして43pxになり、
    // 検査に落とされたことがある。ここでも止める。
    const SCREEN = 320;
    const PADDING = 32; // px-4 の左右
    for (const v of SHELF_STYLES) {
      const { perShelf, spines } = STYLE_SPEC[v];
      const gap = spines ? 2 : 12; // shelf-row-tight は 2px, 既定は .75rem
      const each = (SCREEN - PADDING - gap * (perShelf - 1)) / perShelf;
      expect(each, `${v}(${perShelf}列)で ${each.toFixed(1)}px`).toBeGreaterThanOrEqual(44);
    }
  });

  it("背表紙で並べる見え方はひとつだけ(表示形式は密度と別の軸)", () => {
    // もとは「2列 / 3列 / 4列 / 背表紙」が同じ帯に並んでいて、
    // 密度と表示形式という**分類の違うもの**が混ざっていた。
    expect(SHELF_STYLES.filter((v) => STYLE_SPEC[v].spines)).toEqual(["library"]);
  });
});
