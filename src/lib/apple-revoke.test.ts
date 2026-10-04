import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  APPLE_REVOKE_URL,
  CLIENT_SECRET_MAX_TTL_S,
  makeAppleClientSecret,
  readAppleConfig,
  revokeAppleToken,
  type AppleConfig,
} from "./apple-revoke";
import {
  revokeAppleForUser,
  storeAppleToken,
  type AppleTokenDb,
  type AppleTokenRow,
} from "./apple-revoke.server";
import { appleTokenFromSession } from "./apple-token-capture";

/** 試験用の P-256 の鍵（本物の Apple の鍵の代わり）。p8 と同じ PKCS#8 の PEM にする。 */
async function testKey() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = Buffer.from(der).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}

const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

async function config(): Promise<{ cfg: AppleConfig; publicKey: CryptoKey }> {
  const { pem, publicKey } = await testKey();
  return {
    cfg: {
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: pem,
      servicesId: "app.catchwords.web",
    },
    publicKey,
  };
}

function fakeDb(
  row: AppleTokenRow | null,
  error: { code?: string; message?: string } | null = null,
) {
  const state = { row, deleted: 0, upserts: [] as Record<string, unknown>[] };
  const db: AppleTokenDb = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error }) }),
      }),
      upsert: async (r) => {
        state.upserts.push(r);
        state.row = {
          token: String(r.token),
          token_type: r.token_type as AppleTokenRow["token_type"],
        };
        return { data: null, error: null };
      },
      delete: () => ({
        eq: async () => {
          state.deleted++;
          state.row = null;
          return { data: null, error: null };
        },
      }),
    }),
  };
  return { db, state };
}

const ENV_KEYS = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_SERVICES_ID"];
const envFrom = (c: AppleConfig) => ({
  APPLE_TEAM_ID: c.teamId,
  APPLE_KEY_ID: c.keyId,
  APPLE_PRIVATE_KEY: c.privateKey,
  APPLE_SERVICES_ID: c.servicesId,
});

