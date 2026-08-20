import { describe, it, expect } from "vitest";
import {
  atLeastOnce,
  blendPerMillion,
  estimateEncounter,
  perMillionFromRank,
  rarityStars,
  regionFactor,
  representativeRank,
  sceneOverlap,
  seasonFactor,
  shrinkToObserved,
  weeklyEncounterRate,
} from "./rarity";

/**
 * この式は画面に**確率**として出る。数字は言い切りなので、
 * 「それらしい値」では足りない。試験で押さえるのは4つ:
 *
 *   1. 向きが正しい(レアな語ほど低い、季節外れなら下がる…)
 *   2. **実測が事前を押しのける**(これが「限界まで正確」の意味)
 *   3. 確率は必ず 0〜1
 *   4. 壊れた入力でも **NaN を出さない**(数字が出ない < 嘘の数字が出る)
 */

describe("representativeRank", () => {
  it("級が上がるほど順位は後ろへ", () => {
    const ranks = [1, 2, 3, 4, 5, 6].map((l) => representativeRank(l));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });

  it("範囲の外の級でも落ちない", () => {
    expect(representativeRank(0)).toBeGreaterThan(0);
    expect(representativeRank(99)).toBeGreaterThan(0);
    expect(Number.isFinite(representativeRank(Number.NaN))).toBe(true);
  });
});

