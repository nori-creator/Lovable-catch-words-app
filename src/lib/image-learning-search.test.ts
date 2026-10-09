/**
 * **学習言語で探す**（オーナー報告 2026-10-09「嘴邊肉の画像が明らかに英語で検索された画像が
 * 表示される。必ず学習言語で検索して」）。見本は `__fixtures__/image-search-pork-cheek.json`。
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
import { resetOpenverseState, enabledProviders } from "./image-providers";
import {
  dedupeImages,
  flickrSmall,
  learningMatch,
  openverseCandidates,
  openverseSearchUrl,
  photoIdentity,
  readWikiLead,
  wantsLearningLane,
} from "./image-sources";
import { needsVerification, parseImageSense, imageVerifyPrompt } from "./image-sense";
import { assertAllowedImageUrl } from "./image-proxy";
import type { ImageSenseDeps } from "./image-sense.server";

const fx = JSON.parse(
  fs.readFileSync(path.join(__dirname, "__fixtures__", "image-search-pork-cheek.json"), "utf8"),
) as Record<string, unknown>;

const WORD = {
  query: "pork cheek",
  language: "zh-TW",
  purpose: "candidates" as const,
  category: "food",
  headword: "嘴邊肉",
  meaning: "豚の口の周りの肉",
};

type Route = {
  openverse?: () => Response;
  wiki?: unknown;
  commonsLearning?: unknown;
};

function route(fetchMock: ReturnType<typeof vi.fn>, r: Route = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(String(url));
    if (u.hostname === "api.unsplash.com") return Response.json(fx.unsplash);
    if (u.hostname === "commons.wikimedia.org") {
      if (u.searchParams.get("titles")) return Response.json(fx.wikiLeadInfo);
      const learning = (u.searchParams.get("gsrsearch") ?? "").includes('"');
      return Response.json(
        learning ? (r.commonsLearning ?? fx.commonsLearning) : fx.commonsEnglish,
      );
    }
    if (u.hostname.endsWith("wikipedia.org"))
      return Response.json(r.wiki ?? { query: { pages: [{ title: "嘴邊肉", missing: true }] } });
    if (u.hostname === "api.openverse.org")
      return r.openverse ? r.openverse() : Response.json(fx.openverse);
    throw new Error(`unexpected fetch ${u}`);
  });
}

/** 絵を見た AI の代わり: 嘴邊肉そのもの（学習言語の写真）だけ合っていると答える。 */
function visionDeps(): ImageSenseDeps & { verify: ReturnType<typeof vi.fn> } {
  return {
    resolveSense: vi.fn(async () => ({
      query: "pork cheek",
      avoid: [],
      sense: "Taiwanese braised pork jowl meat, sliced, as served in heibaiqie",
      context: "黑白切",
    })),
    verify: vi.fn(async ({ images }: { images: Array<{ url: string }> }) => {
      const matched = new Set<number>();
      images.forEach((im, i) => {
        if (/b1\/|c1\/|staticflickr|f1\//.test(decodeURIComponent(im.url))) matched.add(i);
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

describe("searchImagesWith — 嘴邊肉（豚の口の周りの肉）", () => {
  it("**前の動き**: 英語だけで探していた時、パエリア（2回）・別の料理が並んだ", async () => {
    // 見出し語を送らない古い呼び出し = 英語だけで探す道（説明で確かなので確かめもしない）。
    route(fetchMock);
    const out = await searchImagesWith(
      { query: "pork cheek", language: "zh-TW", purpose: "candidates", category: "food" },
      async () => undefined,
    );
    const urls = out.candidates.map((c) => c.url);
    expect(urls.some((u) => u.includes("paella1"))).toBe(true);
    // 同じ写真（URL の後ろだけ違う）は1枚に。
    expect(urls.filter((u) => u.includes("paella1"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("openverse"))).toBe(false);
  });

  it("学習言語（嘴邊肉）で探し、見出し語そのものの写真を先頭に。英語のパエリア・別の料理は出さない", async () => {
    route(fetchMock);
    const d = visionDeps();
    const out = await searchImagesWith(WORD, async () => undefined, d);
    const urls = out.candidates.map((c) => decodeURIComponent(c.url));

    // 学習言語で引いた: Openverse（引用付きの見出し語・商用で改変してよい物だけ）と Commons。
    const ov = fetchMock.mock.calls.find(([u]) => String(u).includes("api.openverse.org"));
    const ovUrl = new URL(String(ov?.[0]));
    expect(ovUrl.searchParams.get("q")).toBe('"嘴邊肉"');
    expect(ovUrl.searchParams.get("license_type")).toBe("commercial,modification");
    const commonsZh = fetchMock.mock.calls
      .map(([u]) => new URL(String(u)))
      .find(
        (u) =>
          u.hostname === "commons.wikimedia.org" &&
          u.searchParams.get("gsrsearch")?.includes("嘴邊肉"),
      );
    expect(commonsZh?.searchParams.get("gsrsearch")).toBe('filetype:bitmap "嘴邊肉"');

    expect(urls.slice(0, 3)).toEqual([
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/嘴邊肉.jpg/960px-嘴邊肉.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Tainan_heibaiqie.jpg/960px-Tainan_heibaiqie.jpg",
      "https://live.staticflickr.com/65535/51234567890_abcdef1234_b.jpg",
    ]);
    expect(urls).toHaveLength(3);
    // パエリア・皿の牛肉・西洋の煮込み・別の麺・「肉」だけ合った物・NC の写真は出ない。
    expect(urls.some((u) => /unsplash|Carrilleras|Noodles|Hongshaorou|5999/.test(u))).toBe(false);
    // 同じ Flickr の写真（大きさ違い）は1枚。
    expect(urls.filter((u) => u.includes("51234567890"))).toHaveLength(1);
    // 絵の確かめは1回（英語の題は「確か」と見なさない）。指示に見出し語と日本語の意味。
    expect(d.verify).toHaveBeenCalledTimes(1);
    const arg = d.verify.mock.calls[0][0] as { sense: { context?: string }; timeoutMs: number };
    expect(arg.sense.context).toBe("黑白切");
    expect(arg.timeoutMs).toBeLessThanOrEqual(4_000);
    // Openverse の候補の一覧の絵は Flickr の小さい版。帰属は作者と条件。
    const flickr = out.candidates.find((c) => c.source === "openverse");
    expect(flickr?.thumb).toBe("https://live.staticflickr.com/65535/51234567890_abcdef1234_w.jpg");
    expect(flickr?.credit?.name).toBe("foodie_tw / CC BY 2.0");
  });

  it("Wikipedia に見出し語の記事が在れば、その先頭の絵を一番前に", async () => {
    route(fetchMock, { wiki: fx.wikiLead });
    const out = await searchImagesWith(WORD, async () => undefined, visionDeps());
    expect(decodeURIComponent(out.candidates[0].url)).toContain("f1/嘴邊肉_台南.jpg");
    const asked = fetchMock.mock.calls
      .map(([u]) => new URL(String(u)))
      .find((u) => u.hostname === "zh.wikipedia.org");
    expect(asked?.searchParams.get("titles")).toBe("嘴邊肉");
    expect(asked?.searchParams.get("converttitles")).toBe("1");
  });

  it("別の記事へ回された（嘴邊肉 → 黑白切）先頭の絵は「そのもの」ではない", () => {
    expect(readWikiLead(fx.wikiLeadRedirected as never)).toEqual({
      file: "Heibaiqie_platter.jpg",
      sameArticle: false,
    });
    expect(readWikiLead(fx.wikiLead as never)?.sameArticle).toBe(true);
  });

  it("Openverse が 429（回数の上限）でも他の出所で続け、しばらく Openverse を呼ばない", async () => {
    route(fetchMock, {
      openverse: () =>
        new Response("slow down", { status: 429, headers: { "retry-after": "120" } }),
    });
    const out = await searchImagesWith(WORD, async () => undefined, visionDeps());
    expect(out.candidates.length).toBeGreaterThan(0);
    expect(decodeURIComponent(out.candidates[0].url)).toContain("嘴邊肉.jpg");
    const count = () =>
      fetchMock.mock.calls.filter(([u]) => String(u).includes("api.openverse.org")).length;
    expect(count()).toBe(1);
    await searchImagesWith(WORD, async () => undefined, visionDeps());
    expect(count()).toBe(1);
  });

  it("登録した鍵（OPENVERSE_CLIENT_ID/SECRET）が在れば受け取った鍵で引く", async () => {
    vi.stubEnv("OPENVERSE_CLIENT_ID", "id");
    vi.stubEnv("OPENVERSE_CLIENT_SECRET", "secret");
    route(fetchMock);
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/auth_tokens/token/"))
        return Response.json({ access_token: "tok", expires_in: 3600 });
      return base(url, init);
    });
    await searchImagesWith(WORD, async () => undefined, visionDeps());
    const search = fetchMock.mock.calls.find(([u]) => String(u).includes("/v1/images/?"));
    expect((search?.[1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("確かめて1枚も残らなければ**写真を返さない**（外れの写真より語の札）。勝手に絵も作らない", async () => {
    vi.stubEnv("IMAGE_PROVIDER", "lovable");
    vi.stubEnv("LOVABLE_API_KEY", "test-only");
    route(fetchMock, {
      commonsLearning: { query: { pages: {} } },
      openverse: () => Response.json({ results: [] }),
    });
    const reserve = vi.fn(async () => undefined);
    const d = visionDeps();
    d.verify.mockImplementation(async ({ images }: { images: unknown[] }) => ({
      checked: images.map((_, i) => i),
      matched: new Set<number>(),
    }));
    const out = await searchImagesWith(WORD, reserve, d);
    expect(out.candidates).toEqual([]);
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("ai.gateway"))).toBe(false);
  });

  it("確かめられない（同意・枠・時間切れ）時は、学習言語の見出し語そのものの写真を先頭に残す", async () => {
    route(fetchMock);
    const d = visionDeps();
    d.verify.mockResolvedValue(null);
    const out = await searchImagesWith(WORD, async () => undefined, d);
    const urls = out.candidates.map((c) => decodeURIComponent(c.url));
    expect(urls[0]).toContain("嘴邊肉.jpg");
    expect(urls.slice(0, 3).every((u) => !u.includes("unsplash"))).toBe(true);
    // 説明で確かでない英語の写真（皿の牛肉）・近いだけの学習言語の写真（麺）は出さない。
    expect(urls.some((u) => /plate4|Noodles/.test(u))).toBe(false);
  });

  it("IMAGE_SEARCH_PROVIDERS で出所を絞れる（Openverse を止める）", async () => {
    vi.stubEnv("IMAGE_SEARCH_PROVIDERS", "wikipedia,commons,unsplash,commons-en");
    route(fetchMock);
    await searchImagesWith(WORD, async () => undefined, visionDeps());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("openverse"))).toBe(false);
    expect(enabledProviders({}).map((p) => p.id)).toEqual([
      "wikipedia",
      "commons",
      "openverse",
      "unsplash",
      "commons-en",
    ]);
  });
});

describe("学習言語の判定・重複（純粋な部分）", () => {
  it("learningMatch: 字の切れ目で出てくれば exact、他の語の中なら related、無ければ none", () => {
    const forms = ["嘴邊肉"];
    expect(learningMatch("嘴邊肉", forms)).toBe("exact");
    expect(learningMatch("台南黑白切 嘴邊肉 豬頭皮", forms)).toBe("exact");
    expect(learningMatch("IMG_1 | 黑白切 | 嘴邊肉", forms)).toBe("exact");
    expect(learningMatch("嘴邊肉麵", forms)).toBe("related");
    expect(learningMatch("臭豆腐", ["豆腐"])).toBe("related");
    expect(learningMatch("紅燒肉 | 肉", forms)).toBe("none");
    expect(learningMatch("黑白切 拼盤", forms, "黑白切")).toBe("related");
    // 簡体字の書き方も（意味を決める AI がくれた別の書き方）。
    expect(learningMatch("嘴边肉", ["嘴邊肉", "嘴边肉"])).toBe("exact");
  });

  it("photoIdentity / dedupeImages: 大きさ・URL の後ろが違っても同じ写真は1枚", () => {
    expect(photoIdentity("https://images.unsplash.com/photo-abc?w=400")).toBe(
      photoIdentity("https://images.unsplash.com/photo-abc?w=1080"),
    );
    expect(
      photoIdentity("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg"),
    ).toBe(photoIdentity("https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg"));
    expect(photoIdentity("https://live.staticflickr.com/65535/123_abc_b.jpg")).toBe("flickr:123");
    const out = dedupeImages([
      {
        url: "https://a.example/1.jpg",
        thumb: "",
        source: "x",
        text: "same paella photo here",
        credit: { name: "B", link: "" },
      },
      {
        url: "https://a.example/2.jpg",
        thumb: "",
        source: "x",
        text: "same paella photo here",
        credit: { name: "B", link: "" },
      },
      {
        url: "https://a.example/3.jpg",
        thumb: "",
        source: "x",
        text: "same paella photo here",
        credit: { name: "C", link: "" },
      },
    ]);
    expect(out.map((c) => c.url)).toEqual(["https://a.example/1.jpg", "https://a.example/3.jpg"]);
  });

  it("openverseCandidates: NC・ND・成人向けは捨て、Flickr 以外の原寸は Openverse の縮小版で", () => {
    const out = openverseCandidates(
      {
        results: [
          {
            id: "1",
            title: "a",
            url: "https://example.org/x.jpg",
            thumbnail: "https://api.openverse.org/v1/images/1/thumb/",
            creator: "p",
            license: "by-sa",
            license_version: "4.0",
          },
          {
            id: "2",
            title: "b",
            url: "https://live.staticflickr.com/1/2_ab_b.jpg",
            creator: "p",
            license: "by-nd",
          },
          {
            id: "3",
            title: "c",
            url: "https://live.staticflickr.com/1/3_ab_b.jpg",
            creator: "",
            license: "by",
          },
          {
            id: "4",
            title: "d",
            url: "https://live.staticflickr.com/1/4_ab.jpg",
            creator: "",
            license: "cc0",
          },
        ],
      },
      (u) => u.includes("staticflickr"),
      10,
    );
    expect(out.map((c) => c.url)).toEqual([
      "https://api.openverse.org/v1/images/1/thumb/",
      "https://live.staticflickr.com/1/4_ab.jpg",
    ]);
    expect(out[1].credit?.name).toBe("CC0");
    expect(flickrSmall("https://live.staticflickr.com/1/4_ab.jpg")).toBe(
      "https://live.staticflickr.com/1/4_ab_w.jpg",
    );
    expect(new URL(openverseSearchUrl(["嘴邊肉", "嘴边肉"], null, 12)).searchParams.get("q")).toBe(
      '"嘴邊肉" | "嘴边肉"',
    );
  });

  it("wantsLearningLane: 漢字・かなの見出し語、英語以外の学習言語だけ", () => {
    expect(wantsLearningLane({ headword: "嘴邊肉", language: "zh-TW" })).toBe(true);
    expect(wantsLearningLane({ headword: "apple", language: "en" })).toBe(false);
    expect(wantsLearningLane({ headword: "manzana", language: "es" })).toBe(true);
  });

  it("needsVerification: 食べ物は英語の題が確かでも確かめる。上位が全部見出し語そのものなら要らない", () => {
    const ctx = { query: "pork cheek", category: "food" };
    const paella = { text: "braised pork cheek paella", source: "unsplash" };
    expect(needsVerification([paella], ctx, true)).toBe(true);
    expect(needsVerification([paella], ctx, false)).toBe(false);
    expect(needsVerification([{ text: "嘴邊肉", source: "commons", exact: true }], ctx, true)).toBe(
      false,
    );
  });

  it("意味を決める AI の答えに、学習言語の絞る語と別の書き方が入る（古い形もそのまま読める）", () => {
    expect(
      parseImageSense({
        query: "pork cheek",
        avoid: [],
        sense: "pork jowl",
        context: "黑白切",
        variants: ["嘴边肉", "pork", "嘴边肉"],
      }),
    ).toEqual({
      query: "pork cheek",
      avoid: [],
      sense: "pork jowl",
      context: "黑白切",
      variants: ["嘴边肉"],
    });
    expect(parseImageSense({ query: "lotus root", avoid: [] })).toEqual({
      query: "lotus root",
      avoid: [],
    });
    const p = imageVerifyPrompt({
      headword: "嘴邊肉",
      meaning: "豚の口の周りの肉",
      language: "zh-TW",
      sense: { query: "pork cheek", avoid: [], context: "黑白切" },
      count: 3,
    });
    expect(p).toContain("嘴邊肉");
    expect(p).toContain("豚の口の周りの肉");
    expect(p).toContain("黑白切");
    expect(p).toMatch(/MAIN subject/);
    expect(p).toMatch(/ingredient/);
    expect(p).toMatch(/duplicate/);
  });

  it("保存の許可リスト: Openverse の縮小版と Flickr の置き場を許す（他は断る）", () => {
    expect(() => assertAllowedImageUrl("https://live.staticflickr.com/1/2_ab_b.jpg")).not.toThrow();
    expect(() =>
      assertAllowedImageUrl("https://api.openverse.org/v1/images/1/thumb/"),
    ).not.toThrow();
    expect(() => assertAllowedImageUrl("https://www.flickr.com/photos/x")).toThrow();
  });
});
