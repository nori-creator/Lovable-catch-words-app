import { describe, it, expect } from "vitest";
import {
  ALBUM_SPANS,
  localDayKey,
  spanStartKey,
  keyToDate,
  groupBySpan,
  spanHeading,
} from "./album-span";

/**
 * 束ね方の境目。**日曜と月初と年またぎ**でしか壊れないので、
 * その3つを名指しで押さえる。
 */

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe("localDayKey", () => {
  it("地方時の年月日で切る(UTC に寄せない)", () => {
    // 2026-08-20 の 23:30。UTC に寄せると翌日になる地域がある。
    expect(localDayKey(new Date(2026, 7, 20, 23, 30))).toBe("2026-08-20");
    expect(localDayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });

  it("1桁の月日を0で埋める(文字列で並べ替えるため)", () => {
    expect(localDayKey(at(2026, 3, 7))).toBe("2026-03-07");
  });
});

describe("spanStartKey — 週は月曜始まり", () => {
  it("月曜〜日曜が同じ週になる", () => {
    // 2026-08-17 は月曜。
    const week = ["2026-08-17"];
    for (let d = 17; d <= 23; d++) {
      expect(spanStartKey(at(2026, 8, d), "week"), `8/${d}`).toBe(week[0]);
    }
  });

  it("**日曜は前の週に入る**(ここを間違えると日曜だけ翌週の頭に飛ぶ)", () => {
    expect(spanStartKey(at(2026, 8, 23), "week")).toBe("2026-08-17"); // 日
    expect(spanStartKey(at(2026, 8, 24), "week")).toBe("2026-08-24"); // 翌月曜
  });

  it("月をまたぐ週も、始まりの月曜で1つになる", () => {
    // 2026-08-31(月)〜09-06(日)
    expect(spanStartKey(at(2026, 8, 31), "week")).toBe("2026-08-31");
    expect(spanStartKey(at(2026, 9, 6), "week")).toBe("2026-08-31");
  });

  it("年をまたぐ週も1つになる", () => {
    // 2025-12-29(月)〜2026-01-04(日)
    expect(spanStartKey(at(2025, 12, 29), "week")).toBe("2025-12-29");
    expect(spanStartKey(at(2026, 1, 4), "week")).toBe("2025-12-29");
  });
});

describe("spanStartKey — 日と月", () => {
  it("日はその日", () => {
    expect(spanStartKey(at(2026, 8, 20), "day")).toBe("2026-08-20");
  });

  it("月はその月の1日", () => {
    expect(spanStartKey(at(2026, 8, 1), "month")).toBe("2026-08-01");
    expect(spanStartKey(at(2026, 8, 31), "month")).toBe("2026-08-01");
  });
});

describe("keyToDate", () => {
  it("鍵を地方時の日付に戻す(`new Date(key)` は UTC なので使わない)", () => {
    const d = keyToDate("2026-08-20");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(20);
  });

  it("往復しても変わらない", () => {
    for (const k of ["2026-01-01", "2026-08-17", "2025-12-29"]) {
      expect(localDayKey(keyToDate(k))).toBe(k);
    }
  });
});

describe("groupBySpan", () => {
  const items = [
    { id: "a", d: at(2026, 8, 20) }, // 木
    { id: "b", d: at(2026, 8, 18) }, // 火
    { id: "c", d: at(2026, 8, 17) }, // 月
    { id: "d", d: at(2026, 7, 30) }, // 前の月
  ];
  const dateOf = (x: { d: Date }) => x.d;

  it("日で束ねると4つ", () => {
    expect(groupBySpan(items, dateOf, "day").map(([k]) => k)).toEqual([
      "2026-08-20",
      "2026-08-18",
      "2026-08-17",
      "2026-07-30",
    ]);
  });

  it("週で束ねると2つ", () => {
    const got = groupBySpan(items, dateOf, "week");
    expect(got.map(([k]) => k)).toEqual(["2026-08-17", "2026-07-27"]);
    expect(got[0][1].map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("月で束ねると2つ", () => {
    expect(groupBySpan(items, dateOf, "month").map(([k]) => k)).toEqual([
      "2026-08-01",
      "2026-07-01",
    ]);
  });

  it("**新しい順**に返す", () => {
    for (const span of ALBUM_SPANS) {
      const keys = groupBySpan(items, dateOf, span).map(([k]) => k);
      expect([...keys].sort().reverse(), span).toEqual(keys);
    }
  });

  it("束の中の並びは渡された順のまま", () => {
    const got = groupBySpan(items, dateOf, "month");
    expect(got[0][1].map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("壊れた日付で束を作らない", () => {
    const bad = [...items, { id: "x", d: new Date("こわれた") }];
    const got = groupBySpan(bad, dateOf, "day");
    expect(got.flatMap(([, v]) => v.map((x) => x.id))).not.toContain("x");
  });

  it("空でも落ちない", () => {
    expect(groupBySpan([], dateOf, "week")).toEqual([]);
  });
});

describe("spanHeading", () => {
  it("月は年と月", () => {
    expect(spanHeading("2026-08-01", "month", "ja-JP")).toContain("8");
    expect(spanHeading("2026-08-01", "month", "en-US")).toContain("August");
  });

  it("週は**始まりと終わりの日**で言う(週番号は読めない)", () => {
    const h = spanHeading("2026-08-17", "week", "en-US");
    expect(h).toContain("17");
    expect(h).toContain("23");
    expect(h).not.toContain("W");
  });

  it("年をまたぐ週も、終わりが翌年の日になる", () => {
    const h = spanHeading("2025-12-29", "week", "en-US");
    expect(h).toContain("29");
    expect(h).toContain("4");
  });
});
