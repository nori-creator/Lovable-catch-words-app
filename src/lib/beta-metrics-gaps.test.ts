import { describe, expect, it } from "vitest";
import {
  candidateAccuracy,
  computeBetaMetrics,
  endOfTaipeiDay,
  latencyByEvent,
  latencyStat,
  normalizeUnitCosts,
  retainedWordsAt,
  type BetaRawData,
} from "./beta-metrics";

/**
 * 2026-10-03 に足した数（ROADMAP Phase 3 / 6 / 9、PRODUCT.md › North-star）:
 * 撮る道の4つの待ち時間（p50/p90/p99）、写真の候補の Top-1/Top-3、覚えている語 / 週と
 * 1人あたりの AI 費用、記憶の見込みの較正。
 */
const TODAY = "2026-10-03";

describe("待ち時間（QA.md の4つ、p50/p90/p99）", () => {
  it("p99 も出す（少ない間は最大値に近い）", () => {
    const v = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
    expect(latencyStat(v)).toEqual({ n: 100, p50: 500, p90: 900, p99: 990 });
    expect(latencyStat([])).toEqual({ n: 0, p50: null, p90: null, p99: null });
  });

  it("段ごとに分け、段の名前の無い古い行は候補の待ち時間として数える", () => {
    const m = latencyByEvent(
      [
        { user_id: "A", day: TODAY, ms: 3000 }, // 2026-10-03 より前の行（event なし）
        { user_id: "A", day: TODAY, ms: 4000, event: "candidates_shown" },
        { user_id: "A", day: TODAY, ms: 200, event: "meaning_shown" },
        { user_id: "A", day: TODAY, ms: 700, event: "first_audio_played" },
        { user_id: "A", day: "2026-09-20", ms: 1500, event: "catch_saved" },
        { user_id: "A", day: TODAY, ms: 999, event: "unknown_step" },
      ],
      TODAY,
    );
    expect(m.candidates_shown[7].n).toBe(2);
    expect(m.meaning_shown[7]).toMatchObject({ n: 1, p50: 200 });
    expect(m.first_audio_played[30]).toMatchObject({ n: 1, p99: 700 });
    expect(m.catch_saved[7].n).toBe(0);
    expect(m.catch_saved[30]).toMatchObject({ n: 1, p50: 1500 });
  });
});

describe("候補の当たり方（Top-1 / Top-3）", () => {
  it("分母は写真の候補から選んだ回 + 母語で調べ直した回。打った語・スキャンは入れない", () => {
    const pick = (via: "photo" | "native_search" | "typed" | "scan", rank: number, n = 5) => ({
      user_id: "A",
      day: TODAY,
      via,
      rank,
      n,
    });
    const acc = candidateAccuracy(
      [
        pick("photo", 1),
        pick("photo", 1),
        pick("photo", 2),
        pick("photo", 4),
        pick("native_search", 1, 1),
        pick("typed", 1, 1),
        pick("scan", 1, 3),
        { ...pick("photo", 1), day: "2026-09-10" }, // 30日より前
      ],
      TODAY,
    );
    expect(acc[7]).toEqual({
      n: 5,
      photoPicks: 4,
      nativeSearch: 1,
      top1: 2,
      top3: 3,
      top1Pct: 40,
      top3Pct: 60,
      nativeSearchPct: 20,
      medianCandidates: 5,
    });
    expect(candidateAccuracy([], TODAY)[30]).toMatchObject({ n: 0, top1Pct: null });
  });
});

describe("North-star: 覚えている語 / 週", () => {
  const at = (day: string, hm = "10:00") => `${day}T${hm}:00+08:00`;

  it("その時点の最後の復習から「いま思い出せる確率」を出し、目標以上の語だけ数える", () => {
    const states = [
      // s1: 10/1 に復習、間隔 10 日 → 10/3 の終わりでもまだ 90% 以上。
      { user_id: "A", sticker_id: "s1", at: at("2026-10-01"), interval_days: 10 },
      // s2: 9/20 に間隔 1 日 → とっくに 90% を切っている。
      { user_id: "A", sticker_id: "s2", at: at("2026-09-20"), interval_days: 1 },
      // s3: 9/25 に間隔 1 日、10/2 に復習し直して間隔 30 日。
      { user_id: "B", sticker_id: "s3", at: at("2026-09-25"), interval_days: 1 },
      { user_id: "B", sticker_id: "s3", at: at("2026-10-02"), interval_days: 30 },
    ];
    const now = retainedWordsAt(states, endOfTaipeiDay(TODAY));
    expect(now.get("A")).toBe(1);
    expect(now.get("B")).toBe(1);
    // 9/26 の終わりの時点: s1 はまだ復習していない、s3 は 9/25 の間隔 1 日（1日半で 90% 未満）。
    const before = retainedWordsAt(states, endOfTaipeiDay("2026-09-26"));
    expect(before.get("A") ?? 0).toBe(0);
    expect(before.get("B") ?? 0).toBe(0);
  });

  it("週ごとに1人あたり（使った人で割る）と AI 費用 / 人を出し、管理者は数えない", () => {
    const raw: BetaRawData = {
      today: TODAY,
      users: [
        { id: "A", signupDay: "2026-09-01" },
        { id: "B", signupDay: "2026-09-01" },
      ],
      anonIds: [],
      usage: [
        { user_id: "A", kind: "suggest", day: TODAY },
        { user_id: "B", kind: "camera_open", day: "2026-10-02" },
        { user_id: "ADMIN", kind: "suggest", day: TODAY },
      ],
      catches: [],
      reviews: [],
      funnelKeys: [],
      latencies: [],
      runs: [],
      aiRuns: [],
      unitCosts: normalizeUnitCosts({ suggest: 0.01 }),
      reviewStates: [
        { user_id: "A", sticker_id: "s1", at: at("2026-10-01"), interval_days: 10 },
        { user_id: "A", sticker_id: "s4", at: at("2026-10-02"), interval_days: 20 },
        { user_id: "ADMIN", sticker_id: "x", at: at("2026-10-02"), interval_days: 20 },
      ],
      nowMs: Date.parse(at(TODAY, "12:00")),
    };
    const m = computeBetaMetrics(raw);
    const w = m.northStar.weeks[0];
    expect(m.northStar.targetPct).toBe(90);
    expect(w).toMatchObject({
      from: "2026-09-27",
      to: TODAY,
      activeUsers: 2,
      retainedWords: 2,
      perActiveUser: 1, // A=2, B=0 → 2 / 2
      medianPerActiveUser: 0,
    });
    // suggest の単価は既定のまま（上書きは既定に在る鍵だけ）。管理者の分は入れない。
    expect(w.aiUsd).toBeCloseTo(m.cost.unitCosts.suggest ?? 0, 6);
    expect(w.aiUsdPerActiveUser).toBeCloseTo((m.cost.unitCosts.suggest ?? 0) / 2, 4);
    expect(m.northStar.weeks).toHaveLength(6);
    // 新しい欄は無くても落ちない（較正・精度は空）。
    expect(m.calibration.n).toBe(0);
    expect(m.candidateAccuracy[7].n).toBe(0);
    expect(m.latency.meaning_shown[7].n).toBe(0);
  });
});
