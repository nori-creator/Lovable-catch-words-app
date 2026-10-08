import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyStickerPlaceholder } from "./stickers.functions";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** 札の仮画像を書く問い合わせの偽物。`hit` は「まだ空だった」か。 */
function fake(hit: boolean) {
  const calls: string[] = [];
  const removed: string[][] = [];
  const result = (rows: unknown[] | null) => ({ data: rows, error: null });
  const client = {
    from: (table: string) => ({
      update: (row: unknown) => {
        calls.push(`update ${table} ${JSON.stringify(row)}`);
        const u = {
          eq: () => u,
          is: (col: string, v: unknown) => {
            calls.push(`is ${col} ${String(v)}`);
            return u;
          },
          select: async () => result(hit ? [{ id: "s1" }] : []),
          then: (ok: (v: unknown) => unknown) => Promise.resolve(result(null)).then(ok),
        };
        return u;
      },
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
  };
  return { client, calls, removed };
}

const base = { sticker_id: "00000000-0000-4000-8000-000000000001", placeholder_path: "u1/p.jpg" };

describe("札の仮画像（自動の1枚は、絵がまだ無い時だけ）", () => {
  it("自動の経路（only_if_empty）は、空の札にだけ入れる", async () => {
    const f = fake(true);
    expect(await applyStickerPlaceholder(f.client, "u1", { ...base, only_if_empty: true })).toEqual(
      { ok: true, applied: true },
    );
    expect(f.calls).toContain("is placeholder_image_url null");
    expect(f.removed).toEqual([]);
  });

  it("もう絵が在れば上書きせず、今アップロードした1枚を片付ける", async () => {
    const f = fake(false);
    expect(await applyStickerPlaceholder(f.client, "u1", { ...base, only_if_empty: true })).toEqual(
      { ok: true, applied: false },
    );
    expect(f.removed).toEqual([["u1/p.jpg"]]);
  });

  it("手で差し替える・Pro の AI の絵は、今までどおり上書きする", async () => {
    const f = fake(false);
    expect(await applyStickerPlaceholder(f.client, "u1", base)).toEqual({
      ok: true,
      applied: true,
    });
    expect(f.calls.some((c) => c.startsWith("is "))).toBe(false);
    expect(f.removed).toEqual([]);
  });

  it("他人のフォルダの画像は受け取らない", async () => {
    await expect(
      applyStickerPlaceholder(fake(true).client, "u1", { ...base, placeholder_path: "u2/p.jpg" }),
    ).rejects.toThrow();
  });

  it("文字で調べた語の札は、再会（もう持っている札）に自動の1枚を付けない", () => {
    const cap = source("components/screens/CaptureScreen.tsx");
    expect(cap).toMatch(
      /if \(art\.kind !== "photo" && !res\.reencounter\) void webHero\.attach\(res\.id, selectedHead\);/,
    );
    // 文字で調べた語の札の絵は `use-catch-images`（2026-10-08、札の下で選び直せる）。
    const hook = source("hooks/use-catch-images.ts");
    expect(hook).toMatch(/only_if_empty: true/);
    // 手で選ぶ・AI の絵（`use-auto-hero` の差し替え）は上書きしてよい。
    const swap = source("hooks/use-auto-hero.ts");
    const save = swap.slice(swap.indexOf("async function saveAsPlaceholder"));
    expect(save.slice(0, save.indexOf("\n  }\n"))).not.toMatch(/only_if_empty/);
  });

  it("剥がす札は、掴んだ時点で絵を決着させる（剥がしている途中で替えない）", () => {
    const peel = source("components/PeelSticker.tsx");
    expect(peel).toMatch(/function begin\(next: PeelDrag\) \{[^}]*live\.current\.onGrab\?\.\(\);/);
    const cap = source("components/screens/CaptureScreen.tsx");
    expect(cap).toMatch(/onGrab=\{onGrab\}/);
    // 2026-10-08 から、文字で調べた語の札は**絵を探し終えてから**出す（`peelReady`）。
    // 出た後に札の絵が替わるのは、人が「別の画像」を押した時だけ（`use-catch-images`）。
    expect(cap).toMatch(/imageSettled: !!objectImageRef\.current \|\| webHero\.settled/);
    const hook = source("hooks/use-catch-images.ts");
    expect(hook).toMatch(
      /s\.key === key && !s\.settled \? \{ \.\.\.s, chosen: c, shown, settled: true \}/,
    );
    // 剥がしている・飛んでいる間は「別の画像」を押させない。
    expect(cap).toMatch(/swapping=\{saving \|\| landing \? "busy" : webHero\.swapping\}/);
  });
});
