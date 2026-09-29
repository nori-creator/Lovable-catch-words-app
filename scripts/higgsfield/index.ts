/**
 * Higgsfield の公式 SDK で Seedance 2.5（文章→動画）を1本作る見本。
 * **1回動かすと Higgsfield の残高を使う（有料）**。
 *
 * 動かし方（パソコンで）:
 *   1. リポジトリの一番上に `.env.local` を作り、次の1行を書く（Git には載らない）:
 *        HF_CREDENTIALS=鍵ID:鍵の秘密
 *   2. このフォルダで `bun install`（または `npm install`）
 *   3. `node index.ts`（Node 22.18 以降）または `bun index.ts`
 *
 * 鍵の値はこのファイルからは**表示も記録もしない**。有るか無いかだけを確かめる。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHiggsfieldClient } from "@higgsfield/client/v2";

const here = dirname(fileURLToPath(import.meta.url));
// 実行した場所がどこでも、リポジトリの一番上の .env.local を読む。
for (const file of [resolve(here, "../../.env.local"), resolve(here, ".env.local")]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const credentials = process.env.HF_CREDENTIALS?.trim() ?? "";
if (!/^[^:\s]+:[^:\s]+$/.test(credentials)) {
  console.error(
    "HF_CREDENTIALS がありません（または 鍵ID:鍵の秘密 の形ではありません）。.env.local に書いてから動かしてください。",
  );
  process.exit(2);
}

const MODEL = "bytedance/seedance-2.5/text-to-video";
const input = {
  prompt: "A cinematic scene at sunset",
  duration: 5,
  resolution: "720p",
  aspect_ratio: "16:9",
};

const client = createHiggsfieldClient({
  credentials,
  // 動画は数分かかることがある。既定の5分では足りないことがあるので10分まで待つ。
  maxPollTime: 10 * 60_000,
});

console.log(`Higgsfield に依頼します: ${MODEL}`, input);
const started = Date.now();
try {
  // subscribe は受付→状態の見回り（/requests/<id>/status）→終わるまで待つ、を一度に行う。
  const result = await client.subscribe(MODEL, { input, withPolling: true });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const status = String(result.status);
  if (status === "completed" && result.video?.url) {
    console.log(`完了（${secs} 秒）。受付番号: ${result.request_id}`);
    console.log(`動画の URL: ${result.video.url}`);
    process.exit(0);
  }
  // completed 以外（failed / nsfw / canceled / URL なし）は**成功と言わない**。
  const why =
    status === "nsfw"
      ? "内容の審査で断られました（残高は戻ります）"
      : status === "failed"
        ? "生成に失敗しました（残高は戻ります）"
        : status === "canceled" || status === "cancelled"
          ? "取り消されました"
          : status === "completed"
            ? "完了と返りましたが動画の URL がありません"
            : `想定外の状態: ${status}`;
  console.error(`失敗（${secs} 秒）: ${why}。受付番号: ${result.request_id ?? "なし"}`);
  process.exit(1);
} catch (e) {
  // SDK の例外（鍵が違う 401 / 残高不足 403 / 入力の形 422 / 時間切れ / 通信）。
  // 例外の中身に鍵が含まれないよう、種類と要点だけを出す。
  const err = e as { name?: string; message?: string; statusCode?: number; status?: number };
  const code = err.statusCode ?? err.status;
  console.error(`失敗: ${err.name ?? "Error"}${code ? ` (${code})` : ""} — ${err.message ?? ""}`);
  // SDK は 403 を全部「残高不足」と訳す。社内網などの**通信の制限（プロキシ）が
  // 断った 403 も同じ文になる**ので、両方の可能性を書いておく。
  if (code === 403)
    console.error(
      "  403 は Higgsfield の残高不足のほか、通信の制限（プロキシが api.higgsfield.ai を通さない）でも出ます。",
    );
  process.exit(1);
}
