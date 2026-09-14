/**
 * 切り抜き模型の先読みを、いつ見送るか。
 *
 * ## なぜ門が要るか
 * 先読みする物は **23MB**(本番ビルドの実測:
 * `.output/public/assets/ort-wasm-simd-threaded.jsep.*.wasm`。圧縮後 5.7MB、
 * 公開資産 28MB のうち 27MB がこの機能ぶん)。カメラ画面を開いた瞬間に
 * 落とし始める作りなので、間違えたときの代償が大きい割に、
 * **画面を見ても絶対に気づけない**。数字でしか守れない。
 *
 * ここは `shouldPreloadCutout()` だけを見る。本物の `preloadCutout()` は
 * 23MB を落としにいくので、テストから呼ばない。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

type Conn = { saveData?: boolean; effectiveType?: string };

/**
 * `navigator` と `sessionStorage` を差し替えて `shouldPreloadCutout` を読む。
 *
 * `cutout.ts` はモジュールの変数に覚えを持つので、**毎回読み込み直す**。
 * 使い回すと、前のテストの覚えが次のテストの答えになる。
 */
async function ask(opts: {
  connection?: Conn | undefined;
  /** `sessionStorage` に残っている「サーバの切り抜きが使えるか」。 */
  remembered?: "1" | "0" | null;
  /** `navigator` そのものが無い(サーバ側で描いているとき)。 */
  noNavigator?: boolean;
}): Promise<boolean> {
  vi.resetModules();
  const store = new Map<string, string>();
  if (opts.remembered != null) store.set("cutout:server-available", opts.remembered);
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  if (opts.noNavigator) {
    vi.stubGlobal("navigator", undefined);
  } else {
    vi.stubGlobal("navigator", { connection: opts.connection });
  }
  const { shouldPreloadCutout } = await import("./cutout");
  return shouldPreloadCutout();
}

describe("切り抜き模型(23MB)の先読みを見送る条件", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("**回線が分からないときは先読みする**(iOS には回線を教える API が無い)", async () => {
    // ここを false に倒すと、iPhone では**常に**見送ることになる。
    // 切り抜きに要る通信量はどのみち同じで、違うのはいつ払うかだけ。
    // 撮ってから払うと、その人は待たされる。
    expect(await ask({ connection: undefined })).toBe(true);
  });

  it("通信量の節約を立てている端末には落とさない", async () => {
    expect(await ask({ connection: { saveData: true } })).toBe(false);
    // 4g でも saveData が優先。回線の速さと、使ってよい量は別の話。
    expect(await ask({ connection: { saveData: true, effectiveType: "4g" } })).toBe(false);
  });

  it("遅いと分かっている回線には落とさない", async () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect([effectiveType, await ask({ connection: { effectiveType } })]).toEqual([
        effectiveType,
        false,
      ]);
    }
  });

  it("速い回線には落とす", async () => {
    expect(await ask({ connection: { effectiveType: "4g" } })).toBe(true);
    expect(await ask({ connection: { saveData: false, effectiveType: "4g" } })).toBe(true);
  });

  it("**サーバの切り抜きが使えると分かっていたら落とさない**(一度も走らないので)", async () => {
    // `removeBackgroundSmart` はサーバを先に試し、成功したらそこで返す。
    // 鍵が設定された環境では、この 23MB はまるごと無駄だった。
    expect(await ask({ connection: { effectiveType: "4g" }, remembered: "1" })).toBe(false);
    // 使えないと分かっているなら、ローカルが本線なので落とす。
    expect(await ask({ connection: { effectiveType: "4g" }, remembered: "0" })).toBe(true);
  });

  it("`navigator` が無い所(サーバ側の描画)では何もしない", async () => {
    expect(await ask({ noNavigator: true })).toBe(false);
  });
});
