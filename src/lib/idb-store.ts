/**
 * 端末の中の「貯めるのは任意」な入れ物（IndexedDB）を開く手。
 *
 * 写真（`image-cache.tsx`）と音（`tts-store.ts`）が同じ形を1つずつ写して
 * 持っていたので、ここに寄せた（2026-10-01）。開けない端末（私用モードなど）
 * では `null` を返す — 呼ぶ側は「貯めていない」として進む。
 *
 * 1つの入れ物は1度だけ開き、その約束を使い回す。
 */
export function optionalStoreOpener(
  dbName: string,
  store: string,
): () => Promise<IDBDatabase | null> {
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  return () => {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(store)) {
            req.result.createObjectStore(store);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    }
    return dbPromise;
  };
}
