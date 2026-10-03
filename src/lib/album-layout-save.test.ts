/**
 * アルバムの配置は1回で、全部か何も無しかで保存する（監査 2026-10-03 M6）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { albumLayoutRpcItems, isMissingRpc } from "./stickers.functions";

const MIGRATION = "supabase/migrations/20261003130200_save_album_layout_rpc.sql";

describe("albumLayoutRpcItems", () => {
  it("列の名前に直し、無い座標は null（前の1枚ずつの書き方と同じ値）", () => {
    expect(
      albumLayoutRpcItems([
        { sticker_id: "a", order: 0, size: "small", x: 0.5, y: 1.2, scale: 1, rot: -3 },
        { sticker_id: "b", order: 1, size: "large" },
      ]),
    ).toEqual([
      {
        sticker_id: "a",
        album_order: 0,
        album_size: "small",
        album_x: 0.5,
        album_y: 1.2,
        album_scale: 1,
        album_rot: -3,
      },
      {
        sticker_id: "b",
        album_order: 1,
        album_size: "large",
        album_x: null,
        album_y: null,
        album_scale: null,
        album_rot: null,
      },
    ]);
  });
});

describe("isMissingRpc（移行待ちの見分け）", () => {
  it("関数が無い時だけ true", () => {
    expect(isMissingRpc({ code: "PGRST202" }, "save_album_layout")).toBe(true);
    expect(isMissingRpc({ code: "42883" }, "save_album_layout")).toBe(true);
    expect(
      isMissingRpc(
        { message: "Could not find the function public.save_album_layout(p_items)" },
        "save_album_layout",
      ),
    ).toBe(true);
    // 制約違反などは「無い」ではない（丸ごと失敗として投げる）。
    expect(
      isMissingRpc(
        { code: "23514", message: 'violates check constraint "stickers_album_size_check"' },
        "save_album_layout",
      ),
    ).toBe(false);
    expect(isMissingRpc(null, "save_album_layout")).toBe(false);
  });
});

describe("saveAlbumLayout の道", () => {
  const src = readFileSync("src/lib/stickers.functions.ts", "utf8");
  const body = src.slice(src.indexOf("export const saveAlbumLayout"));

  it("まず1回の RPC。1枚ずつの UPDATE は関数が無い時だけ", () => {
    const rpcAt = body.indexOf('.rpc("save_album_layout"');
    const loopAt = body.indexOf("for (const item of data.items)");
    expect(rpcAt).toBeGreaterThan(-1);
    expect(loopAt).toBeGreaterThan(rpcAt);
    expect(body.slice(rpcAt, loopAt)).toMatch(/isMissingRpc\(rpc\.error, "save_album_layout"\)/);
  });

  it("移行: 呼んだ人の権限で、自分の札だけを1つの文で書く。何度流しても同じ", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/create or replace function public\.save_album_layout\(p_items jsonb\)/);
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/s\.user_id = v_uid/);
    expect(sql).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/jsonb_array_length\(p_items\) > 500/);
    expect(sql).toMatch(
      /revoke all on function public\.save_album_layout\(jsonb\) from public, anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.save_album_layout\(jsonb\) to authenticated/,
    );
    expect(sql).not.toMatch(/security definer/i);
  });
});
