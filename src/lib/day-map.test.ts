import { describe, expect, it } from "vitest";
import { groupStops, haversineKm, nearbyStops, neighborDay, projectStops } from "./day-map";

const at = (h: number, m = 0) => new Date(2026, 8, 12, h, m).toISOString();
const it0 = (
  id: string,
  t: string,
  lat: number | null,
  lng: number | null,
  place: string | null = null,
) => ({
  id,
  takenAt: t,
  lat,
  lng,
  place,
});

describe("groupStops", () => {
  it("同じ場所で続けて撮った写真は1つの立ち寄り。離れる・時間が空くと分ける", () => {
    const s = groupStops([
      it0("a", at(11, 29), 33.2396, 131.6093, "大分駅"),
      it0("b", at(11, 35), 33.2397, 131.6094),
      it0("c", at(11, 50), 33.245, 131.612, "府内"), // 600m 先
      it0("d", at(15, 0), 33.245, 131.612), // 3時間後
    ]);
    expect(s.map((x) => x.items.map((i) => i.id))).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(s[0].start).toBe(at(11, 29));
    expect(s[0].end).toBe(at(11, 35));
    expect(s[0].place).toBe("大分駅");
  });

  it("撮った順に並べ直す（渡した順ではなく）", () => {
    const s = groupStops([it0("late", at(18), 1, 1), it0("early", at(8), 2, 2)]);
    expect(s[0].id).toBe("early");
  });

  it("場所の無い写真は、時間が近ければ前の立ち寄りへ", () => {
    const s = groupStops([it0("a", at(10), 1, 1), it0("b", at(10, 10), null, null)]);
    expect(s).toHaveLength(1);
  });
});

describe("距離", () => {
  it("haversine は東京–大阪でおよそ400km", () => {
    const km = haversineKm({ lat: 35.681, lng: 139.767 }, { lat: 34.702, lng: 135.495 });
    expect(km).toBeGreaterThan(390);
    expect(km).toBeLessThan(410);
  });
});

describe("projectStops（地図が読めないときの簡易の面）", () => {
  it("箱の余白の内側に収まり、北が上・東が右", () => {
    const s = groupStops([it0("w", at(9), 35.0, 135.0), it0("e", at(12), 35.02, 135.03)]);
    const p = projectStops(s, { w: 360, h: 300 }, 30);
    const w = p.get("w")!;
    const e = p.get("e")!;
    expect(e.x).toBeGreaterThan(w.x);
    expect(e.y).toBeLessThan(w.y);
    for (const v of [w, e]) {
      expect(v.x).toBeGreaterThanOrEqual(30);
      expect(v.x).toBeLessThanOrEqual(330);
      expect(v.y).toBeGreaterThanOrEqual(30);
      expect(v.y).toBeLessThanOrEqual(270);
    }
  });
  it("1か所だけなら真ん中。場所の無い立ち寄りは置かない", () => {
    const s = groupStops([it0("a", at(9), 35, 135), it0("b", at(15), null, null)]);
    const p = projectStops(s, { w: 200, h: 100 });
    expect(p.get("a")).toEqual({ x: 100, y: 50 });
    expect(p.has("b")).toBe(false);
  });
});

describe("neighborDay", () => {
  const days = ["2026-09-01", "2026-09-05", "2026-09-12"];
  it("前後の写真のある日へ。端では null", () => {
    expect(neighborDay(days, "2026-09-05", 1)).toBe("2026-09-12");
    expect(neighborDay(days, "2026-09-05", -1)).toBe("2026-09-01");
    expect(neighborDay(days, "2026-09-12", 1)).toBeNull();
  });
  it("写真の無い日からでも、いちばん近い前後へ", () => {
    expect(neighborDay(days, "2026-09-07", -1)).toBe("2026-09-05");
    expect(neighborDay(days, "2026-09-07", 1)).toBe("2026-09-12");
  });
});

describe("nearbyStops（寄りの地図。オーナー指示 2026-09-23 の3回目）", () => {
  const st = (id: string, lat: number | null, lng: number | null) => ({
    id,
    items: [],
    start: "",
    end: "",
    lat,
    lng,
    place: null,
  });
  // 台北駅・西門町（約1km）・淡水（約17km）・場所なし
  const stops = [
    st("taipei", 25.0478, 121.517),
    st("ximen", 25.0421, 121.5076),
    st("tamsui", 25.1677, 121.4452),
    st("none", null, null),
  ];
  it("選んだ所から 3km 以内だけ（遠い淡水は入れない）", () => {
    expect(nearbyStops(stops, "taipei").map((s) => s.id)).toEqual(["taipei", "ximen"]);
  });
  it("遠い所を選んだら、そこの近くだけ", () => {
    expect(nearbyStops(stops, "tamsui").map((s) => s.id)).toEqual(["tamsui"]);
  });
  it("基準が場所を持たなければ、場所のある最初の立ち寄りを基準に", () => {
    expect(nearbyStops(stops, "none").map((s) => s.id)).toEqual(["taipei", "ximen"]);
    expect(nearbyStops([st("x", null, null)], "x")).toEqual([]);
  });
});
