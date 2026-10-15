/**
 * **採点は 500 を返さない**（本番 2026-10-15 18:53 台湾: iOS の復習で 內褲 を答えると
 * 「採点を保存できませんでした。もう一度答えてください。サーバーエラー（500）」）。
 *
 * その札（sticker 71282f52-69cc-44cf-ad3a-20d88b2f4649）も復習の行も今は無い（図鑑から消すと復習の行は連鎖で消える）。
 * 同じ回のほかの 49 枚（10:50:58〜10:53:40）は保存されている。前の `gradeReview` は `.single()` で行を読み、
 * 行が無い時の PostgREST の英語の失敗をそのまま投げていた → `statusForError` が 500。iOS は英語の文を日本語の
 * 画面に出さないので「サーバーエラー（500）」だけが出た。iOS は保存に失敗した札を回の最後に戻す（iOS #32）ので、
 * 消えた札は何度答えても同じ 500 になる。
 *
 * ここは `gradeReviewWith`（`gradeReview` の本体）を、DB の小さな作り物で動かして確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { gradeReviewWith, parseGradeInput } from "./reviews.functions";
import { GRADE_SAVE_FAILED_MESSAGE, GradeSaveError } from "./review-grade-guard";
import { publicMessage, statusForError } from "./native-fn";

type ReviewRow = {
  id: string;
  user_id: string;
  sticker_id: string;
  ease: number;
  interval_days: number;
  repetitions: number;
  blur_seen: boolean;
  last_reviewed_at: string | null;
  due_at: string;
  last_score: number | null;
};

const USER = "21b1c42a-9456-4a58-8624-46aa3abb632f";
const REVIEW = "5b0c2f0e-2f5d-4a3e-9d61-1d7d2a2f6c01";
const STICKER = "71282f52-69cc-44cf-ad3a-20d88b2f4649";
const NOW = Date.parse("2026-10-15T10:53:00Z");

/** `reviews` / `review_history` だけの作り物（PostgREST の `.maybeSingle()` と比べて書く update の形だけ）。 */
function fakeDb(
  rows: ReviewRow[],
  opts: { readError?: string; updateError?: string; historyFailures?: number } = {},
) {
  const history: Array<Record<string, unknown>> = [];
  let historyFailures = opts.historyFailures ?? 0;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const match = (r: ReviewRow, filters: Array<[string, unknown, "eq" | "is"]>) =>
    filters.every(([k, v, op]) =>
      op === "is"
        ? (r as Record<string, unknown>)[k] === v
        : (r as Record<string, unknown>)[k] === v,
    );
  const db = {
    from(table: string) {
      if (table === "review_history") {
        return {
          insert: async (row: Record<string, unknown>) => {
            await tick();
            if (historyFailures > 0) {
              historyFailures -= 1;
              return { error: { message: "history down" } };
            }
            history.push(row);
            return { error: null };
          },
        };
      }
      if (table !== "reviews") throw new Error(`unexpected table ${table}`);
      return {
        select(_cols: string) {
          const filters: Array<[string, unknown, "eq" | "is"]> = [];
          const q = {
            eq(k: string, v: unknown) {
              filters.push([k, v, "eq"]);
              return q;
            },
            async maybeSingle() {
              await tick();
              if (opts.readError) return { data: null, error: { message: opts.readError } };
              const found = rows.filter((r) => match(r, filters));
              return { data: found[0] ? { ...found[0] } : null, error: null };
            },
          };
          return q;
        },
        update(patch: Partial<ReviewRow>) {
          const filters: Array<[string, unknown, "eq" | "is"]> = [];
          const q = {
            eq(k: string, v: unknown) {
              filters.push([k, v, "eq"]);
              return q;
            },
            is(k: string, v: unknown) {
              filters.push([k, v, "is"]);
              return q;
            },
            async select(_cols: string) {
              await tick();
              if (opts.updateError) return { data: null, error: { message: opts.updateError } };
              const hit = rows.filter((r) => match(r, filters));
              for (const r of hit) Object.assign(r, patch);
              return { data: hit.map((r) => ({ id: r.id })), error: null };
            },
          };
          return q;
        },
      };
    },
  };
  return { db, history, rows };
}

