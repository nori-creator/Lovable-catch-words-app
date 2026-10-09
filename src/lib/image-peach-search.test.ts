/**
 * **1字の語（桃）の写真**（オーナー報告 2026-10-09「桃の写真になぜか鳩の画像が出る。ユーザーが
 * 見たいものを正確に理解し、適切な画像が表示されるようにして。」）。
 *
 * 保存した「桃」の札の詳細に、`111年夏季桃園市信鴿協會`（桃園の鳩の協会の貼り紙）の写真と、
 * 関係の無い少女の写真が並んだ。見本は `__fixtures__/image-search-peach.json`。
 * ネットにも AI にも出ない（fetch と AI は差し替える）。
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  },
}));

import { searchImagesWith } from "./images.functions";
import { resetOpenverseState } from "./image-providers";
import { isWeakHeadword, learningMatch, mergeLanes } from "./image-sources";
import { hasNonSubjectSignals, hasPosterSignals, isConfidentMatch } from "./image-search-rank";
import { imageSensePrompt, imageVerifyPrompt } from "./image-sense";
import type { ImageSenseDeps } from "./image-sense.server";

const fx = JSON.parse(
  fs.readFileSync(path.join(__dirname, "__fixtures__", "image-search-peach.json"), "utf8"),
) as Record<string, unknown>;

/** 図鑑の詳細と同じ入り方: 英語の検索語の無いカード（意味の欄が見出し語と同じ「桃」）。 */
const DETAIL = {
  query: "桃",
  language: "zh-TW",
  purpose: "candidates" as const,
  category: "fruit",
  headword: "桃",
  meaning: "桃",
};

function route(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(String(url));
    if (u.hostname === "api.unsplash.com") return Response.json(fx.unsplash);
    if (u.hostname === "commons.wikimedia.org") {
      if (u.searchParams.get("titles")) return Response.json(fx.wikiLeadInfo);
      const learning = (u.searchParams.get("gsrsearch") ?? "").includes('"');
      return Response.json(learning ? fx.commonsLearning : { query: { pages: {} } });
    }
    if (u.hostname.endsWith("wikipedia.org")) return Response.json(fx.wikiLead);
    if (u.hostname === "api.openverse.org") return Response.json(fx.openverse);
    throw new Error(`unexpected fetch ${u}`);
  });
}

const PEACH_URL = /peach|44444444/i;

