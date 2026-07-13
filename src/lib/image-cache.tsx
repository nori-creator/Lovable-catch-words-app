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

// In-memory object-URL registry so repeated renders reuse one URL per path.
const objectUrls = new Map<string, string>();

async function resolveSrc(signedUrl: string): Promise<string> {
  const path = pathFromSignedUrl(signedUrl);
  if (!path) return signedUrl;
  const existing = objectUrls.get(path);
  if (existing) return existing;
  const cached = await getCachedImage(path);
  if (cached) {
    const u = URL.createObjectURL(cached);
    objectUrls.set(path, u);
    return u;
  }
  // First sight: fetch once via the signed URL, then persist for next time.
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) return signedUrl;
    const blob = await res.blob();
    void putCachedImage(path, blob);
    const u = URL.createObjectURL(blob);
    objectUrls.set(path, u);
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
  useEffect(() => {
    let alive = true;
    void resolveSrc(src).then((u) => {
      if (alive && srcRef.current === src) setResolved(u);
    });
    return () => {
      alive = false;
    };
  }, [src]);
  // Until the cache answers, render nothing rather than kicking off a
  // duplicate network request for the signed URL.
  if (!resolved) return <span className={rest.className} aria-hidden="true" />;
  return <img src={resolved} {...rest} />;
}
