import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **DB の変更は `supabase/migrations/` を見れば全部分かる**（2026-10-01）。
 *
 * Lovable は DB の変更を `drizzle/migrations/` にも書く。そちらにしか無い変更は、
 * `supabase/migrations/` だけを見ても本番に何が入っているか分からない（実際、words の
 * 追加の締め付けが drizzle 側にしか無かった）。drizzle 側に足された変更は、必ず
 * `supabase/migrations/` のどれかに写し、ファイル名を書いておく。
 */
describe("drizzle/migrations の変更は supabase/migrations にも在る", () => {
  it("drizzle 側のどのファイルも、supabase 側のどこかに名前が書いてある", () => {
    const drizzleDir = "drizzle/migrations";
    const drizzle = fs
      .readdirSync(drizzleDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => `${drizzleDir}/${f}`);
    const supabaseText = fs
      .readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join("supabase/migrations", f), "utf8"))
      .join("\n");
    expect(drizzle.filter((f) => !supabaseText.includes(f))).toEqual([]);
  });
});