/** 絵を見た AI の代わり: 桃の実の写真だけ合っていると答える。 */
function visionDeps(): ImageSenseDeps & {
  verify: ReturnType<typeof vi.fn>;
  resolveSense: ReturnType<typeof vi.fn>;
} {
  return {
    resolveSense: vi.fn(async () => ({
      query: "peach fruit",
      avoid: ["blossom"],
      sense: "peach fruit (Prunus persica), whole or cut",
      variants: ["桃子", "水蜜桃"],
    })),
    verify: vi.fn(async ({ images }: { images: Array<{ url: string }> }) => {
      const matched = new Set<number>();
      images.forEach((im, i) => {
        if (PEACH_URL.test(decodeURIComponent(im.url))) matched.add(i);
      });
      return { checked: images.map((_, i) => i), matched };
    }),
  } as never;
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  resetOpenverseState();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("IMAGE_PROVIDER", "off");
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-only");
  vi.stubEnv("IMAGE_SEARCH_PROVIDERS", "");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("1字の語の題・タグの一致（learningMatch）", () => {
  it("桃は1字の語", () => {
    expect(isWeakHeadword("桃")).toBe(true);
    expect(isWeakHeadword("杯")).toBe(true);
    expect(isWeakHeadword("桃子")).toBe(false);
    expect(isWeakHeadword("嘴邊肉")).toBe(false);
    expect(isWeakHeadword("peach")).toBe(false);
  });
  it("長い語の中（桃園・水蜜桃）の桃は手がかりにしない", () => {
    expect(learningMatch("111年夏季桃園市信鴿協會", ["桃"])).toBe("none");
    expect(learningMatch("桃園火車站", ["桃"])).toBe("none");
    expect(learningMatch("拉拉山的水蜜桃", ["桃"])).toBe("none");
  });
  it("単独の桃（題・タグ）も「確か」とは言わない（人の名前・1字ずつのタグ）", () => {
    expect(learningMatch("桃 | portrait | girl", ["桃"])).toBe("related");
    expect(learningMatch("111年夏季桃園市信鴿協會 | 桃 | 信鴿", ["桃"])).toBe("related");
  });
  it("2字以上の言い方（桃子・水蜜桃）は今までどおり確か", () => {
    expect(learningMatch("拉拉山的 水蜜桃", ["桃", "桃子", "水蜜桃"])).toBe("exact");
    expect(learningMatch("桃子 | 水果", ["桃", "桃子"])).toBe("exact");
  });
  it("2字以上の語の切れ目の判定は変わらない（嘴邊肉・豆腐）", () => {
    expect(learningMatch("嘴邊肉.jpg", ["嘴邊肉"])).toBe("exact");
    expect(learningMatch("臭豆腐", ["豆腐"])).toBe("related");
  });
  it("mergeLanes: 桃園の写真は捨て、単独の桃は近い物止まり", () => {
    const out = mergeLanes({
      learning: [
        {
          url: "https://x/1.jpg",
          thumb: "",
          source: "commons",
          lane: "learning",
          text: "桃園火車站",
        },
        {
          url: "https://x/2.jpg",
          thumb: "",
          source: "openverse",
          lane: "learning",
          text: "桃 | 鴿子",
        },
      ],
      english: [],
      forms: ["桃"],
    });
    expect(out.map((c) => c.url)).toEqual(["https://x/2.jpg"]);
    expect(out[0].exact).toBeUndefined();
  });
});

describe("貼り紙・人の写真の手がかり", () => {
  const ctx = { query: "peach fruit", category: "fruit" };
  it("協會の貼り紙・少女の写真は主役が物ではない", () => {
    expect(hasNonSubjectSignals("111年夏季桃園市信鴿協會 | 桃 | 信鴿", ctx)).toBe(true);
    expect(hasNonSubjectSignals("桃 | portrait | girl | 少女", ctx)).toBe(true);
    expect(hasNonSubjectSignals("拉拉山的 水蜜桃 Peaches in Taiwan", ctx)).toBe(false);
  });
  it("語が人・表示の語なら数えない", () => {
    expect(hasNonSubjectSignals("portrait of a girl", { query: "girl", category: "person" })).toBe(
      false,
    );
    expect(hasPosterSignals("movie poster", { query: "poster", category: "document" })).toBe(false);
  });
  it("「peach」と書いてあっても貼り紙は説明だけで確かとは言わない", () => {
    expect(isConfidentMatch("fresh peaches in a bowl", ctx)).toBe(true);
    expect(isConfidentMatch("peach festival poster", ctx)).toBe(false);
  });
});

describe("意味を決める・確かめる AI への指示", () => {
  it("意味の欄が見出し語と同じ（桃 = 桃）でも、1字の語はよくある物（peach fruit）に決める", () => {
    const p = imageSensePrompt({ headword: "桃", meaning: "桃", language: "zh-TW" });
    expect(p).toMatch(/same characters as the word/);
    expect(p).toMatch(/桃 → peach fruit/);
    expect(p).toMatch(/桃園/);
    expect(p).toMatch(/桃 → 桃子, 水蜜桃/);
  });
  it("貼り紙・人の写真を外れと言わせる", () => {
    const p = imageVerifyPrompt({
      headword: "桃",
      meaning: "桃",
      language: "zh-TW",
      sense: { query: "peach fruit", avoid: [] },
      count: 3,
    });
    expect(p).toMatch(/posters, flyers/);
    expect(p).toMatch(/main subject is a person/);
  });
});

describe("searchImagesWith — 桃（詳細の「別の画像」・自動の1枚）", () => {
  it("鳩の貼り紙・少女・桃園駅は出さず、桃の実の写真だけ", async () => {
    route(fetchMock);
    const d = visionDeps();
    const out = await searchImagesWith(DETAIL, async () => undefined, d);
    const urls = out.candidates.map((c) => decodeURIComponent(c.url));

    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(PEACH_URL);
    expect(urls.some((u) => /Pigeon|pigeon|girl|Taoyuan|11111111|22222222|33333333/.test(u))).toBe(
      false,
    );
    // 確かめた（1字の語は題・タグを信じない）。
    expect(d.verify).toHaveBeenCalled();
    // 意味を決める AI に、見出し語と意味（同じ字）を渡した。
    expect(d.resolveSense).toHaveBeenCalledWith(
      expect.objectContaining({ headword: "桃", meaning: "桃", language: "zh-TW" }),
    );
  });

  it("学習言語の出所は 2字以上の言い方（桃子・水蜜桃）で引く。英語は決めた検索語で", async () => {
    route(fetchMock);
    await searchImagesWith(DETAIL, async () => undefined, visionDeps());
    const calls = fetchMock.mock.calls.map(([u]) => new URL(String(u)));
    const ov = calls.find((u) => u.hostname === "api.openverse.org");
    expect(ov?.searchParams.get("q")).toBe('"桃子" | "水蜜桃"');
    const commonsZh = calls.filter(
      (u) =>
        u.hostname === "commons.wikimedia.org" && u.searchParams.get("gsrsearch")?.includes('"'),
    );
    expect(commonsZh.length).toBeGreaterThan(0);
    for (const u of commonsZh) expect(u.searchParams.get("gsrsearch")).not.toMatch(/"桃"/);
    const un = calls.find((u) => u.hostname === "api.unsplash.com");
    expect(un?.searchParams.get("query")).toBe("peach fruit");
  });

  it("絵を確かめられない時（同意・枠・時間切れ）も、鳩・少女は出さない", async () => {
    route(fetchMock);
    const d = visionDeps();
    d.verify.mockResolvedValue(null);
    const out = await searchImagesWith(DETAIL, async () => undefined, d);
    const urls = out.candidates.map((c) => decodeURIComponent(c.url));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(PEACH_URL);
  });

  it("剥がす札（英語の検索語つき・棚なし）も同じ道: 鳩・少女は出さない", async () => {
    route(fetchMock);
    const d = visionDeps();
    const out = await searchImagesWith(
      { ...DETAIL, query: "peach", category: null, meaning: "桃" },
      async () => undefined,
      d,
    );
    const urls = out.candidates.map((c) => decodeURIComponent(c.url));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(PEACH_URL);
  });
});
