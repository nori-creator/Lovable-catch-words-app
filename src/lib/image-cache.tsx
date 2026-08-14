/**
 * Device-local image cache (IndexedDB), keyed by the STORAGE PATH — not the
 * signed URL, which rotates and defeats the browser HTTP cache.
 *
 * Why: the Capture&Converse prototype kept images as data URLs in
 * localStorage, so the album rendered instantly with zero network — that's
 * the feel we're replicating. Here Supabase storage stays the source of
 * truth (multi-device, social), but every image is written into IndexedDB
 * the first time it's seen (and at save time, before any download), so the
 * dex/album never re-downloads and never "trickles in from the top".
 *
 * Usage: <CachedImg> below, or putCachedImage(path, blob) right after upload.
 */
import { useEffect, useRef, useState } from "react";

const DB_NAME = "catchwords-img-cache";
const STORE = "images";

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
      req.onerror = () => resolve(null); // private mode etc. — cache is optional
    });
  }
  return dbPromise;
}

export async function getCachedImage(path: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(path);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putCachedImage(path: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Extract the storage path from a Supabase signed URL (…/object/sign/<bucket>/<path>?token=…). */
export function pathFromSignedUrl(url: string): string | null {
  const m = url.match(/\/object\/sign\/[^/]+\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * In-memory object-URL registry so repeated renders reuse one URL per path.
 *
 * ## 上限が要る理由
 * `URL.createObjectURL` で作った URL は、`revokeObjectURL` するまで
 * **元の Blob をメモリに掴んだまま**にする。ここには上限も破棄も無かったので、
 * 図鑑を下まで転がすと通り過ぎた画像が1枚残らず居座った。500件のコレクションを
 * 一度眺めただけで500枚ぶんが常駐する — 端末が弱いほど、集めた人ほど重くなる。
 *
 * 直近に使ったものから順に残し、あふれた古いものを捨てる(LRU)。
 * 捨てても壊れない: 次に必要になったら IndexedDB から作り直すだけで、
 * ネットワークには出ない。
 */
const MAX_OBJECT_URLS = 240;
/** 破棄までの猶予。読み込み中の <img> の足元で revoke すると画像が割れる。 */
const REVOKE_DELAY_MS = 10_000;
const objectUrls = new Map<string, string>();

/**
 * いま画面に出ている <img> の数(パスごと)。
 *
 * **表示中のものは絶対に捨てない。** 上限を入れた最初の版はここが無く、
 * 「いちばん古い = いちばん上にある = いま画面に見えている」ものから
 * 順に解放していた。`CachedImg` は解決済みのURLを state に持っていて
 * 作り直さないので、解放されたセルはそのまま白く抜ける — つまり
 * **メモリを守るために、見えている画像を壊していた**。
 */
const liveRefs = new Map<string, number>();

export function retainCachedPath(path: string) {
  liveRefs.set(path, (liveRefs.get(path) ?? 0) + 1);
}
export function releaseCachedPath(path: string) {
  const n = (liveRefs.get(path) ?? 0) - 1;
  if (n > 0) liveRefs.set(path, n);
  else liveRefs.delete(path);
}

function touch(path: string): string | undefined {
  const u = objectUrls.get(path);
  // Map は挿入順を保つので、入れ直すと「いちばん新しい」位置へ動く。
  if (u !== undefined) {
    objectUrls.delete(path);
    objectUrls.set(path, u);
  }
  return u;
}

/** 少し待ってから解放する(読み込み中の <img> の足元で消さない)。 */
function scheduleRevoke(url: string) {
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

function remember(path: string, url: string) {
  // 同じパスが同時に2回解決されることがある(2つのセルが同じ画像を出す等)。
  // 上書きするだけだと前のURLが宙に浮き、上限を入れた意味が無くなる。
  const prev = objectUrls.get(path);
  if (prev && prev !== url) scheduleRevoke(prev);
  objectUrls.set(path, url);
  if (objectUrls.size <= MAX_OBJECT_URLS) return;

  // 古い順に見て、**いま表示されていないもの**だけを捨てる。
  const over = objectUrls.size - MAX_OBJECT_URLS;
  let dropped = 0;
  for (const key of [...objectUrls.keys()]) {
    if (dropped >= over) break;
    if (key === path) continue;
    if ((liveRefs.get(key) ?? 0) > 0) continue; // 表示中は飛ばす
    const victim = objectUrls.get(key)!;
    objectUrls.delete(key);
    scheduleRevoke(victim);
    dropped++;
  }
  // 全部が表示中なら1つも捨てられない。それでいい —
  // 上限は目安であって、見えているものを壊す理由にはならない。
}

async function resolveSrc(signedUrl: string): Promise<string> {
  const path = pathFromSignedUrl(signedUrl);
  if (!path) return signedUrl;
  const existing = touch(path);
  if (existing) return existing;
  const cached = await getCachedImage(path);
  if (cached) {
    const u = URL.createObjectURL(cached);
    remember(path, u);
    return u;
  }
  // First sight: fetch once via the signed URL, then persist for next time.
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) return signedUrl;
    const blob = await res.blob();
    void putCachedImage(path, blob);
    const u = URL.createObjectURL(blob);
    remember(path, u);
    return u;
  } catch {
    return signedUrl;
  }
}

/**
 * Drop-in <img> whose source is served from the device cache when available.
 * Falls back to the signed URL transparently (SSR, private mode, first load).
 */
export function CachedImg({
  src,
  ...rest
}: { src: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const [resolved, setResolved] = useState<string | null>(() => {
    const p = pathFromSignedUrl(src);
    return (p && objectUrls.get(p)) || null;
  });
  const srcRef = useRef(src);
  srcRef.current = src;
  // 何度やり直したか。増やすと下の効果が走り直して、解決からやり直す。
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    // 表示している間は「使用中」と印を付けておく。これが無いと、
    // 上限を超えたときに**いま見えている画像**が解放されうる。
    const path = pathFromSignedUrl(src);
    if (path) retainCachedPath(path);
    void resolveSrc(src).then((u) => {
      if (alive && srcRef.current === src) setResolved(u);
    });
    return () => {
      alive = false;
      if (path) releaseCachedPath(path);
    };
  }, [src, attempt]);

  // Until the cache answers, render nothing rather than kicking off a
  // duplicate network request for the signed URL.
  if (!resolved) return <span className={rest.className} aria-hidden="true" />;
  return (
    <img
      src={resolved}
      // blob: の解放とすれ違って読み込みに失敗することは起こりうる
      // (別のタブが同じパスを解放した直後など)。**黙って白いままに
      // しない** — 一度だけ解決からやり直す。端末内のキャッシュから
      // 作り直すだけなので、通信は発生しない。
      onError={() => {
        if (attempt === 0) {
          const p = pathFromSignedUrl(src);
          if (p) objectUrls.delete(p);
          setResolved(null);
          setAttempt(1);
        }
      }}
      {...rest}
    />
  );
}
