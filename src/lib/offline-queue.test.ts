import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  enqueueCapture,
  listPendingCaptures,
  getPendingCapture,
  removePendingCapture,
} from "./offline-queue";

/**
 * 解析が通らなかった写真を端末に預かるキュー。
 *
 * ## なぜ守るか
 * ここに入るのは**二度と撮れない写真**。電車の中で見かけた看板、
 * その日その場所にしか無かったもの。ここが静かに落ちると、
 * ユーザーは撮ったものを失う。
 *
 * そして実際に落ちていた。`enqueueCapture` だけ try/catch が無く、
 * IndexedDB が拒否する状況(Safari のプライベートブラウズ、容量超過 —
 * 1600px の JPEG を data URL で持つので現実に起きる)で例外が
 * 呼び出し元を突き抜け、**撮影画面が「処理中」のまま固まっていた**。
 * その画面には閉じるボタンも戻るも無いので、強制終了しか逃げ道が無い。
 */

const shot = (n: string) => ({
  object_img: `data:image/jpeg;base64,${n}`,
  selfie_img: null,
  lat: null,
  lng: null,
  location_name: null,
});

async function clearAll() {
  for (const item of await listPendingCaptures()) {
    await removePendingCapture(item.id);
  }
}

beforeEach(clearAll);

describe("enqueueCapture", () => {
  it("預けたものを、そのまま返す", () => {
    return enqueueCapture(shot("a")).then((saved) => {
      expect(saved).not.toBeNull();
      expect(saved!.object_img).toBe("data:image/jpeg;base64,a");
      expect(saved!.id).toBeTruthy();
      expect(saved!.created_at).toBeGreaterThan(0);
    });
  });

  it("預けたものを、あとから id で取り出せる", async () => {
    const saved = await enqueueCapture(shot("b"));
    const got = await getPendingCapture(saved!.id);
    expect(got?.object_img).toBe("data:image/jpeg;base64,b");
  });

  it("2枚預けたら2枚とも残る(上書きし合わない)", async () => {
    await enqueueCapture(shot("c"));
    await enqueueCapture(shot("d"));
    expect(await listPendingCaptures()).toHaveLength(2);
  });

  it("IndexedDB を開く時点で弾かれても、例外を投げず null を返す", async () => {
    // ここが投げると、撮影画面が「処理中」のまま出口なしで固まる。
    const open = indexedDB.open;
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    try {
      await expect(enqueueCapture(shot("e"))).resolves.toBeNull();
    } finally {
      // **finally で戻すこと。** try/finally にする前は、この検査が
      // 落ちた瞬間に差し替えたままになり、後続の検査まで巻き添えで
      // 落ちていた(本当に壊れている箇所が1つなのに2つ赤くなる)。
      vi.mocked(indexedDB.open).mockRestore();
      indexedDB.open = open;
    }
  });

  it("**書き込みが容量超過で失敗しても、例外を投げず null を返す**", async () => {
    // 容量超過は**開いたあと、put のときに非同期で**来る。上の検査は
    // 「開く前に同期で投げる」道しか通っておらず、コメントに書いた
    // 「容量超過」を実際には試していなかった(検査に指摘された)。
    // こちらが本命の道 — 1600px の JPEG を data URL で持つので現実に起きる。
    const open = indexedDB.open;
    vi.spyOn(indexedDB, "open").mockImplementation((...args) => {
      const req = open.apply(indexedDB, args as Parameters<typeof open>);
      const origSuccess = Object.getOwnPropertyDescriptor(req, "onsuccess");
      void origSuccess;
      req.addEventListener("success", () => {
        const db = req.result;
        const realTx = db.transaction.bind(db);
        db.transaction = ((...targs: Parameters<IDBDatabase["transaction"]>) => {
          const t = realTx(...targs);
          const realStore = t.objectStore.bind(t);
          t.objectStore = ((name: string) => {
            const store = realStore(name);
            store.put = () => {
              const fake = new EventTarget() as unknown as IDBRequest;
              Object.defineProperty(fake, "error", {
                value: new DOMException("quota", "QuotaExceededError"),
              });
              // 非同期でエラーを起こす(本物の挙動と同じ順序)。
              setTimeout(() => {
                (fake as unknown as { onerror?: (e: Event) => void }).onerror?.(new Event("error"));
              }, 0);
              return fake;
            };
            return store;
          }) as typeof t.objectStore;
          return t;
        }) as typeof db.transaction;
      });
      return req;
    });
    try {
      await expect(enqueueCapture(shot("f"))).resolves.toBeNull();
    } finally {
      vi.mocked(indexedDB.open).mockRestore();
      indexedDB.open = open;
    }
  });
});

describe("listPendingCaptures", () => {
  it("何も無ければ空", async () => {
    expect(await listPendingCaptures()).toEqual([]);
  });

  it("古い順に並ぶ(先に撮ったものから片付けられる)", async () => {
    const a = await enqueueCapture(shot("1"));
    // created_at は Date.now() なので、同じミリ秒に入ると順序が決まらない。
    await new Promise((r) => setTimeout(r, 2));
    const b = await enqueueCapture(shot("2"));
    const list = await listPendingCaptures();
    expect(list.map((x) => x.id)).toEqual([a!.id, b!.id]);
  });
});

describe("getPendingCapture", () => {
  it("知らない id は null(例外にしない)", async () => {
    expect(await getPendingCapture("いない-id")).toBeNull();
  });
});

describe("removePendingCapture", () => {
  it("消したものは一覧からも消える", async () => {
    const a = await enqueueCapture(shot("x"));
    await enqueueCapture(shot("y"));
    await removePendingCapture(a!.id);
    const list = await listPendingCaptures();
    expect(list).toHaveLength(1);
    expect(list[0].object_img).toBe("data:image/jpeg;base64,y");
  });

  it("知らない id を消しても落ちない", async () => {
    await expect(removePendingCapture("いない-id")).resolves.toBeUndefined();
  });
});
