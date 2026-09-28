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

/**
 * 開くのを待つ上限。**iPhone の Safari では `indexedDB.open` が返って
 * こないことがある**（成功も失敗も呼ばれない）。撮った直後にここを待って
 * いたので、その回は AI の分析が始まらず「分析中」のまま止まっていた
 * （オーナー報告 2026-09-27「iPhone で撮影後に AI 分析が進まない」）。
 * 待つのはここまでにして、預けられなかった扱いにする。
 */
export const OPEN_TIMEOUT_MS = 4000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("indexedDB open timed out"));
    }, OPEN_TIMEOUT_MS);
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      done(() => reject(e));
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      if (settled) {
        // 上限を過ぎてから開いた接続は、使わずに閉じる。
        req.result.close();
        return;
      }
      done(() => resolve(req.result));
    };
    req.onerror = () => done(() => reject(req.error));
    // 別のタブが古い版を開いたままだと、ここで止まる。待たずに失敗にする。
    req.onblocked = () => done(() => reject(new Error("indexedDB open blocked")));
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
        // 開いた接続は**どの終わり方でも**閉じる。
        // 以前は `oncomplete` だけだったので、容量超過などで失敗した
        // トランザクションのぶんが開きっぱなしになっていた。
        // 失敗が続くほど接続が積み上がるのは、いちばん困る場面
        // (容量が足りていない端末)でいちばん効いてくる。
        const close = () => db.close();
        t.oncomplete = close;
        t.onerror = close;
        t.onabort = close;
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

/** 撮影直後に預けた写真へ、あとから自撮りや場所を追記する。 */
export async function updatePendingCapture(
  id: string,
  patch: Partial<Omit<PendingCapture, "id" | "created_at">>,
): Promise<PendingCapture | null> {
  const current = await getPendingCapture(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  try {
    await tx("readwrite", (s) => s.put(next));
    return next;
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
