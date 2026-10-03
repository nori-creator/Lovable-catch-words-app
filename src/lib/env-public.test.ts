import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **`.env` には公開してよい値だけ**（2026-10-01）。
 *
 * `.env` は Lovable と Netlify が組み立てに使うのでリポジトリに入っている（外すと
 * 組み立てが壊れる）。入っているのは誰に見られてもよい値だけ — ブラウザに配る Supabase の
 * 公開キー（anon）・URL・地図のブラウザ用キー。秘密の値（service role の鍵、AI の鍵など）は
 * Lovable の Secrets / サーバの環境変数に置く。ここに混ざったら、公開される前にこの試験で落とす。
 */
const ALLOWED = new Set([
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY",
  "VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID",
  // Google AdSense の番号（ページの中に必ず書かれる公開の値。`docs/monetization.md` §5-2）。
  "VITE_ADSENSE_CLIENT",
  "VITE_ADSENSE_SLOT_DEX",
  "VITE_ADSENSE_SLOT_DIARY",
  "VITE_ADSENSE_SLOT_REVIEW",
]);

function readEnv(path: string): Array<[string, string]> {
  if (!fs.existsSync(path)) return [];
  return fs
    .readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    });
}

/** JWT の中身（署名は見ない）。 */
function jwtRole(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

describe(".env は公開してよい値だけ", () => {
  const entries = readEnv(".env");

  it("知っている公開用の名前だけ（新しい名前を足すときは、ここで公開してよいかを決める）", () => {
    expect(entries.map(([k]) => k).filter((k) => !ALLOWED.has(k))).toEqual([]);
  });

  it("秘密っぽい名前・値が無い", () => {
    for (const [k, v] of entries) {
      expect([k, /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|API_KEY$/i.test(k)]).toEqual([k, false]);
      expect([k, /service_role|-----BEGIN|sk-[A-Za-z0-9]{10}|sb_secret_/.test(v)]).toEqual([
        k,
        false,
      ]);
      // Supabase の鍵は JWT。中の役割が service_role（何でもできる鍵）なら落とす。
      expect([k, jwtRole(v)]).not.toEqual([k, "service_role"]);
    }
  });

  it("手元用の .env.local などは Git に入らない", () => {
    const ignore = fs.readFileSync(".gitignore", "utf8");
    expect(ignore).toMatch(/^\*\.local$/m);
    expect(ignore).toMatch(/^\.env\.\*\.local$/m);
  });
});
