import { describe, expect, it } from "vitest";
import { cutoffDate, draftKeyFor, readLeftoverDrafts, type DraftStore } from "@/lib/journal-drafts";

/** 本物の localStorage と同じ順序・同じ挙動の最小の入れ物。 */
function makeStore(entries: Record<string, string>): DraftStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    removeItem: (k) => void data.delete(k),
  };
}

describe("journal-drafts", () => {
  it("鍵に日付が入る", () => {
    expect(draftKeyFor("2026-08-15")).toBe("journal-draft:2026-08-15");
  });

  it("境界は14日前", () => {
    expect(cutoffDate("2026-08-15")).toBe("2026-08-01");
    // 月をまたいでも日付として正しいこと(文字列の引き算にしない)。
    expect(cutoffDate("2026-03-05")).toBe("2026-02-19");
  });

  it("今日の下書きには触らない", () => {
    const s = makeStore({ "journal-draft:2026-08-15": "きょう書いた" });
    expect(readLeftoverDrafts("2026-08-15", s)).toEqual([]);
    expect(s.data.has("journal-draft:2026-08-15")).toBe(true);
  });

  it("昨日の書きかけは消さずに返す", () => {
    const s = makeStore({ "journal-draft:2026-08-14": "きのうの途中" });
    expect(readLeftoverDrafts("2026-08-15", s)).toEqual([
      { date: "2026-08-14", text: "きのうの途中" },
    ]);
    // **返すだけで消さない。** 押されるまで拾えなければ意味がない。
    expect(s.data.has("journal-draft:2026-08-14")).toBe(true);
  });

  it("新しい順に返す", () => {
    const s = makeStore({
      "journal-draft:2026-08-10": "ふるい",
      "journal-draft:2026-08-14": "あたらしい",
      "journal-draft:2026-08-12": "まんなか",
    });
    expect(readLeftoverDrafts("2026-08-15", s).map((d) => d.date)).toEqual([
      "2026-08-14",
      "2026-08-12",
      "2026-08-10",
    ]);
  });

  it("14日より古いものと空のものは掃除する", () => {
    const s = makeStore({
      "journal-draft:2026-07-20": "ずっと前",
      "journal-draft:2026-08-14": "   ",
      "journal-draft:2026-08-13": "のこす",
    });
    expect(readLeftoverDrafts("2026-08-15", s).map((d) => d.date)).toEqual(["2026-08-13"]);
    expect([...s.data.keys()]).toEqual(["journal-draft:2026-08-13"]);
  });

  it("関係ない鍵は触らない", () => {
    const s = makeStore({ "kpi-app-open": "2026-08-15", "journal-draft:2026-01-01": "ふるい" });
    readLeftoverDrafts("2026-08-15", s);
    expect(s.data.has("kpi-app-open")).toBe(true);
  });

  it("入れ物が無い端末では空を返す(落ちない)", () => {
    expect(readLeftoverDrafts("2026-08-15", null)).toEqual([]);
  });
});
