/**
 * **棚の絵を端末に置く**（オーナー指示 R20「アプリを開くとまだ仮の棚が表示される。アプリを
 * 開いた時に早く表示したいから、最速の方法を考えて。端末内にデータを入れとくのでもいい」）。
 *
 * 3D の棚が出るまでには、three.js の読み込み・形（GLB）・背表紙の字の絵・影の計算が要り、
 * スマホでは 2〜3 秒かかっていた（オーナーの動画で実測: 開いて 2.7 秒後）。その間を埋めるため、
 *  1. 3D が描けたら、その棚をそのまま**絵として撮り**、端末の Cache Storage に置く
 *  2. 次に開いた時は、3D を待たずにこの絵を**最初の描画で**出し、3D が描けたら差し替える
 *  3. まだ撮っていない（初めて開く）時は、アプリに同梱した空の棚の絵を出す
 * 絵は 3D と同じ位置・同じ大きさなので、差し替わっても動いて見えない。
 */
const CACHE = "cw-shelf-snap-v1";
const KEY = "/shelf-snapshot";

/** 初めての人に出す、同梱の空の棚（部屋 A。本は 3D が描けてから並ぶ）。 */
export const SHELF_PLACEHOLDER = "/shelf/room-a-empty.webp";

const FLAG = "cw-shelf-snap";

/**
 * この端末に撮った絵があるか（同期で分かる印）。無い人は同梱の絵を**すぐ**出し、
 * ある人は絵を読み終えるまで（ふつう数十ミリ秒）待つ — 同梱の絵が一瞬出てから
 * 自分の棚に替わる、という入れ替わりを見せないため。
 */
export function hasShelfSnapshot(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export async function readShelfSnapshot(): Promise<string | null> {
  try {
    if (typeof caches === "undefined") return null;
    const c = await caches.open(CACHE);
    const r = await c.match(KEY);
    if (!r) return null;
    return URL.createObjectURL(await r.blob());
  } catch {
    return null;
  }
}

export async function saveShelfSnapshot(dataUrl: string): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const blob = await (await fetch(dataUrl)).blob();
    // 大きすぎる絵は置かない（端末の容量を食わない。ふつうは 100KB 前後）。
    if (!blob.size || blob.size > 1_500_000) return;
    const c = await caches.open(CACHE);
    await c.put(KEY, new Response(blob, { headers: { "content-type": blob.type } }));
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      /* 印が置けなくても、絵は読める（同梱の絵が一瞬先に出るだけ） */
    }
  } catch {
    // 置けなくても困らない（次も同梱の絵から始まるだけ）。
  }
}
