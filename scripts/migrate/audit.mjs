#!/usr/bin/env node
/**
 * 移行が**本当に全部済んだか**を数えて突き合わせる道具。
 *
 * ## これが答える問い（オーナー指示 2026-08-31）
 * > 「全てエクスポートできずに使いたい機能が使えなくなることが怖い」
 *
 * 移した後にこれを1回走らせる。**1件でも欠けていたら赤で名前を出して
 * 異常終了する。** 「たぶん大丈夫」を無くすための道具。
 *
 * ## 使い方
 *
 *     OLD_SUPABASE_URL="https://arjicopbmvseztldpxpk.supabase.co" \
 *     OLD_SERVICE_ROLE_KEY="（Lovable 側の service_role キー）" \
 *     NEW_SUPABASE_URL="https://djglfezflmtplellymkc.supabase.co" \
 *     NEW_SERVICE_ROLE_KEY="（自分の Supabase の service_role キー）" \
 *     node scripts/migrate/audit.mjs
 *
 * 片側だけ（NEW を省く）でも走る。移す前に**古い側に何が在るか**を
 * 数えておくために使う。
 */

import { countRows, endpoint, listBuckets, listObjects, listUsers, bytes } from "./common.mjs";

/**
 * 数える表。**`supabase/migrations/` に在る public の表を全部書く。**
 * ここに書き漏らした表は、丸ごと消えていても誰も気づかない。
 */
const TABLES = [
  "ai_runs",
  "app_config",
  "categories",
  "corpus_pairs",
  "corpus_stats",
  "daily_quests",
  "dictionary_entries",
  "encounters",
  "entry_reports",
  "follows",
  "journal_entries",
  "lexicon_audits",
  "notifications",
  "post_comments",
  "post_likes",
  "posts",
  "profiles",
  "review_choices",
  "review_history",
  "reviews",
  "scan_events",
  "self_improve_runs",
  "stickers",
  "usage_events",
  "user_roles",
  "user_shelves",
  "word_explanations",
  "wordbook_entries",
  "wordbooks",
  "words",
];

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const OFF = "\x1b[0m";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`${RED}✗ ${msg}${OFF}`);
};
const ok = (msg) => console.log(`${GREEN}✓${OFF} ${msg}`);

function section(title) {
  console.log(`\n${DIM}${"─".repeat(64)}${OFF}\n${title}\n`);
}

async function main() {
  const old = endpoint("OLD");
  const hasNew = !!(process.env.NEW_SUPABASE_URL && process.env.NEW_SERVICE_ROLE_KEY);
  const neu = hasNew ? endpoint("NEW") : null;

  console.log(`古い側: ${old.url}`);
  console.log(
    hasNew ? `新しい側: ${neu.url}` : `${DIM}新しい側: 未指定（古い側を数えるだけ）${OFF}`,
  );

  // ── ① 表の行数 ─────────────────────────────────────────────
  section("① 表の行数");
  for (const t of TABLES) {
    const a = await countRows(old, t);
    if (a.error) {
      fail(`${t.padEnd(20)} 古い側が読めません (${a.error})`);
      continue;
    }
    if (!hasNew) {
      console.log(`  ${t.padEnd(20)} ${String(a.count).padStart(7)}`);
      continue;
    }
    const b = await countRows(neu, t);
    if (b.error) {
      fail(`${t.padEnd(20)} 新しい側に表がありません (${b.error}) — 移行が済んでいません`);
    } else if (a.count === b.count) {
      ok(`${t.padEnd(20)} ${String(a.count).padStart(7)} → ${String(b.count).padStart(7)}`);
    } else {
      fail(
        `${t.padEnd(20)} ${a.count} 件のうち ${b.count} 件しか入っていません（${a.count - b.count} 件不足）`,
      );
    }
  }

  // ── ② 利用者（UUID がいちばん大事） ────────────────────────
  section("② 利用者アカウント（UUID が変わると写真が全部迷子になる）");
  const usersA = await listUsers(old);
  console.log(`  古い側: ${usersA.length} 人`);
  for (const u of usersA) {
    console.log(
      `    ${DIM}${u.id}${OFF}  ${u.email ?? "(メール無し)"}  [${u.providers.join(", ") || "なし"}]`,
    );
  }
  if (hasNew) {
    const usersB = await listUsers(neu);
    const idsB = new Set(usersB.map((u) => u.id));
    const missing = usersA.filter((u) => !idsB.has(u.id));
    if (missing.length === 0) {
      ok(`${usersA.length} 人全員の UUID がそのまま引き継がれています`);
    } else {
      for (const u of missing) {
        fail(
          `利用者 ${u.email ?? u.id} の UUID が新しい側にありません — この人の写真は表示されません`,
        );
      }
    }
    // ログイン手段も見る。UUID が同じでも Google の紐付けが落ちると入れない。
    for (const u of usersA) {
      const b = usersB.find((x) => x.id === u.id);
      if (!b) continue;
      const lost = u.providers.filter((p) => !b.providers.includes(p));
      if (lost.length) {
        fail(`${u.email ?? u.id}: ログイン手段 ${lost.join("/")} が引き継がれていません`);
      }
    }
  }

  // ── ③ 写真・音声のファイル ────────────────────────────────
  section("③ 保存された写真・音声（ここが漏れると図鑑が空白になる）");
  const bucketsA = await listBuckets(old);
  const bucketsB = hasNew ? await listBuckets(neu) : [];
  for (const b of bucketsA) {
    const objsA = await listObjects(old, b.id);
    const sizeA = objsA.reduce((s, o) => s + o.size, 0);
    if (!hasNew) {
      console.log(`  ${b.id.padEnd(28)} ${String(objsA.length).padStart(6)} 個  ${bytes(sizeA)}`);
      continue;
    }
    if (!bucketsB.some((x) => x.id === b.id)) {
      fail(
        `バケツ「${b.id}」が新しい側にありません（${objsA.length} 個・${bytes(sizeA)} が丸ごと未移行）`,
      );
      continue;
    }
    const objsB = await listObjects(neu, b.id);
    const haveB = new Map(objsB.map((o) => [o.path, o.size]));
    const missing = objsA.filter((o) => !haveB.has(o.path));
    const wrongSize = objsA.filter((o) => haveB.has(o.path) && haveB.get(o.path) !== o.size);
    if (missing.length === 0 && wrongSize.length === 0) {
      ok(
        `${b.id.padEnd(28)} ${String(objsA.length).padStart(6)} 個 ${bytes(sizeA)} — 全部そろっています`,
      );
    } else {
      fail(`${b.id}: ${missing.length} 個が欠け、${wrongSize.length} 個が大きさ違い`);
      for (const o of [...missing, ...wrongSize].slice(0, 10))
        console.log(`      ${DIM}${o.path}${OFF}`);
      if (missing.length + wrongSize.length > 10) {
        console.log(`      ${DIM}…ほか ${missing.length + wrongSize.length - 10} 個${OFF}`);
      }
    }
  }

  // ── 結び ───────────────────────────────────────────────────
  section("結果");
  if (!hasNew) {
    console.log(
      "古い側の中身を数えました。移した後にもう一度、新しい側も指定して走らせてください。",
    );
    return;
  }
  if (failures === 0) {
    console.log(`${GREEN}すべて一致しました。移行に漏れはありません。${OFF}`);
  } else {
    console.log(
      `${RED}${failures} 件の食い違いがあります。上の行に何が足りないか出ています。${OFF}`,
    );
    console.log(`${DIM}古い側はまだそのまま残っています。慌てて消さないでください。${OFF}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`${RED}${e.message}${OFF}`);
  process.exitCode = 1;
});
