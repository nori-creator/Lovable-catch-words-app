#!/usr/bin/env node
/**
 * 検証済み辞書語のTTS事前一括生成(仕様§4.3)。
 *
 * dictionary_entries の audio_path 未設定語を対象に、アプリと完全に同じ
 * パス規約(`zh-TW/alloy/<sha256(text)>.mp3`、src/lib/tts-cache.ts)で
 * tts バケットへ音声を生成・保存し、audio_path を更新する。
 * → 以後、スキャンのタップ音声(lookupHeadwords が署名URLを同梱)と
 *    復習の音声(getDueReviews の決定論パス)がサーバー往復ゼロで鳴る。
 *
 * 実行(リポジトリルートで):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... LOVABLE_API_KEY=... \
 *     node scripts/tts-batch/generate.mjs --limit 3        # まず3件テスト(憲法: 小さく試す)
 *     node scripts/tts-batch/generate.mjs --level-max 3    # TOCFL L1-3 本走
 *
 * TTSは TTS_BASE_URL+TTS_API_KEY(+TTS_MODEL) があればそちら、なければ
 * Lovable Gateway(LOVABLE_API_KEY)。声・速度・instructions は
 * src/lib/tts.functions.ts と同一に固定(声の統一、§4.3)。
 * 再実行は audio_path IS NULL 条件により自然に途中再開になる。
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = Number(argVal("--limit", "0")) || 0; // 0 = no limit
const LEVEL_MAX = Number(argVal("--level-max", "3"));
const CONCURRENCY = Number(argVal("--concurrency", "4"));
const DRY_RUN = args.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境変数で指定してください");
  process.exit(1);
}

// --- TTS config: src/lib/ai-provider.server.ts getTts() と同じ解決順 ---
function getTts() {
  const baseURL = process.env.TTS_BASE_URL;
  const key = process.env.TTS_API_KEY;
  if (baseURL && key) {
    return {
      url: `${baseURL.replace(/\/$/, "")}/audio/speech`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      model: process.env.TTS_MODEL ?? "gpt-4o-mini-tts",
    };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    console.error("LOVABLE_API_KEY か TTS_BASE_URL+TTS_API_KEY を設定してください");
    process.exit(1);
  }
  return {
    url: "https://ai.gateway.lovable.dev/v1/audio/speech",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
    model: process.env.TTS_MODEL ?? "openai/gpt-4o-mini-tts",
  };
}

// --- アプリと同一の定数(変えるとキャッシュミスになる) ---
const LANGUAGE = "zh-TW";
const VOICE = "alloy"; // TTS_VOICE_DEFAULT (src/lib/tts-cache.ts)
const SPEED = 0.95; // DEFAULT_SPEED (src/lib/tts.functions.ts) → voiceKey は素の "alloy"
const INSTRUCTIONS =
  "Speak naturally in Taiwan Mandarin (zh-TW) with a warm, friendly tone. Use authentic Taiwanese pronunciation, not mainland Mandarin.";

/** src/lib/tts-cache.ts ttsObjectPath と同一のロジック(node crypto版)。 */
function ttsObjectPath(text) {
  const hex = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  return `${LANGUAGE}/${VOICE}/${hex}.mp3`;
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const tts = getTts();

async function synthesize(text, attempt = 1) {
  const res = await fetch(tts.url, {
    method: "POST",
    headers: tts.headers,
    body: JSON.stringify({
      model: tts.model,
      input: text,
      voice: VOICE,
      response_format: "mp3",
      speed: SPEED,
      instructions: INSTRUCTIONS,
    }),
  });
  if (!res.ok) {
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return synthesize(text, attempt + 1);
    }
    throw new Error(`TTS ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function processEntry(entry) {
  const path = ttsObjectPath(entry.headword);
  if (DRY_RUN) return { ...entry, path, skipped: true };

  // 既存キャッシュ(オンデマンド生成済み)ならアップロードを飛ばして
  // audio_path だけ埋める。
  const { data: existing } = await supabase.storage.from("tts").createSignedUrl(path, 60);
  if (!existing?.signedUrl) {
    const buf = await synthesize(entry.headword);
    const { error: upErr } = await supabase.storage
      .from("tts")
      .upload(path, buf, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  }
  const { error: dbErr } = await supabase
    .from("dictionary_entries")
    .update({ audio_path: path })
    .eq("id", entry.id);
  if (dbErr) throw new Error(`db update failed: ${dbErr.message}`);
  return { ...entry, path };
}

async function main() {
  let query = supabase
    .from("dictionary_entries")
    .select("id, headword, tocfl_level")
    .eq("language", LANGUAGE)
    .is("audio_path", null)
    .lte("tocfl_level", LEVEL_MAX)
    .order("tocfl_level", { ascending: true })
    .order("headword", { ascending: true });
  if (LIMIT > 0) query = query.limit(LIMIT);
  const { data: entries, error } = await query;
  if (error) throw new Error(error.message);
  if (!entries?.length) {
    console.log("対象なし(すべて audio_path 設定済み、または辞書が空)");
    return;
  }
  console.log(
    `対象 ${entries.length} 語 (TOCFL ≤${LEVEL_MAX}${LIMIT ? `, limit ${LIMIT}` : ""}${DRY_RUN ? ", DRY RUN" : ""})`,
  );
  console.log(`TTS: ${tts.url} model=${tts.model} voice=${VOICE} speed=${SPEED}`);

  let done = 0;
  let failed = 0;
  const queue = [...entries];
  async function worker() {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      try {
        await processEntry(entry);
        done += 1;
        if (done % 25 === 0 || done + failed === entries.length) {
          console.log(`  ${done}/${entries.length} 完了 (失敗 ${failed})`);
        }
      } catch (e) {
        failed += 1;
        console.error(`  ✗ ${entry.headword}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`完了: 成功 ${done} / 失敗 ${failed}`);

  // 受入セルフチェック: 3件サンプルの署名URLが取得できること
  if (!DRY_RUN && done > 0) {
    const { data: sample } = await supabase
      .from("dictionary_entries")
      .select("headword, audio_path")
      .not("audio_path", "is", null)
      .limit(3);
    for (const s of sample ?? []) {
      const { data: signed } = await supabase.storage.from("tts").createSignedUrl(s.audio_path, 300);
      console.log(`  ✓ ${s.headword}: ${signed?.signedUrl ? "署名URL OK — 耳で確認して" : "署名URL取得失敗!"}`);
      if (signed?.signedUrl) console.log(`    ${signed.signedUrl}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
