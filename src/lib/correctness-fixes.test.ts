/**
 * 監査 2026-10-03 の正しさの直し（M5・L2〜L5）を確かめる。
 * - M5: PostgREST の 1000 行の既定の上限で、数と一覧が黙って切れない（`readAllPages`）
 * - L2: profiles を読めるのは本人の行だけ（アプリは本人の行しか読まない）
 * - L3: 単語帳の採点も、同じ答えが2回届いて2回進まない
 * - L4: 再会のキャッチで、今ある写真を黙って消さない
 * - L5: 採点の後の影の記録を、Workers の上で落とさない
 */
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { attachPhotoPatch } from "./ghost.functions";
import { runAfterResponse } from "./background-task";

const read = (p: string) => fs.readFileSync(p, "utf8");
/** 注釈の行を除いた本文（注釈に昔の `.limit(50000)` を書いてあるので）。 */
const code = (p: string) =>
  read(p)
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

describe("M5: 1000 行で黙って切れない", () => {
  const files = [
    "src/lib/admin-users.functions.ts",
    "src/lib/metrics.functions.ts",
    "src/lib/stats.functions.ts",
    "src/lib/reviews.functions.ts",
    "src/lib/scan.functions.ts",
  ];

  it("1000 を超える `.limit(…)` を頼んでいない（来ないので嘘になる）", () => {
    for (const f of files) {
      const big = [...code(f).matchAll(/\.limit\((\d[\d_]*)\)/g)]
        .map((m) => Number(m[1].replace(/_/g, "")))
        .filter((n) => n > 1000);
      expect([f, big]).toEqual([f, []]);
    }
  });

  it("札・記録・利用の全部を読む所は readAllPages を使う", () => {
    const admin = code("src/lib/admin-users.functions.ts");
    for (const t of ["profiles", "stickers", "usage_events", "review_history"])
      expect(admin).toMatch(new RegExp(`\\.from\\("${t}"\\)[\\s\\S]{0,200}\\.range\\(`));
    expect(admin).not.toMatch(/\.data \?\? \[\]\) as St\[\]/);

    const metrics = code("src/lib/metrics.functions.ts");
    expect(metrics.match(/readAllPages</g)?.length).toBeGreaterThanOrEqual(4);

    const stats = code("src/lib/stats.functions.ts");
    expect(stats).toMatch(/readAllPages<\{ id: string; created_at: string \}>/);
    expect(stats).toMatch(/readAllPages<\{ reviewed_at: string \}>/);
    expect(stats).toMatch(/captured_total: stickers\.length/);

    const scan = code("src/lib/scan.functions.ts");
    const ctx = scan.slice(scan.indexOf("export const getScanContext"));
    expect(ctx.slice(0, 2500)).toMatch(/readAllPages/);
  });

  it("全体の記憶率は新しい記録まで使う（古い順の先頭 1000 件で止まらない）", () => {
    const rv = code("src/lib/reviews.functions.ts");
    const fn = rv.slice(rv.indexOf("export const getOverallMemoryStats"));
    const body = fn.slice(0, fn.indexOf("export const", 10));
    expect(body).toMatch(/\.order\("reviewed_at", \{ ascending: false \}\)/);
    expect(body).toMatch(/const hist = \[\.\.\.histNewestFirst\]\.reverse\(\);/);
    expect(body).not.toMatch(/\.limit\(/);
    const ov = rv.slice(rv.indexOf("export const getMemoryOverview"));
    expect(ov.slice(0, 2500)).toMatch(/readAllPages<unknown>/);
  });
});

