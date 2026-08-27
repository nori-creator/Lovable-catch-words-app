import { describe, it, expect } from "vitest";
import { examTagLabels, MAX_EXAM_TAGS } from "./exam-tags";

/**
 * オーナー指摘 2026-08-27 ⑭「TOCFL の外の単語の場合どのように分類表示するか」。
 *
 * 級外の語に「級が無い」としか言わないと、TOEFL の語も知らなくていい語も
 * 同じ顔で並ぶ。分かっている事実（どの試験に出るか）のほうを出す。
 */
describe("examTagLabels", () => {
  it("知っている印を読める札に直す", () => {
    expect(examTagLabels(["toefl", "gre"])).toEqual(["TOEFL", "GRE"]);
  });

  it("**並びは辞書の順に依らない**(同じ語で札の順が変わって見えない)", () => {
    expect(examTagLabels(["gre", "ielts", "toefl"])).toEqual(["TOEFL", "IELTS", "GRE"]);
  });

  it("知らない印は落とす(生の綴りを画面に出さない)", () => {
    expect(examTagLabels(["toefl", "cet6plus", "???"])).toEqual(["TOEFL"]);
  });

  it("大文字・空白の揺れを吸う", () => {
    expect(examTagLabels([" TOEFL ", "Gre"])).toEqual(["TOEFL", "GRE"]);
  });

  it("上限で切る(8つ並ぶと札ではなく壁になる)", () => {
    const all = ["toefl", "ielts", "gre", "cet4", "cet6", "zk", "gk", "ky"];
    expect(examTagLabels(all)).toHaveLength(MAX_EXAM_TAGS);
    expect(examTagLabels(all)[0]).toBe("TOEFL");
  });

  it("空・null でも落ちない", () => {
    expect(examTagLabels(null)).toEqual([]);
    expect(examTagLabels(undefined)).toEqual([]);
    expect(examTagLabels([])).toEqual([]);
    expect(examTagLabels(["", "  "])).toEqual([]);
  });
});
