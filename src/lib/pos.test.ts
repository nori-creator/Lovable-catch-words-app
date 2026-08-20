import { describe, expect, it } from "vitest";
import { POS_TABLE, chunkLegendFor, chunkStyle, posGroup, isNounLike } from "./pos";

describe("詞類表の記号 → 色の群", () => {
  it("表に在る記号は全部どこかの群に入る(取りこぼしが無い)", () => {
    for (const code of Object.keys(POS_TABLE)) {
      expect(() => posGroup(code)).not.toThrow();
      expect(chunkStyle(code).label).not.toBe("");
    }
  });

  it("状態動詞を動詞に落とさない", () => {
    // `Vs-attr` を `V` より先に見ないと、形容詞が全部動詞の色になる。
    for (const code of ["Vs", "Vst", "Vs-attr", "Vs-pred", "Vs-sep"]) {
      expect(posGroup(code)).toBe("vs");
    }
    expect(posGroup("Vaux")).toBe("vaux");
  });

  it("動詞の仲間はまとめて動詞", () => {
    for (const code of ["V", "Vi", "V-sep", "Vp", "Vpt", "Vp-sep"]) {
      expect(posGroup(code)).toBe("v");
    }
  });

  it("番号付き(V1 / O2)も落ちる先が同じ", () => {
    expect(posGroup("V1")).toBe(posGroup("V"));
    expect(posGroup("V2")).toBe("v");
    expect(posGroup("O1")).toBe("n");
  });

  it("**古い役割記号を壊さない**", () => {
    // production には S/V/O/M/C/P で書かれた語が既に入っている。
    // 主語と目的語はふつう名詞句なので名詞の色に落とす。
    expect(posGroup("S")).toBe("n");
    expect(posGroup("O")).toBe("n");
    expect(posGroup("P")).toBe("ptc");
    expect(posGroup("C")).toBe("prep");
    expect(posGroup("M")).toBe("m");
  });

  it("空や知らない綴りでも落ちない", () => {
    expect(posGroup("")).toBe("ptc");
    expect(posGroup("   ")).toBe("ptc");
    expect(posGroup("なんだこれ")).toBe("ptc");
  });

  it("札のクラスは色を1つの変数から取る", () => {
    // 色ごとにクラスを書き出すと Tailwind が実行時の組み立てを見つけられない。
    // `.pos-<群>` が `--pos` を決め、`.chunk-pill` がそれを使う形にしてある。
    expect(chunkStyle("Vs").pill).toBe("chunk-pill pos-vs");
    expect(chunkStyle("Vs").dot).toBe("pos-dot pos-vs");
  });
});

describe("凡例", () => {
  it("出てきた品詞だけを、詞類表の並びで出す", () => {
    const items = chunkLegendFor(["Ptc", "V", "N"]);
    expect(items.map((i) => i.key)).toEqual(["n", "v", "ptc"]);
  });

  it("同じ群が2回出ても1回しか並ばない", () => {
    expect(chunkLegendFor(["V", "Vi", "V-sep"]).map((i) => i.key)).toEqual(["v"]);
  });

  it("何も無ければ空(空の凡例だけが残らない)", () => {
    expect(chunkLegendFor([])).toEqual([]);
  });
});

/**
 * カメラのスキャンは名詞だけを返す約束(オーナー指示 2026-08-20)。
 * **プロンプトは指示であって強制ではない**ので、返ってきた物を実際に絞る。
 */
describe("isNounLike", () => {
  it("名詞は通す", () => {
    expect(isNounLike("名詞")).toBe(true);
    expect(isNounLike("固有名詞")).toBe(true);
  });

  it("動詞・形容詞・副詞は落とす", () => {
    expect(isNounLike("動詞")).toBe(false);
    expect(isNounLike("形容詞")).toBe(false);
    expect(isNounLike("副詞")).toBe(false);
    expect(isNounLike("状態動詞")).toBe(false);
  });

  it("名詞とも書いてあれば通す(写真に写っているのは物)", () => {
    expect(isNounLike("名詞・動詞")).toBe(true);
  });

  it("**札が無いものは通す。** 分からないことを理由に捨てない", () => {
    expect(isNounLike("")).toBe(true);
    expect(isNounLike(null)).toBe(true);
    expect(isNounLike(undefined)).toBe(true);
  });

  it("知らない札は通す(勝手に落とさない)", () => {
    expect(isNounLike("なにか新しい札")).toBe(true);
  });
});