describe("client_secret（ES256 の JWT）", () => {
  it("Apple の決まりどおりの頭と中身で、鍵の対で確かめられる署名", async () => {
    const { cfg, publicKey } = await config();
    const jwt = await makeAppleClientSecret(cfg, 1_700_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(b64urlDecode(h).toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
      typ: "JWT",
    });
    const payload = JSON.parse(b64urlDecode(p).toString());
    expect(payload).toMatchObject({
      iss: "TEAM123456",
      iat: 1_700_000_000,
      aud: "https://appleid.apple.com",
      sub: "app.catchwords.web",
    });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(CLIENT_SECRET_MAX_TTL_S);
    expect(payload.exp).toBeGreaterThan(payload.iat);
    const sig = b64urlDecode(s);
    expect(sig.length).toBe(64); // r‖s（JWS の ES256 の形）
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      sig,
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it("有効期限は 6 か月（15777000 秒）を超えない", async () => {
    const { cfg } = await config();
    const jwt = await makeAppleClientSecret(cfg, 0, 10 ** 9);
    const payload = JSON.parse(b64urlDecode(jwt.split(".")[1]).toString());
    expect(payload.exp).toBe(CLIENT_SECRET_MAX_TTL_S);
  });

  it("環境変数の改行が \\n の文字になっていても読む", async () => {
    const { cfg } = await config();
    const flat = { ...cfg, privateKey: cfg.privateKey.replace(/\n/g, "\\n") };
    await expect(makeAppleClientSecret(flat)).resolves.toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("設定が欠けていれば名前を返す", () => {
    expect(readAppleConfig({}).missing).toEqual(ENV_KEYS);
    expect(readAppleConfig({ APPLE_TEAM_ID: "T" }).config).toBeNull();
  });
});

describe("revokeAppleToken（Apple の取り消しの口）", () => {
  it("決まりどおりの form を POST する", async () => {
    const { cfg } = await config();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await revokeAppleToken(
      { token: "r.abc", kind: "refresh_token", config: cfg },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(res).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(APPLE_REVOKE_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = new URLSearchParams(String(init.body));
    expect(body.get("client_id")).toBe("app.catchwords.web");
    expect(body.get("token")).toBe("r.abc");
    expect(body.get("token_type_hint")).toBe("refresh_token");
    expect(body.get("client_secret")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("Apple の断り（invalid_client など）は投げずに返す", async () => {
    const { cfg } = await config();
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "invalid_client" }, { status: 400 }),
    );
    const res = await revokeAppleToken(
      { token: "r", kind: "refresh_token", config: cfg },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(res).toEqual({ ok: false, status: 400, error: "invalid_client" });
  });
});

describe("revokeAppleForUser（退会の時。どう転んでも投げない）", () => {
  const quiet = () => undefined;

  it("token が置かれていなければ飛ばす（Apple を呼ばない）", async () => {
    const { db } = fakeDb(null);
    const fetchMock = vi.fn();
    const r = await revokeAppleForUser("u1", { db, env: {}, fetch: fetchMock, log: quiet });
    expect(r).toEqual({ status: "skipped", reason: "no_token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("設定が無ければ飛ばす", async () => {
    const { db } = fakeDb({ token: "r", token_type: "refresh_token" });
    const fetchMock = vi.fn();
    const r = await revokeAppleForUser("u1", { db, env: {}, fetch: fetchMock, log: quiet });
    expect(r).toEqual({ status: "skipped", reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("表が無い（移行待ち）なら飛ばす", async () => {
    const { db } = fakeDb(null, { code: "PGRST205", message: "apple_tokens not found" });
    const r = await revokeAppleForUser("u1", { db, env: {}, log: quiet });
    expect(r).toEqual({ status: "skipped", reason: "table_missing" });
  });

  it("取り消せたら revoked、token は消す", async () => {
    const { cfg } = await config();
    const { db, state } = fakeDb({ token: "r.ok", token_type: "refresh_token" });
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const r = await revokeAppleForUser("u1", {
      db,
      env: envFrom(cfg),
      fetch: fetchMock as unknown as typeof fetch,
      log: quiet,
    });
    expect(r).toEqual({ status: "revoked" });
    expect(state.deleted).toBe(1);
  });

  it("Apple が失敗しても・通信が落ちても投げない", async () => {
    const { cfg } = await config();
    const { db } = fakeDb({ token: "r", token_type: "refresh_token" });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      revokeAppleForUser("u1", {
        db,
        env: envFrom(cfg),
        fetch: down as unknown as typeof fetch,
        log: quiet,
      }),
    ).resolves.toMatchObject({ status: "failed" });
    const bad = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    const { db: db2 } = fakeDb({ token: "r", token_type: "refresh_token" });
    await expect(
      revokeAppleForUser("u1", {
        db: db2,
        env: envFrom(cfg),
        fetch: bad as unknown as typeof fetch,
        log: quiet,
      }),
    ).resolves.toEqual({ status: "failed", error: "invalid_grant", httpStatus: 400 });
  });

  it("鍵が壊れていても投げない", async () => {
    const { db } = fakeDb({ token: "r", token_type: "refresh_token" });
    const r = await revokeAppleForUser("u1", {
      db,
      env: {
        APPLE_TEAM_ID: "T",
        APPLE_KEY_ID: "K",
        APPLE_PRIVATE_KEY: "not a key",
        APPLE_SERVICES_ID: "S",
      },
      fetch: vi.fn() as unknown as typeof fetch,
      log: quiet,
    });
    expect(r.status).toBe("failed");
  });
});

describe("預ける", () => {
  it("refresh token を access token で上書きしない", async () => {
    const { db, state } = fakeDb({ token: "r", token_type: "refresh_token" });
    expect(await storeAppleToken("u1", { token: "a", kind: "access_token" }, db)).toEqual({
      stored: false,
    });
    expect(state.row?.token).toBe("r");
    expect(await storeAppleToken("u1", { token: "r2", kind: "refresh_token" }, db)).toEqual({
      stored: true,
    });
    expect(state.row?.token).toBe("r2");
  });

  it("拾うのは Apple のサインインの直後の session だけ", () => {
    const apple = { user: { app_metadata: { provider: "apple", providers: ["apple"] } } };
    expect(appleTokenFromSession({ ...apple, provider_refresh_token: "r" })).toEqual({
      token: "r",
      kind: "refresh_token",
    });
    expect(appleTokenFromSession({ ...apple, provider_token: "a" })).toEqual({
      token: "a",
      kind: "access_token",
    });
    expect(appleTokenFromSession(apple)).toBeNull();
    expect(
      appleTokenFromSession({
        user: { app_metadata: { provider: "google" } },
        provider_refresh_token: "g",
      }),
    ).toBeNull();
    expect(appleTokenFromSession(null)).toBeNull();
  });
});

describe("退会の順番", () => {
  const src = fs.readFileSync(path.join(__dirname, "profile.functions.ts"), "utf8");
  it("データを消した後・アカウントを消す前に取り消す（失敗しても止めない）", () => {
    const revoke = src.indexOf("revokeAppleForUser(userId)");
    const deleteUser = src.indexOf("auth.admin.deleteUser(userId)");
    const profiles = src.indexOf('["profiles", "id"]');
    expect(revoke).toBeGreaterThan(profiles);
    expect(deleteUser).toBeGreaterThan(revoke);
  });
  it("表はサーバの鍵だけ（ブラウザの決まりを置かない）", () => {
    const sql = fs.readFileSync(
      path.join(__dirname, "../../supabase/migrations/20261003150000_apple_tokens.sql"),
      "utf8",
    );
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.apple_tokens from public, anon, authenticated/);
    expect(sql).not.toMatch(/create policy/);
  });
});