const dueRow = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: REVIEW,
  user_id: USER,
  sticker_id: STICKER,
  ease: 2.5,
  interval_days: 0,
  repetitions: 0,
  blur_seen: false,
  last_reviewed_at: null,
  due_at: "2026-10-15T06:48:18.260497+00:00",
  last_score: null,
  ...over,
});

const jevCalls: string[] = [];
const fakeJev = async () => ({
  jevIntervalMode: async () => "shadow" as const,
  jevScheduleDays: async () => {
    jevCalls.push("schedule");
    return null;
  },
  logScheduleDecision: async () => {
    jevCalls.push("log");
  },
  recordRecallShadow: async () => {
    jevCalls.push("recall");
  },
});

const grade = (
  db: ReturnType<typeof fakeDb>["db"],
  input: Record<string, unknown>,
  deps: Parameters<typeof gradeReviewWith>[2] = { loadJev: fakeJev, now: () => NOW },
) => gradeReviewWith({ supabase: db as never, userId: USER }, parseGradeInput(input), deps);

beforeEach(() => {
  jevCalls.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("採点の札がもう無い（図鑑から消した札）", () => {
  it("本番の形: 行が無い → 500 にせず、何も書かずに gone（もう一度届いても同じ）", async () => {
    const { db, history } = fakeDb([]);
    const input = { review_id: REVIEW, correct: true, blur_seen: false, response_ms: 1800 };
    const first = await grade(db, input);
    expect(first).toEqual({
      score: null,
      next_due_at: null,
      interval_days: null,
      duplicate: false,
      gone: true,
    });
    expect(await grade(db, input)).toEqual(first);
    expect(history).toEqual([]);
  });

  it("前の失敗の文（PostgREST の英語）は 500 だった — 今はその道を通らない", () => {
    // `.single()` が行の無い時に返していた失敗。`throw new Error(error.message)` → 500。
    expect(statusForError(new Error("Cannot coerce the result to a single JSON object"))).toBe(500);
  });

  it("ほかの人の札（行は読めない）も gone。書かない", async () => {
    const { db, rows } = fakeDb([dueRow({ user_id: "someone-else" })]);
    const out = await grade(db, { review_id: REVIEW, correct: true });
    expect(out.gone).toBe(true);
    expect(rows[0].last_score).toBeNull();
  });
});

describe("同じ採点が2回届いても1回分（冪等）", () => {
  it("1回目は進める・2回目（やり直し・iOS が回の最後に戻した札）は今の状態を duplicate で返す", async () => {
    const { db, history, rows } = fakeDb([dueRow()]);
    const input = { review_id: REVIEW, correct: true, response_ms: 1500 };
    const first = await grade(db, input);
    expect(first).toMatchObject({ score: 5, duplicate: false, history_saved: true });
    expect(first.interval_days).toBeGreaterThanOrEqual(1);
    const second = await grade(db, { ...input, correct: false });
    expect(second).toEqual({
      score: 5,
      next_due_at: first.next_due_at,
      interval_days: first.interval_days,
      duplicate: true,
    });
    expect(history).toHaveLength(1);
    expect(rows[0].repetitions).toBe(1);
  });

  it("同時に2回届いた時（iOS は保存を待たずに次へ進む）: 書くのは1回、後の方は先の方の状態を返す", async () => {
    const { db, history } = fakeDb([dueRow()]);
    const [a, b] = await Promise.all([
      grade(db, { review_id: REVIEW, correct: true, response_ms: 1200 }),
      grade(db, { review_id: REVIEW, correct: false, response_ms: 1300 }),
    ]);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    const winner = a.duplicate ? b : a;
    const loser = a.duplicate ? a : b;
    expect(loser).toEqual({
      score: winner.score,
      next_due_at: winner.next_due_at,
      interval_days: winner.interval_days,
      duplicate: true,
    });
    expect(history).toHaveLength(1);
  });

  it("読んだ後・書く前に札が消えた（同時に図鑑から消した）ら gone", async () => {
    const state = fakeDb([dueRow()]);
    const db = {
      from(t: string) {
        const q = state.db.from(t) as unknown as Record<string, (arg: unknown) => unknown>;
        if (t !== "reviews") return q;
        return {
          ...q,
          update: (patch: Partial<ReviewRow>) => {
            state.rows.length = 0; // 書く直前に行が消える
            return q.update(patch);
          },
        };
      },
    };
    expect((await grade(db as never, { review_id: REVIEW, correct: true })).gone).toBe(true);
    expect(state.history).toEqual([]);
  });
});

describe("DB に届かない・書けない時は 503 と読める文（500 にしない）", () => {
  it("読めない", async () => {
    const { db } = fakeDb([dueRow()], { readError: "upstream connect error" });
    const err = await grade(db, { review_id: REVIEW, correct: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GradeSaveError);
    expect(statusForError(err)).toBe(503);
    expect(publicMessage(err)).toBe(GRADE_SAVE_FAILED_MESSAGE);
    // iOS の自分の文（採点を保存できませんでした。もう一度答えてください。）を繰り返さず、理由だけを言う。
    expect(publicMessage(err)).toMatch(/データベース/);
    expect(publicMessage(err)).not.toMatch(/採点を保存できません/);
  });

  it("書けない", async () => {
    const { db } = fakeDb([dueRow()], { updateError: "deadlock detected" });
    const err = await grade(db, { review_id: REVIEW, correct: true }).catch((e: unknown) => e);
    expect(statusForError(err)).toBe(503);
  });

  it("忘却曲線の記録が2回とも落ちても採点は済む（history_saved: false）", async () => {
    const { db, history } = fakeDb([dueRow()], { historyFailures: 2 });
    const out = await grade(db, { review_id: REVIEW, correct: true });
    expect(out).toMatchObject({ duplicate: false, history_saved: false });
    expect(history).toEqual([]);
  });

  it("Jev の記録が読み込めなくても採点は止めない（予定は FSRS）", async () => {
    const { db, history } = fakeDb([dueRow()]);
    const out = await grade(
      db,
      { review_id: REVIEW, correct: true },
      {
        loadJev: async () => {
          throw new Error("Failed to fetch dynamically imported module");
        },
        now: () => NOW,
      },
    );
    expect(out).toMatchObject({ score: 5, duplicate: false });
    expect(history).toHaveLength(1);
  });

  it("開いたまま何日も放っておいた札の答える時間も記録が落ちない長さに収める", async () => {
    const { db, history } = fakeDb([dueRow()]);
    await grade(db, { review_id: REVIEW, correct: true, response_ms: 9_000_000_000 });
    expect(history[0].response_ms).toBe(2_147_483_647);
  });
});

describe("形の違う入力は 400 と読める文", () => {
  it.each([
    [{ review_id: "not-a-uuid", correct: true }],
    [{ review_id: REVIEW }],
    [{ review_id: REVIEW, correct: "yes" }],
    [{ review_id: REVIEW, correct: true, response_ms: -1 }],
    [{ review_id: REVIEW, correct: true, response_ms: 12.5 }],
    [null],
  ])("%j", (input) => {
    let err: unknown = null;
    try {
      parseGradeInput(input);
    } catch (e) {
      err = e;
    }
    expect(statusForError(err)).toBe(400);
    expect(publicMessage(err)).toBe("送った内容の形が違います。アプリを最新にしてください。");
  });

  it("iOS が送る形（review_id・correct・blur_seen・response_ms）は通る", () => {
    expect(
      parseGradeInput({ review_id: REVIEW, correct: true, blur_seen: false, response_ms: 1800 }),
    ).toEqual({ review_id: REVIEW, correct: true, blur_seen: false, response_ms: 1800 });
    expect(parseGradeInput({ review_id: REVIEW, correct: false })).toEqual({
      review_id: REVIEW,
      correct: false,
      blur_seen: false,
      response_ms: 0,
    });
  });
});
