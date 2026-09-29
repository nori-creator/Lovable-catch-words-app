import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectPlatform } from "./pwa";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const LINE_IOS = `${IPHONE} Line/15.0.0`;

describe("スマホにアプリとして入れる（2026-09-29）", () => {
  it("端末を見分ける: iPhone・Mac のふりをする iPad・Android・LINE の中・パソコン", () => {
    expect(detectPlatform(IPHONE, 5)).toBe("ios");
    expect(detectPlatform(IPAD_AS_MAC, 5)).toBe("ios");
    expect(detectPlatform(IPAD_AS_MAC, 0)).toBe("desktop");
    expect(detectPlatform(ANDROID, 5)).toBe("android");
    expect(detectPlatform(LINE_IOS, 5)).toBe("in-app");
  });

  it("マニフェスト: 名前・開始画面・全画面・192/512 のアイコンがある（Android の条件）", () => {
    const root = process.cwd();
    const m = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
    expect(m.short_name).toBe("CatchWords");
    expect(m.start_url).toBe("/home");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons as Array<{ sizes: string }>).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const i of m.icons as Array<{ src: string }>)
      expect(fs.existsSync(path.join(root, "public", i.src))).toBe(true);
  });

  it("サービスワーカー: 画面とサーバの処理は必ずサーバへ（古い画面を出し続けない）", () => {
    const sw = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toMatch(/addEventListener\("fetch"/);
    // 画面（navigate）はネットワークが先。落ちた時だけ「つながっていません」。
    expect(sw).toMatch(/request\.mode === "navigate"[\s\S]*fetch\(request\)\.catch/);
    // 端末に置くのは部品と素材だけ（サーバの処理 /_serverFn は触らない）。
    expect(sw).not.toMatch(/_serverFn/);
    expect(sw).toMatch(/url\.pathname\.startsWith\("\/assets\/"\)/);
  });
});
