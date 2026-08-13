import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

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

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
