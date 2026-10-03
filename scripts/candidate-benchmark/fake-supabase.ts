/**
 * 候補の精度の測り（`scripts/candidate-benchmark.mjs`）専用の、**何も持っていない DB**。
 *
 * 本物のサーバ関数（`suggestWords`）は、AI を呼ぶ前に DB を引く（1日の上限・その人の級・
 * 解説の言語・管理画面のモデルの上書き・台湾の読みの表）。測りでは本番の DB に触らない
 * （上限を減らさない・人の行を読まない）ので、どの問い合わせにも「行は無い」と答える。
 * サーバはその時の既定（級 = 既定、モデル = 環境変数の設定）で動く。
 */
type Result = { data: null; error: null; count: 0 };
const EMPTY: Result = { data: null, error: null, count: 0 };

function chain(): unknown {
  const target = function () {
    /* 呼ばれても同じ鎖を返す */
  };
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "then")
        return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(EMPTY).then(resolve, reject);
      if (prop === "catch" || prop === "finally")
        return (...args: unknown[]) =>
          (Promise.resolve(EMPTY) as unknown as Record<string, (...a: unknown[]) => unknown>)[
            prop as string
          ](...args);
      return chain();
    },
    apply() {
      return chain();
    },
  });
}

export const supabaseAdmin = chain() as never;
export const supabase = chain() as never;