describe("perMillionFromRank", () => {
  it("順位が後ろになるほど頻度は下がる(単調)", () => {
    const a = perMillionFromRank(10);
    const b = perMillionFromRank(1000);
    const c = perMillionFromRank(50_000);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it("全順位を足すとおよそ百万になる(正規化が効いている)", () => {
    // 小さい形で確かめる。大きい形と同じ式なので、これで十分。
    const shape = { s: 1.0, b: 2.7, n: 1000 };
    let sum = 0;
    for (let r = 1; r <= 1000; r++) sum += perMillionFromRank(r, shape);
    expect(sum).toBeGreaterThan(999_000);
    expect(sum).toBeLessThan(1_001_000);
  });

  it("壊れた形でも NaN を出さない", () => {
    expect(Number.isFinite(perMillionFromRank(Number.NaN))).toBe(true);
    expect(Number.isFinite(perMillionFromRank(5, { s: Number.NaN, b: -1, n: 0 }))).toBe(true);
  });
});

describe("blendPerMillion", () => {
  it("観測が無ければ推定をそのまま返す", () => {
    const r = blendPerMillion(0, 0, 42);
    expect(r.perMillion).toBe(42);
    expect(r.confidence).toBe("estimate");
  });

  it("観測が薄いうちは推定寄り、厚くなると観測へ寄る", () => {
    // 観測では 1000/百万、推定では 10/百万。
    const thin = blendPerMillion(1, 1_000, 10, 50_000);
    const thick = blendPerMillion(50, 50_000, 10, 50_000);
    expect(thin.perMillion).toBeLessThan(thick.perMillion);
    expect(thin.confidence).toBe("blended");
    expect(thick.confidence).toBe("measured");
  });
});

describe("sceneOverlap", () => {
  it("データが無ければ 1(理由もなく下げない)", () => {
    expect(sceneOverlap(null, null)).toBe(1);
    expect(sceneOverlap({ a: 1 }, null)).toBe(1);
  });

  it("一様どうしなら 1(場面を持つ語だけが損をしない)", () => {
    const w = { a: 0.25, b: 0.25, c: 0.25, d: 0.25 };
    expect(sceneOverlap(w, w)).toBeCloseTo(1, 6);
  });

  it("よく居る場所に出る語は上がり、行かない場所の語は下がる", () => {
    const word = { 夜市: 0.8, 新聞: 0.2 };
    const nightMarketGoer = { 夜市: 0.9, 新聞: 0.1 };
    const newspaperReader = { 夜市: 0.05, 新聞: 0.95 };
    expect(sceneOverlap(word, nightMarketGoer)).toBeGreaterThan(1);
    expect(sceneOverlap(word, newspaperReader)).toBeLessThan(1);
  });

  it("重なりが皆無でも 0 にしない(絶対に出会わないとは言えない)", () => {
    expect(sceneOverlap({ 夜市: 1 }, { 新聞: 1 })).toBeGreaterThan(0);
  });
});

describe("seasonFactor", () => {
  it("通年なら常に 1", () => {
    expect(seasonFactor(null, 3)).toBe(1);
    expect(seasonFactor([], 3)).toBe(1);
  });

  it("**旬の月なら 1、外れれば下がる**", () => {
    const mango = [5, 6, 7, 8];
    expect(seasonFactor(mango, 6)).toBe(1);
    expect(seasonFactor(mango, 1)).toBeLessThan(1);
  });
});

describe("regionFactor", () => {
  it("限定が無ければ 1", () => {
    expect(regionFactor(null, "台北")).toBe(1);
  });

  it("同じ地域なら 1、外なら大きく下がる", () => {
    expect(regionFactor("台南", "台南市")).toBe(1);
    expect(regionFactor("台南", "台北")).toBeLessThan(0.2);
  });

  it("**居場所が分からないときは下げない**(知らないことを決めつけない)", () => {
    expect(regionFactor("台南", null)).toBe(1);
    expect(regionFactor("台南", "")).toBe(1);
  });
});

describe("atLeastOnce", () => {
  it("0 なら 0、大きくなるほど 1 に近づく", () => {
    expect(atLeastOnce(0)).toBe(0);
    expect(atLeastOnce(1)).toBeCloseTo(0.632, 2);
    expect(atLeastOnce(100)).toBeCloseTo(1, 6);
  });

  it("必ず 0〜1", () => {
    for (const v of [-5, Number.NaN, Infinity, 1e9]) {
      const p = atLeastOnce(v);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("shrinkToObserved", () => {
  it("誰も居なければ事前のまま", () => {
    const r = shrinkToObserved({ priorP: 0.3, caughtUsers: 0, activeUsers: 0 });
    expect(r.p).toBeCloseTo(0.3, 6);
    expect(r.confidence).toBe("estimate");
  });

  it("名乗りの境目は「事前の重みが2割を切ったら」= n ≥ 4κ", () => {
    const kappa = 20;
    expect(
      shrinkToObserved({ priorP: 0.5, caughtUsers: 0, activeUsers: 79, weight: kappa }).confidence,
    ).toBe("blended");
    expect(
      shrinkToObserved({ priorP: 0.5, caughtUsers: 0, activeUsers: 80, weight: kappa }).confidence,
    ).toBe("measured");
  });

  it("**人が増えるほど実測へ寄る**(ここがこの式の芯)", () => {
    // 事前は 0.9 と言っているが、実際は 100人中10人しか撮っていない。
    const few = shrinkToObserved({ priorP: 0.9, caughtUsers: 1, activeUsers: 10 });
    const many = shrinkToObserved({ priorP: 0.9, caughtUsers: 100, activeUsers: 1000 });
    expect(few.p).toBeGreaterThan(many.p); // 事前から離れていく
    expect(many.p).toBeCloseTo(0.1, 1); // 実測(10%)に近づく
    expect(many.confidence).toBe("measured");
  });

  it("撮った人が活動者数を超えても壊れない", () => {
    const r = shrinkToObserved({ priorP: 0.5, caughtUsers: 999, activeUsers: 10 });
    expect(r.p).toBeGreaterThanOrEqual(0);
    expect(r.p).toBeLessThanOrEqual(1);
    expect(r.observedUsers).toBe(10);
  });

  it("壊れた入力でも 0〜1", () => {
    const r = shrinkToObserved({
      priorP: Number.NaN,
      caughtUsers: -5,
      activeUsers: Number.NaN,
      weight: 0,
    });
    expect(Number.isFinite(r.p)).toBe(true);
    expect(r.p).toBeGreaterThanOrEqual(0);
    expect(r.p).toBeLessThanOrEqual(1);
  });
});

describe("rarityStars", () => {
  it("確率が下がるほど星は増える(★5 が最もレア)", () => {
    const stars = [0.95, 0.7, 0.45, 0.25, 0.05].map(rarityStars);
    for (let i = 1; i < stars.length; i++) {
      expect(stars[i]).toBeGreaterThanOrEqual(stars[i - 1]);
    }
    expect(stars[0]).toBe(1);
    expect(stars[4]).toBe(5);
  });

  it("**5段すべてが実際に出る**(このアプリが持つ1〜6級で)", () => {
    // 前は確率で切っていて、1〜3級が全部★1に潰れ★4★5がほぼ出なかった。
    // 5段あるのに3段しか使っていない目盛りは、目盛りとして働いていない。
    const seen = new Set([1, 2, 3, 4, 5, 6].map((level) => estimateEncounter({ level }).stars));
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(seen.has(1)).toBe(true);
    expect(seen.has(5)).toBe(true);
  });

  it("境目は「1つ星ごとにおよそ半分の回数」", () => {
    // λ=2 の少し上下で★1と★2に分かれる。
    expect(rarityStars(atLeastOnce(2.1))).toBe(1);
    expect(rarityStars(atLeastOnce(1.9))).toBe(2);
    expect(rarityStars(atLeastOnce(0.9))).toBe(3);
    expect(rarityStars(atLeastOnce(0.4))).toBe(4);
    expect(rarityStars(atLeastOnce(0.2))).toBe(5);
  });

  it("壊れた確率でも 1〜5 に収まる", () => {
    for (const v of [-1, 2, Number.NaN, Infinity]) {
      const s = rarityStars(v);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(5);
    }
  });
});

describe("estimateEncounter — 通し", () => {
  it("**やさしい語ほど出会いやすい**", () => {
    const easy = estimateEncounter({ level: 1 });
    const hard = estimateEncounter({ level: 6 });
    expect(easy.probability).toBeGreaterThan(hard.probability);
    expect(easy.stars).toBeLessThan(hard.stars);
  });

  it("季節外れ・地域限定は★5まで落ちる(「台南限定」が最もレアに見える)", () => {
    const outOfPlace = estimateEncounter({
      level: 3,
      regionScope: "台南",
      userRegion: "台北",
    });
    expect(outOfPlace.stars).toBe(5);
  });

  it("季節外れの語は下がる(旬の月と比べて)", () => {
    const base = { level: 3, seasonMonths: [5, 6, 7, 8] };
    const inSeason = estimateEncounter({ ...base, month: 6 });
    const outSeason = estimateEncounter({ ...base, month: 12 });
    expect(outSeason.probability).toBeLessThan(inSeason.probability);
  });

  it("地域限定の語は、外に居る人には下がる", () => {
    const base = { level: 3, regionScope: "台南" };
    const inside = estimateEncounter({ ...base, userRegion: "台南" });
    const outside = estimateEncounter({ ...base, userRegion: "台北" });
    expect(outside.probability).toBeLessThan(inside.probability);
  });

  it("**撮った人が十分に居れば、コーパスが無くても実測**", () => {
    // 事前は縮小推定で押しのけられている。1000人の実際の行動で出した数字を
    // 「推定」と呼ぶのは、出来ていることを過小に言うことになる。
    const r = estimateEncounter({ level: 2, caughtUsers: 50, activeUsers: 100 });
    expect(r.confidence).toBe("measured");
    expect(r.observedUsers).toBe(50);
  });

  it("人が1人も居なければ、名乗りは事前の出来そのもの", () => {
    const noCorpus = estimateEncounter({ level: 2 });
    expect(noCorpus.confidence).toBe("estimate");
    const withCorpus = estimateEncounter({
      level: 2,
      corpusWordCount: 500,
      corpusTotalCount: 100_000,
    });
    expect(withCorpus.confidence).toBe("measured");
  });

  it("人が少しだけ居るときは「混ぜた」", () => {
    const r = estimateEncounter({ level: 2, caughtUsers: 1, activeUsers: 10 });
    expect(r.confidence).toBe("blended");
  });

  it("確率は必ず 0〜1、星は 1〜5", () => {
    const r = estimateEncounter({ level: 4 });
    expect(r.probability).toBeGreaterThanOrEqual(0);
    expect(r.probability).toBeLessThanOrEqual(1);
    expect([1, 2, 3, 4, 5]).toContain(r.stars);
  });

  it("**全部壊れた入力でも NaN を出さない**", () => {
    const r = estimateEncounter({
      level: Number.NaN,
      corpusWordCount: -1,
      corpusTotalCount: Number.NaN,
      wordsPerWeek: Infinity,
      wordScenes: {},
      userScenes: {},
      seasonMonths: [99],
      month: -3,
      regionScope: "",
      userRegion: "",
      caughtUsers: Number.NaN,
      activeUsers: -10,
    });
    expect(Number.isFinite(r.probability)).toBe(true);
    expect(r.probability).toBeGreaterThanOrEqual(0);
    expect(r.probability).toBeLessThanOrEqual(1);
    expect(Number.isFinite(r.detail.lambda)).toBe(true);
  });
});

describe("weeklyEncounterRate", () => {
  it("触れる語数が増えれば出会う回数も増える", () => {
    const a = weeklyEncounterRate({ perMillion: 100, wordsPerWeek: 10_000 });
    const b = weeklyEncounterRate({ perMillion: 100, wordsPerWeek: 40_000 });
    expect(b).toBeGreaterThan(a);
  });

  it("負の入力でも 0 未満にならない", () => {
    expect(weeklyEncounterRate({ perMillion: -5, wordsPerWeek: -1 })).toBe(0);
  });
});
