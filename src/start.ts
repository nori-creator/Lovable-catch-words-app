import { createStart, createMiddleware } from "@tanstack/react-start";

import { isRequestAbortError } from "./lib/abort-error";
import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { configuredServerOrigin, makeServerFnFetch } from "@/lib/server-origin";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (isRequestAbortError(error)) {
      return new Response(null, { status: 204 });
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
  serverFns: {
    /**
     * サーバー関数の呼び先。
     *
     * `VITE_SERVER_ORIGIN` が設定されているときだけ、相対パスの呼び先を
     * そのドメインへ付け替える。**未設定なら素の fetch と同じ**なので、
     * いまのブラウザ版の挙動は一切変わらない。
     *
     * これは「画面を端末に同梱する」方式へ移るための下ごしらえ。
     * 同梱すると画面は `capacitor://localhost` から開かれるのに、
     * サーバー関数の呼び先はビルド時に焼き込まれた相対パスのままなので、
     * 何も無い場所を叩いてアプリが丸ごと動かなくなる。
     * 詳しくは docs/capacitor-bundling.md。
     */
    fetch: makeServerFnFetch(configuredServerOrigin()),
  },
}));
