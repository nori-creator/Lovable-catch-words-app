import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * **一時的な受け渡し口: iOS 版の自分の Supabase へ移るため**（オーナー決定 2026-10-22。移し終わったら消す）。
 *
 * iOS 版のデータは `nori-creator/rork-catchwords-728` の Supabase（catchwords、東京）へ移る。そちらの一時的な
 * 取り込み口（Edge Function `migration-import`）が、ここから表の行と写真の署名付き URL を読んで入れる。
 *
 * 守り:
 * - 合言葉 `MIGRATION_EXPORT_SECRET`（Lovable の Secrets。32 文字以上）が無ければ、在ることも見せない（404）。
 *   `x-migration-secret` の頭と一致しなければ 404。合言葉は会話にもコードにも書かない。
 * - `EXPORT_UNTIL` を過ぎたら、合言葉があっても 404（消し忘れても開かない）。
 * - 読むだけ。書く・消す道は無い。表は下の一覧だけ。
 * - 移すのは**匿名でない利用者**の行だけ。日記・投稿・利用の記録・AI の記録は移さない（オーナー 2026-10-22
 *   「必要のないデータは移行しない。日記のデータとか」）。共有の辞書・カードの作り置きは全部移す。
 * - 写真は、移す行（カード・再会・プロフィール）が指している物と、その縮小画像だけ。URL は 15 分で切れる。
 */
const EXPORT_UNTIL = Date.parse("2026-11-15T00:00:00Z");

/** 全部の行を移す共有の表と、並べる列（主キー）。 */
const SHARED: Record<string, string> = {
  categories: "key",
  words: "id",
  dictionary_entries: "id",
  word_explanations: "id",
  generated_cards: "language,headword,explain_lang,l1",
  corpus_pairs: "word_a,word_b,day,source",
  corpus_stats: "word,day,source",
  review_choices: "word_id",
};

/** 利用者ごとの表: 利用者の列と、並べる列。 */
const PER_USER: Record<string, { user: string; order: string }> = {
  profiles: { user: "id", order: "id" },
  user_roles: { user: "user_id", order: "id" },
  ai_consents: { user: "user_id", order: "id" },
  apple_tokens: { user: "user_id", order: "user_id" },
  stickers: { user: "user_id", order: "id" },
  encounters: { user: "user_id", order: "id" },
  reviews: { user: "user_id", order: "id" },
  review_history: { user: "user_id", order: "id" },
  user_shelves: { user: "user_id", order: "id" },
  wordbooks: { user: "user_id", order: "id" },
  wordbook_entries: { user: "user_id", order: "id" },
  daily_quests: { user: "user_id", order: "id" },
};

/** 写真の場所を持つ列（中身は保管庫の中の場所か、その場所を含む URL）。 */
const PHOTO_COLUMNS: Record<string, string[]> = {
  stickers: ["object_image_url", "cutout_image_url", "selfie_image_url", "placeholder_image_url", "voice_video_url"],
  encounters: ["image_path", "cutout_path"],
  profiles: ["avatar_url"],
};

const MAX_LIMIT = 1000;
const SIGNED_URL_SECONDS = 15 * 60;

function hidden(): Response {
  return new Response("Not Found", { status: 404 });
}

function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/migration-export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env.MIGRATION_EXPORT_SECRET ?? "";
        if (expected.length < 32 || Date.now() > EXPORT_UNTIL) return hidden();
        if (!sameSecret(request.headers.get("x-migration-secret") ?? "", expected)) return hidden();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const what = url.searchParams.get("what") ?? "";
        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? "500") || 500));
        const json = (body: unknown) =>
          Response.json(body, { headers: { "Cache-Control": "no-store" } });

        // 匿名でない利用者（auth の一覧。ページを全部たどる）。
        const realUsers = async (): Promise<string[]> => {
          const ids: string[] = [];
          for (let page = 1; page < 100; page++) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) throw error;
            for (const u of data.users) if (!u.is_anonymous) ids.push(u.id);
            if (data.users.length < 1000) break;
          }
          return ids;
        };

        if (what === "users") return json({ users: await realUsers() });

        if (what === "table") {
          const table = url.searchParams.get("table") ?? "";
          const shared = Object.prototype.hasOwnProperty.call(SHARED, table) ? SHARED[table] : undefined;
          const perUser = Object.prototype.hasOwnProperty.call(PER_USER, table) ? PER_USER[table] : undefined;
          if (!shared && !perUser) return json({ error: "unknown table" });
          // 型の付いた表の一覧に無い名前も読むので、ここだけ型を外す。
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = (supabaseAdmin as any).from(table).select("*");
          if (perUser) q = q.in(perUser.user, await realUsers());
          for (const col of (shared ?? perUser!.order).split(",")) q = q.order(col, { ascending: true });
          const { data, error } = await q.range(offset, offset + limit - 1);
          if (error) return json({ error: error.message });
          return json({ rows: data ?? [] });
        }

        if (what === "photos") {
          // 移す行が指している写真の場所を集める（場所そのもの、または URL の中の stickers/… の後ろ）。
          const users = await realUsers();
          const wanted = new Set<string>();
          for (const [table, cols] of Object.entries(PHOTO_COLUMNS)) {
            const userCol = PER_USER[table].user;
            for (let from = 0; ; from += 1000) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data, error } = await (supabaseAdmin as any)
                .from(table)
                .select(cols.join(","))
                .in(userCol, users)
                .range(from, from + 999);
              if (error) return json({ error: error.message });
              for (const row of (data ?? []) as Record<string, unknown>[]) {
                for (const c of cols) {
                  const v = row[c];
                  if (typeof v !== "string" || !v) continue;
                  const m = v.match(/\/(?:stickers|avatars)\/([^?#]+)/);
                  wanted.add(decodeURIComponent(m ? m[1] : v.replace(/^\/+/, "")));
                }
              }
              if ((data ?? []).length < 1000) break;
            }
          }
          const all: { bucket: string; name: string }[] = [];
          for (const bucket of ["stickers", "avatars"]) {
            for (const user of users) {
              const walk = async (prefix: string): Promise<void> => {
                for (let from = 0; ; from += 1000) {
                  const { data, error } = await supabaseAdmin.storage
                    .from(bucket)
                    .list(prefix, { limit: 1000, offset: from });
                  if (error) throw error;
                  for (const item of data ?? []) {
                    const name = `${prefix}/${item.name}`;
                    if (item.id === null) await walk(name); // フォルダ
                    else all.push({ bucket, name });
                  }
                  if ((data ?? []).length < 1000) break;
                }
              };
              await walk(user);
            }
          }
          const chosen = all
            .filter((o) => wanted.has(o.name) || wanted.has(o.name.replace(/\.thumb\.webp$/, "")))
            .sort((a, b) => (a.bucket + a.name).localeCompare(b.bucket + b.name));
          const page = chosen.slice(offset, offset + limit);
          const out: { bucket: string; name: string; url: string }[] = [];
          for (const o of page) {
            const { data, error } = await supabaseAdmin.storage
              .from(o.bucket)
              .createSignedUrl(o.name, SIGNED_URL_SECONDS);
            if (error || !data?.signedUrl) continue;
            out.push({ ...o, url: data.signedUrl });
          }
          return json({ total: chosen.length, photos: out });
        }

        return json({ error: "unknown request" });
      },
    },
  },
});
