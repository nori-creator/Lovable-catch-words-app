import { describe, expect, it } from "vitest";
import { learnerIpa } from "./learner-ipa";

describe("learnerIpa — 日本・台湾の辞書で見る形", () => {
  it("ɹ・ɝ・ɚ・ɡ を見慣れた形に", () => {
    expect(learnerIpa("ɹɛd")).toBe("rɛd");
    expect(learnerIpa("bɝd")).toBe("bəːrd");
    expect(learnerIpa("ˈwɔtɚ")).toBe("ˈwɔːtər");
    expect(learnerIpa("ɡʊd")).toBe("gʊd");
  });
  it("長い i・u に ː を付ける。二重母音は触らない", () => {
    expect(learnerIpa("si")).toBe("siː");
    expect(learnerIpa("ˈmun")).toBe("ˈmuːn");
    expect(learnerIpa("baɪk")).toBe("baɪk");
    expect(learnerIpa("aʊt")).toBe("aʊt");
    expect(learnerIpa("ˈboʊt")).toBe("ˈboʊt");
  });
  it("語末の弱い i（happy）は短いまま", () => {
    expect(learnerIpa("ˈhæpi")).toBe("ˈhæpi");
  });
  it("既に ː がある形は二重に付けない", () => {
    expect(learnerIpa("siː")).toBe("siː");
    expect(learnerIpa("ɔːl")).toBe("ɔːl");
  });
  it("umbrella", () => {
    expect(learnerIpa("əmˈbɹɛlə")).toBe("əmˈbrɛlə");
  });
});
