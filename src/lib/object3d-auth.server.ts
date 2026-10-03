import { createClient } from "@supabase/supabase-js";

/**
 * **3D の形の中継（`/api/object3d-model`）を開発者だけにする**（監査 2026-10-03 L6）。
 *
 * 前は誰でも（ログインしていなくても）中継を使えた。中継するのは Tripo の配信先だけだが、
 * 大きな形を何度も取らせれば、このサーバの通信と時間を使わせられる。3D を作れるのは
 * 開発者だけ（`object3dAllowed`）なので、取りに来るのも開発者だけに絞る。
 *
 * 画面は `Authorization: Bearer <Supabase のアクセストークン>` を付けて取りに来る
 * （`Object3DHero.tsx` の `storeModel`）。
 */
export type ModelAuthDeps = {
  /** トークンを確かめ、その人の id を返す。確かめられなければ null。 */
  verify: (token: string) => Promise<string | null>;
  /** その人が管理者か。 */
  isAdmin: (token: string, userId: string) => Promise<boolean>;
};

/** 通してよければ null、断る時はその返事（401 / 403）。 */
export async function authorizeModelRequest(
  request: Request,
  deps: ModelAuthDeps = supabaseModelAuth(),
): Promise<Response | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return new Response("unauthorized", { status: 401 });
  let userId: string | null;
  try {
    userId = await deps.verify(token);
  } catch {
    userId = null;
  }
  if (!userId) return new Response("unauthorized", { status: 401 });
  const admin = await deps.isAdmin(token, userId).catch(() => false);
  if (!admin) return new Response("forbidden", { status: 403 });
  return null;
}

function supabaseModelAuth(): ModelAuthDeps {
  const client = (token: string) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("supabase env missing");
    return createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
  };
  return {
    verify: async (token) => {
      const { data, error } = await client(token).auth.getClaims(token);
      return error ? null : (data?.claims?.sub ?? null);
    },
    isAdmin: async (token, userId) => {
      const { data } = await client(token).rpc("has_role", { _user_id: userId, _role: "admin" });
      return Boolean(data);
    },
  };
}
