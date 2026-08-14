import { describe, it, expect } from "vitest";
import { isTruncated } from "./pagination";

/**
 * 「まだ先があるか」の判定。**2回続けて間違えた**ところ。
 */

const LIMIT = 1000;

describe("isTruncated", () => {
  it("総数が分かっていて、受け取ったぶんで足りていれば false", () => {
    expect(isTruncated(12, 12, LIMIT)).toBe(false);
    expect(isTruncated(0, 0, LIMIT)).toBe(false);
  });

  it("総数が受け取ったぶんより多ければ true", () => {
    expect(isTruncated(1200, 1000, LIMIT)).toBe(true);
    expect(isTruncated(1001, 1000, LIMIT)).toBe(true);
  });

  it("サーバー側の上限で切られていても、総数さえあれば見抜ける", () => {
    // ここが2回目の間違いの本体。PostgREST は 1000 で切るので、
    // 1001件目の有無で判定しようとすると**永遠に気づけない**。
    // 総数を見ていれば、受け取りが上限ちょうどでも先があると分かる。
    const returnedCappedByServer = 1000;
    expect(isTruncated(4321, returnedCappedByServer, LIMIT)).toBe(true);
  });

  it("総数が取れないときは、上限ちょうどなら「まだある」と言う", () => {
    // 黙って消えるより、多めに言うほうがまし。
    expect(isTruncated(null, 1000, LIMIT)).toBe(true);
    expect(isTruncated(null, 999, LIMIT)).toBe(false);
    expect(isTruncated(null, 0, LIMIT)).toBe(false);
  });

  it("結合の失敗などで受け取りが上限より少なくても、総数が多ければ true", () => {
    // 単語の結合が取れなかった行は捨てられるので、返す件数は上限より
    // 少なくなりうる。件数の比較だけで判断すると、ここで取りこぼす。
    expect(isTruncated(1500, 995, LIMIT)).toBe(true);
  });
});
