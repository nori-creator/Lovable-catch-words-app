import { describe, it, expect } from "vitest";
import { SECTION_IDS } from "./card-sections";
import {
  BADGE_ICON_NAME,
  SECTION_ICON_NAME,
  everySectionHasIcon,
  sectionIconName,
} from "./section-icon";

/**
 * 節の目印(オーナー指示 2026-08-28 ⑧「鮮やかな青い丸のアイコンに統一」)。
 *
 * ここで守るのは**目印としての約束**だけ:
 *   ・節が増えた日に、絵の無い節が黙って出ない
 *   ・同じ絵が2つの節に付かない(付いたら目印にならない)
 * 絵そのものの見た目は絵の検査(`ui:audit`)の仕事。
 */

describe("SECTION_ICON_NAME", () => {
  it("**すべての節に絵が付いている**(節を足した日に忘れない)", () => {
    const missing = SECTION_IDS.filter((id) => !SECTION_ICON_NAME[id]);
    expect(missing).toEqual([]);
    expect(everySectionHasIcon()).toBe(true);
  });

  it("**同じ絵を2つの節に付けない**(絵から節が分からなくなる)", () => {
    const used = SECTION_IDS.map((id) => SECTION_ICON_NAME[id]);
    const dupes = used.filter((n, i) => used.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("余分な鍵を持たない(消した節の絵が残らない)", () => {
    expect(Object.keys(SECTION_ICON_NAME).sort()).toEqual([...SECTION_IDS].sort());
  });

  it("知らない節でも落ちない", () => {
    // 型では防いであるが、保存してある古い設定から来ることが在る。
    expect(sectionIconName("meaning")).toBe("BookOpen");
    expect(sectionIconName("nope" as never)).toBe("BookOpen");
  });
});

describe("BADGE_ICON_NAME（節ではない所も同じ丸で出す）", () => {
  it("節と同じ名前の集合から選んでいる", () => {
    // `satisfies` で型は縛ってあるが、**名前が実在するか**は
    // `SectionIcon.tsx` の表と突き合わせないと分からない。ここでは
    // 「節でも使っている名前のどれか」であることだけを確かめる。
    const known = new Set(Object.values(SECTION_ICON_NAME));
    for (const [role, name] of Object.entries(BADGE_ICON_NAME)) {
      expect([role, known.has(name)]).toEqual([role, true]);
    }
  });
});
