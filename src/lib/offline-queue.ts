/**
 * Minimal IndexedDB queue for captures taken while offline (subway, crowds).
 * The photo is saved locally the moment the shutter fires; AI analysis runs
 * later when the network is back. No dependencies, safe under SSR (no-ops).
 */

export type PendingCapture = {
  id: string;
  object_img: string; // data URL
  selfie_img: string | null;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  created_at: number;
};

const DB_NAME = "catchwords-offline";
const STORE = "pending_captures";

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function enqueueCapture(
  item: Omit<PendingCapture, "id" | "created_at">,
): Promise<PendingCapture | null> {
  if (!hasIdb()) return null;
  const full: PendingCapture = {
    ...item,
    id: crypto.randomUUID(),
    created_at: Date.now(),
  };
  // ここだけ try/catch が無く、IndexedDB が拒否したとき(Safari のプライベート
  // ブラウズ、容量超過 — 1600px の JPEG を data URL で持つので現実に起きる)
  // 例外が呼び出し元の catch を突き抜けて、撮影画面が "processing" のまま
  // 固まっていた。その画面には閉じるボタンも戻るも無いので、強制終了しか
  // 逃げ道が無くなる。他の関数と同じく null で返す。
  try {
    await tx("readwrite", (s) => s.put(full));
    return full;
  } catch {
    return null;
  }
}

export async function listPendingCaptures(): Promise<PendingCapture[]> {
  if (!hasIdb()) return [];
  try {
    const all = await tx<PendingCapture[]>(
      "readonly",
      (s) => s.getAll() as IDBRequest<PendingCapture[]>,
    );
    return all.sort((a, b) => a.created_at - b.created_at);
  } catch {
    return [];
  }
}

export async function getPendingCapture(id: string): Promise<PendingCapture | null> {
  if (!hasIdb()) return null;
  try {
    const item = await tx<PendingCapture | undefined>(
      "readonly",
      (s) => s.get(id) as IDBRequest<PendingCapture | undefined>,
    );
    return item ?? null;
  } catch {
    return null;
  }
}

export async function removePendingCapture(id: string): Promise<void> {
  if (!hasIdb()) return;
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* noop */
  }
}
