import { describe, it, expect } from "vitest";
import {
  SPINE_MAX_HEIGHT,
  SPINE_MAX_WIDTH,
  SPINE_MIN_HEIGHT,
  SPINE_MIN_WIDTH,
  SPINE_TONES,
  spineChars,
  spineHeight,
  spineInkVar,
  spineLabel,
  spineSeed,
  spineTone,
  spineToneVar,
  spineWidth,
} from "./book-spine";

/**
 * オーナー指摘「上部にリアルな本の本棚を作って、背表紙のタイトルが
 * 見えるように」の受け皿。
 *
 * 本棚らしさは**揃っていないこと**で出すが、
 * **開くたび変わってはいけない**。そこを重点的に見る。
 */

const TITLES = ["新TOCFL必考詞彙", "旅する台湾華語", "A", "커피", "日常会話 300"];

describe("spineSeed", () => {
  it("**同じ題はいつも同じ数**(開くたび棚の姿が変わらない)", () => {
    for (const t of TITLES) expect(spineSeed(t)).toBe(spineSeed(t));
  });

  it("1文字違えば違う数になる", () => {
    expect(spineSeed("単語帳A")).not.toBe(spineSeed("単語帳B"));
  });

  it("題が空でも落ちない", () => {
    expect(Number.isFinite(spineSeed(""))).toBe(true);
  });

  it("負の数を返さない(剰余が負になると色が消える)", () => {
    // 32bit を溢れさせる長い題でも 0 以上
    const long = "本".repeat(500);
    expect(spineSeed(long)).toBeGreaterThanOrEqual(0);
  });
});

describe("spineTone", () => {
  it("色は 1〜8 に収まる", () => {
    for (const t of [...TITLES, "", "本".repeat(500)]) {
      const tone = spineTone(t);
      expect(tone).toBeGreaterThanOrEqual(1);
      expect(tone).toBeLessThanOrEqual(SPINE_TONES);
    }
  });

  it("**題が違えば色も散る**(全部同じ色の棚にならない)", () => {
    const tones = new Set(Array.from({ length: 24 }, (_, i) => spineTone(`単語帳${i}`)));
    expect(tones.size).toBeGreaterThan(3);
  });
});

describe("spineToneVar / spineInkVar", () => {
  it("色は CSS のトークンで返す(素の16進を書かない)", () => {
    expect(spineToneVar(3)).toBe("var(--spine-3)");
    expect(spineInkVar(3)).toBe("var(--spine-3-ink)");
  });

  it("**範囲の外は端に寄せる**(存在しないトークンを指さない)", () => {
    expect(spineToneVar(0)).toBe("var(--spine-1)");
    expect(spineToneVar(99)).toBe(`var(--spine-${SPINE_TONES})`);
    expect(spineToneVar(Number.NaN)).toBe("var(--spine-1)");
  });
});

describe("spineHeight", () => {
  it("高さは決めた幅に収まる", () => {
    for (const t of [...TITLES, ""]) {
      expect(spineHeight(t)).toBeGreaterThanOrEqual(SPINE_MIN_HEIGHT);
      expect(spineHeight(t)).toBeLessThanOrEqual(SPINE_MAX_HEIGHT);
    }
  });

  it("同じ題はいつも同じ高さ", () => {
    expect(spineHeight("旅する台湾華語")).toBe(spineHeight("旅する台湾華語"));
  });

  it("**揃いすぎない**(色見本ではなく棚に見える)", () => {
    const hs = new Set(Array.from({ length: 24 }, (_, i) => spineHeight(`単語帳${i}`)));
    expect(hs.size).toBeGreaterThan(3);
  });

  it("**色と高さが連動しない**(同じ色の本が必ず同じ高さにならない)", () => {
    const byTone = new Map<number, Set<number>>();
    for (let i = 0; i < 200; i++) {
      const title = `単語帳${i}`;
      const tone = spineTone(title);
      if (!byTone.has(tone)) byTone.set(tone, new Set());
      byTone.get(tone)!.add(spineHeight(title));
    }
    for (const hs of byTone.values()) expect(hs.size).toBeGreaterThan(1);
  });
});

describe("spineWidth", () => {
  it("幅は決めた幅に収まる", () => {
    for (const t of [...TITLES, "", "本".repeat(500)]) {
      expect(spineWidth(t)).toBeGreaterThanOrEqual(SPINE_MIN_WIDTH);
      expect(spineWidth(t)).toBeLessThanOrEqual(SPINE_MAX_WIDTH);
    }
  });

  it("題が長い本は厚い", () => {
    expect(spineWidth("新TOCFL必考詞彙1500")).toBeGreaterThan(spineWidth("A"));
  });
});

describe("spineLabel", () => {
  it("入る題はそのまま", () => {
    expect(spineLabel("旅する台湾華語", SPINE_MAX_HEIGHT)).toBe("旅する台湾華語");
  });

  it("**入らない題は切る**(棚板を突き抜けて下の段に重ならない)", () => {
    const got = spineLabel("新TOCFL必考詞彙1500完全マスター改訂版", SPINE_MIN_HEIGHT);
    expect(got.length).toBeLessThan(20);
    expect(got.endsWith("…")).toBe(true);
  });

  it("低い棚でも**3文字は残す**(何の本か手がかりを消さない)", () => {
    expect(spineLabel("新TOCFL必考詞彙", 0).length).toBeGreaterThanOrEqual(3);
  });

  it("前後の空白は落とす", () => {
    expect(spineLabel("  旅する  ")).toBe("旅する");
  });

  it("題が無くても落ちない", () => {
    expect(spineLabel("")).toBe("");
  });
});

describe("spineChars", () => {
  it("1文字ずつに割る", () => {
    expect(spineChars("旅する")).toEqual(["旅", "す", "る"]);
  });

  it("**2つの符号で1文字になる字を割らない**(豆腐にしない)", () => {
    // 𠮟(U+20B9F)は2つの符号で1文字
    expect(spineChars("𠮟る")).toEqual(["𠮟", "る"]);
    expect(spineChars("📕")).toEqual(["📕"]);
  });

  it("欧文も1文字ずつ立つ(背表紙の `T O C F L`)", () => {
    expect(spineChars("TOCFL")).toEqual(["T", "O", "C", "F", "L"]);
  });

  it("空でも落ちない", () => {
    expect(spineChars("")).toEqual([]);
  });
});
