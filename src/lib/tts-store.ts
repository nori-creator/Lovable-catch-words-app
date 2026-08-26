import { TTS_VOICE_DEFAULT } from "./tts-cache";

/**
 * **発音を端末の中に貯める。**
 *
 * オーナー指摘 2026-08-26:
 * > 「アプリ内の音声ボタンを押しても発音がすぐに聞こえないのがストレスだから、
 * >  ラグが長すぎる。過去に調べた発音は端末内に保存し、新しく音声を生成する
 * >  場合は、発音がでるようになってから発音ボタンを表示して」
 *
 * ## 何が遅かったか
 * 押してから鳴るまでに**往復が3回**あった。
 *
 *   1. サーバ関数 `synthesizeSpeech` を呼ぶ（認証つき）
 *   2. その中で Supabase に署名付きURLを作らせる
 *   3. 返ってきたURLから mp3 を**その場でダウンロード**する
 *
 * 3つ目がいちばん見落とされていた。「キャッシュに在る」と言っていたのは
 * *サーバ側*の話で、端末は毎回ネットから音を取り直していた。しかも
 * 覚えていたのは URL だけ、置き場所は画面ごとの `useRef` なので、
 * **画面を閉じれば消える**。同じ語を2回押しても2回とも遅い。
 *
 * ## 直し方
 * **音そのもの（Blob）を IndexedDB に置く。** 2回目からは往復が0回になり、
 * `URL.createObjectURL` で即座に鳴る。写真で同じことをしている
 * （`image-cache.tsx`）ので、形もそちらに合わせてある。
 *
 * 鍵は**署名付きURLではなく (言語, 声, 語)** から作る。署名は数時間で
 * 変わるので、URLを鍵にすると翌日には全部が「無い」になる。
 * サーバの置き場所（`tts-cache.ts` の `ttsObjectPath`）と同じ材料。
 */

const DB_NAME = "catchwords-tts-cache";
const STORE = "audio";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // 私用モードなど — 貯めるのは任意
    });
  }
  return dbPromise;
}

/**
 * 端末の中での鍵。**純粋な関数**にしておく（試験から呼べる）。
 *
 * 語の前後の空白は落とす — 「傘」と「傘 」が別の音として2つ貯まると、
 * 片方は永久に当たらない。
 */
export function audioCacheKey(
  language: string,
  text: string,
  voice: string = TTS_VOICE_DEFAULT,
): string {
  return `${language}|${voice}|${text.trim()}`;
}

export async function getCachedAudio(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putCachedAudio(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * その語の音が**いまこの瞬間に鳴らせるか**。
 *
 * - `ready`   … 端末の中に在る。押せば0秒で鳴る
 * - `loading` … 取りに行っている最中。**ボタンを出さない**
 * - `none`    … まだ何もしていない
 * - `failed`  … 取れなかった。端末の声に落ちる
 */
export type SpeechState = "none" | "loading" | "ready" | "failed";

/**
 * いま分かっている状態と、鳴らせる URL。
 *
 * **画面をまたいで1つ**にする。以前は画面ごとの `useRef` に URL を
 * 持っていたので、候補の画面で先読みしたものが、カードを開いた瞬間に
 * 消えていた（同じ語なのに、また待たされる）。
 */
const states = new Map<string, SpeechState>();
const objectUrls = new Map<string, string>();
const listeners = new Set<() => void>();

/**
 * 作った object URL の上限。
 *
 * `createObjectURL` は `revokeObjectURL` するまで Blob をメモリに掴む。
 * 音は写真よりずっと小さい（1語 5〜15KB）ので上限は緩くてよいが、
 * **上限が無いのは駄目** — 図鑑を延々と転がした人の端末で効いてくる。
 */
const MAX_OBJECT_URLS = 400;

function notify() {
  for (const l of listeners) l();
}

export function subscribeSpeech(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function speechState(key: string): SpeechState {
  return states.get(key) ?? "none";
}

export function speechUrl(key: string): string | null {
  return objectUrls.get(key) ?? null;
}

/** 状態だけを動かす（取りに行き始めた／失敗した）。 */
export function setSpeechState(key: string, state: SpeechState): void {
  if (states.get(key) === state) return;
  states.set(key, state);
  notify();
}

/**
 * 鳴らせるようになったことを記録する。
 *
 * `blob` から URL を作って持つ。あふれたら**古いものから捨てる**が、
 * 捨てても壊れない — IndexedDB から作り直すだけで、ネットには出ない。
 */
export function markSpeechReady(key: string, blob: Blob): string {
  const existing = objectUrls.get(key);
  if (existing) {
    // 直近に使ったものとして入れ直す（Map は挿入順を保つ）。
    objectUrls.delete(key);
    objectUrls.set(key, existing);
    setSpeechState(key, "ready");
    return existing;
  }
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  while (objectUrls.size > MAX_OBJECT_URLS) {
    const oldest = objectUrls.keys().next();
    if (oldest.done) break;
    const gone = objectUrls.get(oldest.value);
    objectUrls.delete(oldest.value);
    // 捨てた語は「無い」に戻す。**`ready` のまま残すと、URL が
    // 死んでいるのにボタンだけ出る**（押しても鳴らない）。
    states.delete(oldest.value);
    if (gone) {
      try {
        URL.revokeObjectURL(gone);
      } catch {
        /* 既に外れている */
      }
    }
  }
  states.set(key, "ready");
  notify();
  return url;
}

/** 試験用。画面をまたぐ入れ物なので、試験の間で持ち越さない。 */
export function resetSpeechStoreForTest(): void {
  states.clear();
  objectUrls.clear();
  listeners.clear();
}
