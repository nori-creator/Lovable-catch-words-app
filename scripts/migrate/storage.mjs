#!/usr/bin/env node
/**
 * 写真と音声のファイルを、古い Supabase から新しい Supabase へ写す道具。
 *
 * ## なぜ別の道具が要るか
 * データベースの書き出し（`pg_dump` / Lovable の Export）に**ファイルの中身は
 * 入らない**。入るのは「どこに何が在るか」の台帳（`storage.objects`）だけ。
 * 台帳だけ移すと、図鑑には札が並ぶのに**写真がすべて壊れた画像になる**。
 * この状態は移行直後には気づきにくい（札の数は合っているので）。
 *
 * いま古い側に在るのは:
 *   stickers   315 個 / 133 MB … 撮った写真・切り抜き・自撮り動画
 *   tts       4149 個 / 104 MB … 読み上げ音声（作り直すとAI費用がかかる）
 *   avatars      2 個 /  39 kB
 *
 * ## 途中で止まっても大丈夫
 * 同じ名前・同じ大きさの物は飛ばすので、**もう一度走らせれば続きから**進む。
 * 回線が切れても、Ctrl+C で止めても、失われる物はない。
 *
 * ## 使い方
 *
 *     OLD_SUPABASE_URL="https://arjicopbmvseztldpxpk.supabase.co" \
 *     OLD_SERVICE_ROLE_KEY="（Lovable 側の service_role キー）" \
 *     NEW_SUPABASE_URL="https://djglfezflmtplellymkc.supabase.co" \
 *     NEW_SERVICE_ROLE_KEY="（自分の Supabase の service_role キー）" \
 *     node scripts/migrate/storage.mjs
 *
 * 特定のバケツだけ写したいときは末尾に名前を足す:
 *     node scripts/migrate/storage.mjs stickers
 */

import {
  bytes,
  download,
  endpoint,
  ensureBucket,
  listBuckets,
  listObjects,
  upload,
} from "./common.mjs";

/**
 * 中身を写さないバケツ。
 *
 * `database_export_*` は Lovable が書き出した控えの置き場で、新しい側には
 * 要らない（新しい側にはその中身が既に入っている）。
 */
const SKIP = /^database_export/;

/** 同時に何個まで運ぶか。増やしすぎると相手側に断られる。 */
const LANES = 6;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const OFF = "\x1b[0m";

async function copyBucket(old, neu, bucket, isPublic) {
  const state = await ensureBucket(neu, bucket, isPublic);
  console.log(`\n■ ${bucket} ${DIM}(新しい側のバケツ: ${state})${OFF}`);

  const [srcList, dstList] = await Promise.all([
    listObjects(old, bucket),
    listObjects(neu, bucket).catch(() => []),
  ]);
  const have = new Map(dstList.map((o) => [o.path, o.size]));
  const todo = srcList.filter((o) => have.get(o.path) !== o.size);
  const skipped = srcList.length - todo.length;

  const total = todo.reduce((s, o) => s + o.size, 0);
  console.log(
    `  ${srcList.length} 個中 ${todo.length} 個を写します（${bytes(total)}）` +
      (skipped ? `${DIM} / ${skipped} 個は写し済みなので飛ばします${OFF}` : ""),
  );
  if (todo.length === 0) return { done: 0, failed: [] };

  let done = 0;
  let movedBytes = 0;
  const failed = [];
  const queue = [...todo];

  const worker = async () => {
    for (;;) {
      const item = queue.pop();
      if (!item) return;
      try {
        const file = await download(old, bucket, item.path);
        await upload(neu, bucket, item.path, file.body, file.contentType);
        done++;
        movedBytes += item.size;
        // 進み具合。1行を書き換え続けるので画面が流れない。
        process.stdout.write(
          `\r  ${done}/${todo.length}  ${bytes(movedBytes)} / ${bytes(total)}   ${DIM}${item.path.slice(-48)}${OFF}   `,
        );
      } catch (e) {
        failed.push({ path: item.path, reason: e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: LANES }, worker));
  process.stdout.write("\n");

  if (failed.length === 0) {
    console.log(`  ${GREEN}✓ ${done} 個すべて写しました${OFF}`);
  } else {
    console.log(`  ${RED}✗ ${failed.length} 個が写せませんでした${OFF}`);
    for (const f of failed.slice(0, 10)) console.log(`      ${DIM}${f.path} — ${f.reason}${OFF}`);
    console.log(`  ${DIM}もう一度走らせると、写せた分は飛ばして続きから試します。${OFF}`);
  }
  return { done, failed };
}

async function main() {
  const old = endpoint("OLD");
  const neu = endpoint("NEW");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

  console.log(`古い側: ${old.url}\n新しい側: ${neu.url}`);

  const buckets = (await listBuckets(old)).filter(
    (b) => !SKIP.test(b.id) && (only.length === 0 || only.includes(b.id)),
  );
  if (buckets.length === 0) {
    console.log("写すバケツがありません。");
    return;
  }

  let failures = 0;
  for (const b of buckets) {
    const r = await copyBucket(old, neu, b.id, b.public);
    failures += r.failed.length;
  }

  console.log("");
  if (failures === 0) {
    console.log(`${GREEN}ファイルの引っ越しが終わりました。${OFF}`);
    console.log(
      `${DIM}次に scripts/migrate/audit.mjs を走らせて、数が合うことを確かめてください。${OFF}`,
    );
  } else {
    console.log(`${RED}${failures} 個が残っています。もう一度同じ命令を走らせてください。${OFF}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`${RED}${e.message}${OFF}`);
  process.exitCode = 1;
});