describe("L2: profiles は本人の行だけ", () => {
  const dir = "supabase/migrations";
  const latest = fs
    .readdirSync(dir)
    .filter((f) => /profiles_select_own_only/.test(f))
    .map((f) => read(`${dir}/${f}`))[0];

  it("移行は前のポリシーを消して、本人の行だけを許す（何度流しても同じ）", () => {
    expect(latest).toBeTruthy();
    expect(latest).toMatch(/DROP POLICY IF EXISTS "profiles_select_public_or_own"/);
    expect(latest).toMatch(/DROP POLICY IF EXISTS "profiles_select_own"/);
    expect(latest).toMatch(
      /CREATE POLICY "profiles_select_own" ON public\.profiles\s+FOR SELECT TO authenticated\s+USING \(auth\.uid\(\) = id\);/,
    );
    expect(latest).not.toMatch(/onboarded = true/);
  });

  it('アプリが本人の権限で読む profiles は、どれも本人の行（`.eq("id", …)`）', () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) return walk(p);
        return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
      });
    const offenders: string[] = [];
    for (const f of walk("src")) {
      const src = read(f);
      for (const m of src.matchAll(/(\w+)\)?\s*\.from\("profiles"\)/g)) {
        const before = src.slice(Math.max(0, m.index - 40), m.index + m[0].length);
        if (/supabaseAdmin|\bdb\b/.test(before) && /admin|metrics|stripe-webhook/.test(f)) continue;
        const after = src.slice(m.index, m.index + 400);
        if (!/\.eq\("id",/.test(after) && !/count: "exact", head: true/.test(after))
          offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("L3: 単語帳の採点も2回進まない", () => {
  const src = code("src/lib/wordbook.functions.ts");
  const fn = src.slice(src.indexOf("export const gradeWordbookEntry"));
  const body = fn.slice(0, fn.indexOf("export const", 10));

  it("期限がまだ先の語は書かずに duplicate を返す", () => {
    expect(body).toMatch(
      /if \(isAlreadyGraded\(effectiveDueIso\(prev\.due_at, prev\.last_reviewed_at\), nowMs\)\)/,
    );
    expect(body).toMatch(/duplicate: true/);
  });

  it("書く時は読んだ時の期限のままの行だけ（0行なら進めない）", () => {
    expect(body).toMatch(/updateQuery\.eq\("due_at", prev\.due_at\)/);
    expect(body).toMatch(/updated\.length === 0/);
  });
});

describe("L4: 再会のキャッチで写真を黙って消さない", () => {
  const now = new Date("2026-10-03T00:00:00Z");

  it("送られた写真だけを書き、自撮りを付けなければ今の自撮りはそのまま", () => {
    const p = attachPhotoPatch(
      { object_path: "u1/a.jpg", cutout_path: null, selfie_path: null, caption: null },
      "u1",
      now,
    );
    expect(p).toEqual({
      object_image_url: "u1/a.jpg",
      cutout_image_url: null, // 前の写真から作った切り抜きは外す
      taken_at: now.toISOString(),
    });
    expect("selfie_image_url" in p).toBe(false);
    expect("caption" in p).toBe(false);
  });

  it("切り抜きだけ・自撮りつきも書ける", () => {
    expect(attachPhotoPatch({ cutout_path: "u1/c.png" }, "u1", now)).toEqual({
      cutout_image_url: "u1/c.png",
      taken_at: now.toISOString(),
    });
    expect(
      attachPhotoPatch({ object_path: "u1/a.jpg", selfie_path: "u1/s.jpg", lat: 0 }, "u1", now),
    ).toMatchObject({ object_image_url: "u1/a.jpg", selfie_image_url: "u1/s.jpg", lat: 0 });
  });

  it("ほかの人の置き場・上へ出る置き場は断る（黙って null にしない）", () => {
    expect(() => attachPhotoPatch({ object_path: "u2/a.jpg" }, "u1", now)).toThrow();
    expect(() =>
      attachPhotoPatch({ object_path: "u1/a.jpg", selfie_path: "u2/s.jpg" }, "u1", now),
    ).toThrow();
    expect(() => attachPhotoPatch({ object_path: "u1/../u2/a.jpg" }, "u1", now)).toThrow();
  });

  it("写真が1枚も無ければ断る", () => {
    expect(() => attachPhotoPatch({ selfie_path: "u1/s.jpg" }, "u1", now)).toThrow();
    expect(() => attachPhotoPatch({}, "u1", now)).toThrow();
  });
});

describe("L5: 返事の後の記録を落とさない", () => {
  it("waitUntil があれば預けて、待たずに戻る", async () => {
    const handed: Promise<unknown>[] = [];
    let done = false;
    const task = () => new Promise<void>((r) => setTimeout(() => ((done = true), r()), 30));
    await runAfterResponse("t", task, { waitUntil: (p) => handed.push(p) });
    expect(handed).toHaveLength(1);
    expect(done).toBe(false);
    await handed[0];
    expect(done).toBe(true);
  });

  it("Workers で waitUntil が無ければ、上限まで待つ", async () => {
    let done = false;
    await runAfterResponse("t", async () => void (done = true), {
      waitUntil: null,
      workers: true,
    });
    expect(done).toBe(true);
    const t0 = Date.now();
    await runAfterResponse("slow", () => new Promise((r) => setTimeout(r, 5000)), {
      waitUntil: null,
      workers: true,
      timeoutMs: 50,
    });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("仕事の失敗は投げない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handed: Promise<unknown>[] = [];
    await runAfterResponse(
      "boom",
      async () => {
        throw new Error("x");
      },
      { waitUntil: (p) => handed.push(p) },
    );
    await expect(handed[0]).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
