/*
 * CatchWords のサービスワーカー（スマホにアプリとして入れるための裏方）。
 *
 * オーナー指示 2026-09-29「Android と iPhone でこの URL を開いて使用でき、またアプリとして
 * スマホ上にインストールできるようにして」。
 *
 * 役目は3つだけ:
 *  1. Android の Chrome が「アプリをインストール」を自動で案内するための条件（fetch の受け口）
 *  2. 圏外の時に真っ白にせず「つながっていません」の画面を出す
 *  3. 名前に中身の印（ハッシュ）が付いた画面の部品を端末に置き、2回目から速く開く
 *
 * **画面そのもの（HTML）とサーバの処理（AI・図鑑・復習）は必ず毎回サーバへ取りに行く**。
 * 古い画面を出し続ける事故（更新が届かない）を起こさないため。
 */
const STATIC = "cw-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("cw-static-") && k !== STATIC).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** 名前にハッシュが付いた部品（中身が変わると名前も変わる）。端末にあればそれを使う。 */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/** 名前が変わらない素材（3D の形・字体・音）。端末の物を出しつつ、裏で新しい物に替える。 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

const OFFLINE_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CatchWords</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fbfe;
color:#1d1d1f;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#5b6472;line-height:1.6}
button{min-height:44px;padding:0 22px;border:0;border-radius:999px;background:#0a84ff;color:#fff;
font-size:16px;font-weight:700}</style></head><body><main>
<h1>インターネットにつながっていません</h1>
<p>つながったら、もう一度開いてください。<br>You're offline. Please try again when connected.</p>
<button onclick="location.reload()">もう一度開く</button></main></body></html>`;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (/^\/(models|fonts|shelf|sfx)\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      ),
    );
  }
  // それ以外（サーバの処理・画像・API）は何もしない = いつもどおりサーバへ。
});
