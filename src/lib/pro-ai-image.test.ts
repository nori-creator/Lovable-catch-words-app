/**
 * Pro の「AIで絵を作る」（オーナー指示 2026-10-07）。
 * - Pro かどうかは**サーバで**確かめ、Pro でない人には枠も数えず作らない
 * - 作る前に枠を確保する（`pro_image`。`ai-cap.ts`）
 * - 返すのは data URL（保存は差し替えと同じ道）
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import {
  PRO_ONLY_IMAGE_MESSAGE,
  generateProImageWith,
  proImageQuery,
  type ProImageDeps,
} from "./images.functions";
import { DAILY_CAPS, dailyCapFor, dailyCapMessage } from "./ai-cap";

const deps = (over: Partial<ProImageDeps> = {}) => {
  const order: string[] = [];
  const d: ProImageDeps = {
    isPaidPro: async () => true,
    readWord: async () => ({ headword: "柚子", meaning: "ゆず（果物）、かんきつ" }),
    reserve: async () => {
      order.push("reserve");
    },
    generate: async (query, reserve) => {
      await reserve();
      order.push(`generate:${query}`);
      return { url: "data:image/png;base64,AAAA", thumb: "", source: "ai" };
    },
    toDataUrl: async (url) => {
      order.push(`fetch:${url}`);
      return "data:image/png;base64,BBBB";
    },
    ...over,
  };
  return { d, order };
};

describe("generateProImageWith", () => {
  it("Pro の人: 枠を確保してから作り、data URL を返す", async () => {
    const { d, order } = deps();
    await expect(generateProImageWith(d)).resolves.toEqual({
      url: "data:image/png;base64,AAAA",
      source: "ai",
    });
    expect(order).toEqual(["reserve", "generate:柚子 (ゆず)"]);
  });

  it("**Pro でない人には枠も数えず作らない**（画面の判定は信じない）", async () => {
    const { d, order } = deps({ isPaidPro: async () => false });
    await expect(generateProImageWith(d)).rejects.toThrow(PRO_ONLY_IMAGE_MESSAGE);
    expect(order).toEqual([]);
    // 画面の言語の文に直せる（`errors.ts` の「Pro 限定」）。
    expect(PRO_ONLY_IMAGE_MESSAGE).toMatch(/Pro 限定/);
  });

  it("枠に届いたら作らずに上限の理由を返す", async () => {
    const { d, order } = deps({
      reserve: async () => {
        throw new Error(dailyCapMessage(DAILY_CAPS.pro_image));
      },
    });
    await expect(generateProImageWith(d)).rejects.toThrow("AI_DAILY_CAP");
    expect(order).toEqual([]);
  });

  it("自分の札の語が読めなければ作らない", async () => {
    const { d, order } = deps({ readWord: async () => null });
    await expect(generateProImageWith(d)).rejects.toThrow("見つかりません");
    expect(order).toEqual([]);
  });

  it("作れなかった時は読める理由で失敗する（成功と言わない）", async () => {
    const { d } = deps({ generate: async () => null });
    await expect(generateProImageWith(d)).rejects.toThrow("生成できませんでした");
  });

  it("URL で返ってきた絵はサーバで data URL にする", async () => {
    const { d, order } = deps({
      generate: async () => ({ url: "https://cdn.example/x.png", thumb: "", source: "ai" }),
    });
    await expect(generateProImageWith(d)).resolves.toHaveProperty(
      "url",
      "data:image/png;base64,BBBB",
    );
    expect(order).toContain("fetch:https://cdn.example/x.png");
  });
});

describe("proImageQuery", () => {
  it("語と意味の最初の1つ。意味が無ければ語だけ", () => {
    expect(proImageQuery({ headword: "柚子", meaning: "ゆず、かんきつ" })).toBe("柚子 (ゆず)");
    expect(proImageQuery({ headword: "apple", meaning: null })).toBe("apple");
  });
});

describe("枠と画面", () => {
  it("Pro の絵は自分の枠を持ち、匿名の人には使わせない", () => {
    expect(DAILY_CAPS.pro_image).toBeGreaterThan(0);
    expect(DAILY_CAPS.pro_image).toBeLessThanOrEqual(50);
    expect(dailyCapFor("pro_image", "anonymous")).toBe(0);
  });

  it("ボタンは Pro の人だけに出し、作っている間は回る", () => {
    const sheet = fs.readFileSync(path.join(__dirname, "../components/StickerSheet.tsx"), "utf8");
    expect(sheet).toMatch(/isPro && onGenerateAi && \(/);
    expect(sheet).toMatch(/t\("card\.aiImage"\)/);
    expect(sheet).toMatch(/generatingAi \? \(\s*<Loader2/);
    const hook = fs.readFileSync(path.join(__dirname, "../hooks/use-auto-hero.ts"), "utf8");
    expect(hook).toMatch(/generateProImageFn\(\{ data: \{ sticker_id: s\.id \} \}\)/);
  });
});
