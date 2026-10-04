/**
 * Apple の token の置き場所（`apple_tokens`）を読み書きし、退会のときに取り消す。
 * 取り消しの決まりは `apple-revoke.ts`。表は移行 `20261003150000_apple_tokens.sql`
 * （サーバの鍵だけが触る。ブラウザからは何もできない）。
 *
 * **退会は、取り消しがどう転んでも止めない**（`revokeAppleForUser` は投げない）。
 */
import {
  readAppleConfig,
  revokeAppleToken,
  type AppleTokenKind,
  type RevokeResult,
} from "./apple-revoke";

const TABLE = "apple_tokens";

type LooseError = { message?: string; code?: string } | null;
type Result<T> = PromiseLike<{ data: T | null; error: LooseError }>;

export type AppleTokenRow = { token: string; token_type: AppleTokenKind };

/** 使う所だけの形（試験で差し替える）。 */
export type AppleTokenDb = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => { maybeSingle: () => Result<AppleTokenRow> };
    };
    upsert: (row: Record<string, unknown>, o: { onConflict: string }) => Result<unknown>;
    delete: () => { eq: (k: string, v: string) => Result<unknown> };
  };
};

async function adminDb(): Promise<AppleTokenDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AppleTokenDb;
}

/** Apple の token を置く（同じ人は上書き。refresh token を access token で上書きしない）。 */
export async function storeAppleToken(
  userId: string,
  input: { token: string; kind: AppleTokenKind },
  db?: AppleTokenDb,
): Promise<{ stored: boolean }> {
  const d = db ?? (await adminDb());
  if (input.kind === "access_token") {
    const { data } = await d
      .from(TABLE)
      .select("token, token_type")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.token_type === "refresh_token") return { stored: false };
  }
  const { error } = await d.from(TABLE).upsert(
    {
      user_id: userId,
      token: input.token,
      token_type: input.kind,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`apple_tokens の保存に失敗しました: ${error.message ?? ""}`);
  return { stored: true };
}

export type RevokeOutcome =
  | { status: "revoked" }
  | { status: "skipped"; reason: "no_token" | "not_configured" | "table_missing" }
  | { status: "failed"; error: string; httpStatus: number | null };

/**
 * 退会の前に呼ぶ。置いてある token を Apple で取り消し、置き場所から消す。
 * どんな失敗でも投げずに結果を返し、記録（console）に残す。
 */
export async function revokeAppleForUser(
  userId: string,
  deps: {
    db?: AppleTokenDb;
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
    log?: (msg: string) => void;
  } = {},
): Promise<RevokeOutcome> {
  const log = deps.log ?? ((m: string) => console.warn(m));
  try {
    const d = deps.db ?? (await adminDb());
    const { data, error } = await d
      .from(TABLE)
      .select("token, token_type")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      const missing =
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        /apple_tokens/.test(error.message ?? "");
      log(
        `[apple-revoke] token を読めない（${missing ? "表が無い" : error.message}）。取り消さずに退会を続ける`,
      );
      return missing
        ? { status: "skipped", reason: "table_missing" }
        : { status: "failed", error: error.message ?? "read failed", httpStatus: null };
    }
    if (!data?.token) {
      log(
        "[apple-revoke] Apple の token が置かれていない（この変更より前の登録・Apple 以外）。取り消しは飛ばす",
      );
      return { status: "skipped", reason: "no_token" };
    }
    const { config, missing } = readAppleConfig(deps.env ?? process.env);
    if (!config) {
      log(`[apple-revoke] 設定が足りない（${missing.join(", ")}）。取り消さずに退会を続ける`);
      return { status: "skipped", reason: "not_configured" };
    }
    const res: RevokeResult = await revokeAppleToken(
      { token: data.token, kind: data.token_type ?? "refresh_token", config },
      { fetch: deps.fetch },
    );
    // 取り消せても失敗しても、token は残さない（表は退会で消えるが、先に消しておく）。
    await d
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .then(
        () => undefined,
        () => undefined,
      );
    if (res.ok) {
      log("[apple-revoke] Apple の許可を取り消した");
      return { status: "revoked" };
    }
    log(
      `[apple-revoke] Apple が取り消しを断った（${res.status ?? "network"} ${res.error}）。退会は続ける`,
    );
    return { status: "failed", error: res.error, httpStatus: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`[apple-revoke] 取り消しで失敗（${msg}）。退会は続ける`);
    return { status: "failed", error: msg, httpStatus: null };
  }
}
