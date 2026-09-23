import { describe, expect, it } from "vitest";
import {
  acceptCategory,
  candidateQuestion,
  categoryQuestion,
  rankByWanted,
  recallQuestion,
} from "./jev-tasks";
import type { JevAnswer } from "./jev";

const choiceAns = (choice: string, confidence: number, probabilities: Record<string, number>) =>
  ({ type: "choice", choice, confidence, probabilities }) as JevAnswer;

describe("スキャンの候補の並べ替え", () => {
  it("選択肢の名前は c0, c1…（同じ語が2つでも壊れない）", () => {
    const q = candidateQuestion([
      { headword: "奶茶" },
      { headword: "奶茶", meaning: "ミルクティー" },
    ]);
    const crit = (q.questions.wanted as { criteria: Record<string, unknown> }).criteria;
    expect(Object.keys(crit)).toEqual(["c0", "c1"]);
  });

  it("見込みの高い順。同じなら元の順", () => {
    const r = rankByWanted(["a", "b", "c"], choiceAns("c2", 0.7, { c0: 0.1, c1: 0.1, c2: 0.8 }));
    expect(r!.order).toEqual([2, 0, 1]);
  });

  it("自信が低い・答えが無い・形が違うときは並べ替えない", () => {
    expect(rankByWanted(["a", "b"], choiceAns("c1", 0.2, { c0: 0.4, c1: 0.6 }))).toBeNull();
    expect(rankByWanted(["a", "b"], undefined)).toBeNull();
    expect(rankByWanted(["a", "b"], { type: "noul", noul: 0.9 })).toBeNull();
  });
});

describe("カテゴリー（「その他」に逃げたときだけ）", () => {
  it("選択肢は棚の鍵そのもの", () => {
    const q = categoryQuestion({ headword: "鍋子" }, ["kitchenware", "food", "other"]);
    const crit = (q.questions.category as { criteria: Record<string, unknown> }).criteria;
    expect(Object.keys(crit)).toEqual(["kitchenware", "food", "other"]);
  });

  it("自信が6割以上で「その他」以外のときだけ採る", () => {
    expect(acceptCategory(choiceAns("kitchenware", 0.8, { kitchenware: 0.8 }))).toBe("kitchenware");
    expect(acceptCategory(choiceAns("kitchenware", 0.5, { kitchenware: 0.5 }))).toBeNull();
    expect(acceptCategory(choiceAns("other", 0.9, { other: 0.9 }))).toBeNull();
  });
});

describe("記憶（影の実行）", () => {
  it("はい／いいえの問い1つ。この式の見込みは Jev に見せない（比べる相手なので）", () => {
    const q = recallQuestion({
      headword: "捷運",
      daysSinceLastReview: 3,
      intervalDays: 3,
      ease: 2.5,
      repetitions: 2,
      baselineRecall: 0.9,
    });
    expect(q.questions.recall.type).toBe("noul");
    expect(JSON.stringify(q.state)).not.toMatch(/0\.9|baseline/);
  });
});
