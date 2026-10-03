import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { registerCollectionReader } from "./lib/catch-animation-pref";
import { STICKERS_KEY, type StickerList } from "./lib/sticker-pages";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * 既定の3回・指数バックオフのままだと、通信が死んでいるとき
         * **エラー表示に辿り着くまで30秒以上**スケルトンが回り続ける。
         * 画面がエラーを出せるようになっても、そこへ着くのが遅ければ
         * ユーザーの体験は「固まっている」ままで変わらない。
         *
         * 1回だけ短く待って再試行し、駄目なら早く諦めて理由を出す。
         * やり直しは LoadFailed の「もう一度」でユーザーが決める
         * (§8: 状態を正直に、回復手段と一緒に)。
         */
        retry: 1,
        retryDelay: 800,
      },
    },
  });

  /**
   * キャッチの演出が「今回は節目か」を知るための口（`catch-animation-pref.ts`）。
   * 演出は React の外で走るので、一覧のキャッシュの読み方だけをここで渡す。
   */
  registerCollectionReader(() => {
    const list = queryClient.getQueryData<StickerList>(STICKERS_KEY);
    if (!list) return null;
    const ids = new Set(list.items.map((s) => s.id));
    return { count: Math.max(list.items.length, list.total ?? 0), has: (id) => ids.has(id) };
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // 指の端末では殻が巻き取る（`lib/scroll-root.ts`）。別の画面へ移ったら殻も上へ。
    scrollToTopSelectors: ["[data-app-shell]"],
    defaultPreloadStaleTime: 0,
    /**
     * **押す前に、行き先を取りに行く。**（オーナー報告 2026-09-15
     * 「カメラを開いた時に、実際にカメラが開くまで5秒ぐらいラグがある」）
     *
     * この app は Capacitor の `server.url` 方式 = **殻の中のブラウザが
     * 公開中のサイトを見る**形なので、画面のかたまりは毎回ネットワークから
     * 来る。行き先のかたまりを押した瞬間に取りに行くと、着くまで**前の画面が
     * 出たまま**になる（録画でもタブの選択だけが変わり、中身はホームのまま
     * 5秒続いていた）。
     *
     * `"intent"` は指が触れた時点（`touchstart` / `pointerenter`）で取りに
     * 行く。押し切るまでの数十msぶん早く始まるうえ、**触ってやめた**ときも
     * 次に押した時には手元にある。
     */
    defaultPreload: "intent",
  });

  return router;
};
