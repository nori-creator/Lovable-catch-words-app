/**
 * Lovable の Supabase から、自分の Supabase へ移るための共通部品。
 *
 * ## オーナー指示 2026-08-31
 * > 「私が一番怖いのはラバブールからデータをエクスポートする時に
 * >  全てエクスポートできずに使いたい機能が使えなくなることが怖いです。」
 *
 * その恐れに対する答えがこの道具。**移した後、両側を数えて突き合わせる。**
 * 「たぶん入った」ではなく「1件も欠けていない」を数字で出す。
 *
 * ## なぜ Postgres に直接繋がないか
 * DB のパスワードは Lovable 側の管理画面にしか無く、ノリさんが取り出せない
 * 場合がある。REST・Storage・Auth の3つの窓口なら **service_role キー1つ**で
 * 全部読める。用意する物が少ないほど、途中で詰まる所も少ない。
 *
 * ## 使う鍵
 * `service_role` キーは**すべての行を読める鍵**。人に見せない。
 * 端末の環境変数で渡すだけで、このファイルにも git にも残らない。
 */

const COUNT_HEADERS = { Prefer: "count=exact", Range: "0-0" };

/** 引数と環境変数から、片側ぶんの接続先を組む。 */
export function endpoint(prefix) {
  const url = (process.env[`${prefix}_SUPABASE_URL`] ?? "").trim().replace(/\/+$/, "");
  const key = (process.env[`${prefix}_SERVICE_ROLE_KEY`] ?? "").trim();
  if (!url || !key) {
    throw new Error(
      `環境変数が足りません: ${prefix}_SUPABASE_URL と ${prefix}_SERVICE_ROLE_KEY を設定してください。`,
    );
  }
  return { url, key, label: prefix };
}

function headers(ep, extra = {}) {
  return { apikey: ep.key, Authorization: `Bearer ${ep.key}`, ...extra };
}

/**
 * 表の行数を数える。
 *
 * PostgREST は件数を本文ではなく `content-range` ヘッダで返す
 * (`0-0/32878` の右側)。**本文を読むと1行だけ取って「1件」と誤る。**
 */
export async function countRows(ep, table) {
  const res = await fetch(`${ep.url}/rest/v1/${table}?select=*`, {
    method: "HEAD",
    headers: headers(ep, COUNT_HEADERS),
  });
  if (!res.ok) return { table, error: `${res.status} ${res.statusText}` };
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return { table, count: Number.isFinite(total) ? total : null };
}

/**
 * 認証済み利用者を**全員**取り出す。
 *
 * ここが移行でいちばん怖い所。写真の保存先は
 * `{利用者のUUID}/{時刻}-{種類}.{拡張子}` なので、**UUID が変わると
 * 撮った写真が全部迷子になる**。だから件数ではなく UUID の集合で比べる。
 */
export async function listUsers(ep) {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${ep.url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: headers(ep),
    });
    if (!res.ok) throw new Error(`利用者一覧が取れません (${ep.label}): ${res.status}`);
    const json = await res.json();
    const users = json.users ?? [];
    out.push(
      ...users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        providers: (u.identities ?? []).map((i) => i.provider).sort(),
        hasPassword: !!u.encrypted_password || u.app_metadata?.provider === "email",
      })),
    );
    if (users.length < 200) break;
  }
  return out;
}

/** バケツ（写真・音声の入れ物）の一覧。 */
export async function listBuckets(ep) {
  const res = await fetch(`${ep.url}/storage/v1/bucket`, { headers: headers(ep) });
  if (!res.ok) throw new Error(`バケツ一覧が取れません (${ep.label}): ${res.status}`);
  return (await res.json()).map((b) => ({ id: b.id, public: b.public }));
}

/**
 * バケツの中身を**入れ子の奥まで**並べる。
 *
 * Storage の一覧は1階層ずつしか返さない。写真は `{UUID}/…` と
 * 1つ潜った所に在るので、**根だけ見るとフォルダ名しか出ず「0件」に見える**。
 * 潜って数える。
 */
export async function listObjects(ep, bucket, prefix = "") {
  const found = [];
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop();
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(`${ep.url}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: headers(ep, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          prefix: dir,
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
      });
      if (!res.ok) throw new Error(`一覧が取れません (${ep.label}/${bucket}): ${res.status}`);
      const items = await res.json();
      for (const it of items) {
        const path = dir ? `${dir}/${it.name}` : it.name;
        // `id` が無い物はフォルダ。中に潜る。
        if (it.id == null) stack.push(path);
        else found.push({ path, size: Number(it.metadata?.size ?? 0) });
      }
      if (items.length < 1000) break;
    }
  }
  return found;
}

/** ファイルの中身を取る。 */
export async function download(ep, bucket, path) {
  const res = await fetch(`${ep.url}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    headers: headers(ep),
  });
  if (!res.ok) throw new Error(`取得できません ${bucket}/${path}: ${res.status}`);
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/** ファイルを置く。同じ名前が在れば上書きする（途中から再開できるように）。 */
export async function upload(ep, bucket, path, body, contentType) {
  const res = await fetch(`${ep.url}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: "POST",
    headers: headers(ep, { "Content-Type": contentType, "x-upsert": "true" }),
    body,
  });
  if (!res.ok) throw new Error(`置けません ${bucket}/${path}: ${res.status} ${await res.text()}`);
}

/** バケツを作る（すでに在れば何もしない）。 */
export async function ensureBucket(ep, bucket, isPublic) {
  const res = await fetch(`${ep.url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(ep, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: bucket, name: bucket, public: isPublic }),
  });
  if (res.ok) return "作った";
  const text = await res.text();
  if (res.status === 409 || text.includes("already exists")) return "すでに在る";
  throw new Error(`バケツを作れません ${bucket}: ${res.status} ${text}`);
}

export const bytes = (n) =>
  n > 1 << 30
    ? `${(n / (1 << 30)).toFixed(1)} GB`
    : n > 1 << 20
      ? `${(n / (1 << 20)).toFixed(1)} MB`
      : `${(n / 1024).toFixed(0)} kB`;
