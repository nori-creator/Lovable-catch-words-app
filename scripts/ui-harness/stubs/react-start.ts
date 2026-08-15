/**
 * ハーネス専用の `@tanstack/react-start` の差し替え。
 *
 * ## 何を差し替えて、何を差し替えないか
 * **差し替えるのは通信だけ。** `createServerFn` はサーバー側の入口を作る
 * 仕組みで、アプリ本体のビルド(TanStack Start のプラグイン)が無いと
 * そもそも解決できない(`Missing "#tanstack-start-entry"`)。
 * ここではそれを「呼ばれても返ってこない関数」に置き換える。
 *
 * **markup は絶対に差し替えない。** 検査が見るのは実物のコンポーネントが
 * 実際に描いた DOM で、そこに手を入れたらこの検査の意味が消える
 * (棚の検査が一度そうなっていた)。だから置き換えるのは
 * 「サーバーに行く」ところだけに限る。
 *
 * ## 返ってこない、の意味
 * 待っている状態も**検査の対象**。読み込み中に文字が消える・高さが飛ぶ・
 * 押せないボタンが押せるように見える、といった不具合はここでしか出ない。
 * 中身が埋まった状態は、コンポーネントに props で渡して描く。
 */

type AnyFn = (...args: never[]) => unknown;

/** サーバー関数の定義。ハーネスでは呼ばれない印だけを持つ。 */
export function createServerFn() {
  const chain = {
    validator: () => chain,
    middleware: () => chain,
    inputValidator: () => chain,
    handler: (fn: AnyFn) => Object.assign(fn, { __serverFn: true }),
  };
  return chain;
}

/** サーバー側のミドルウェア。ブラウザでは何もしない。 */
export function createMiddleware() {
  const chain = {
    server: () => chain,
    client: () => chain,
    middleware: () => chain,
  };
  return chain;
}

/** 呼ばれても返ってこない関数を返す(= ずっと読み込み中)。 */
export function useServerFn<T extends AnyFn>(_fn: T) {
  return (() =>
    new Promise(() => {
      /* 意図的に解決しない。読み込み中の面を撮るため。 */
    })) as unknown as T;
}
