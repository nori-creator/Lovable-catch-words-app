import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  needsWebHero,
  shouldOfferWebCandidates,
  heroSearchQuery,
  MAX_QUERY_CHARS,
} from "./hero-image";

/**
 * オーナー指摘「単語の詳細の見出しの画像はネットからその単語を表す画像を
 * 添付して」の受け皿。
 *
 * ここで一番怖いのは**自分で撮った写真を押しのけること**なので、
 * 「あてがう」側より「触らない」側の試験を厚くする。
 */

describe("needsWebHero — あてがう", () => {
  it("**1枚も絵が無い札**にはあてがう(文字キャッチの札)", () => {
    expect(needsWebHero({})).toBe(true);
    expect(
      needsWebHero({ object_url: null, cutout_url: null, selfie_url: null, placeholder_url: null }),
    ).toBe(true);
  });
});

describe("needsWebHero — 触らない", () => {
  it("自分で撮った写真がある札には触らない", () => {
    expect(needsWebHero({ object_url: "o.jpg" })).toBe(false);
    expect(needsWebHero({ cutout_url: "c.png" })).toBe(false);
    // 原寸の掃除が済んで縮小版しか無い札も「撮った写真がある」
    expect(needsWebHero({ object_thumb_url: "o-s.jpg" })).toBe(false);
    expect(needsWebHero({ cutout_thumb_url: "c-s.png" })).toBe(false);
  });

  it("**自撮りだけの札にも触らない**(主役が入れ替わって見える)", () => {
    expect(needsWebHero({ selfie_url: "me.jpg" })).toBe(false);
  });

  it("すでに仮画像が入っている札には触らない(勝手に別の絵に変えない)", () => {
    expect(needsWebHero({ placeholder_url: "net.jpg" })).toBe(false);
  });

  it("札そのものが無いときは何もしない", () => {
    expect(needsWebHero(null)).toBe(false);
    expect(needsWebHero(undefined)).toBe(false);
  });
});

describe("shouldOfferWebCandidates", () => {
  it("**仮画像が入っていても候補は出す**(選び直せる)", () => {
    expect(shouldOfferWebCandidates({ placeholder_url: "net.jpg" })).toBe(true);
    expect(shouldOfferWebCandidates({ selfie_url: "me.jpg" })).toBe(true);
    expect(shouldOfferWebCandidates({})).toBe(true);
  });

  it("自分で撮った写真がある札には差し替えを勧めない", () => {
    expect(shouldOfferWebCandidates({ object_url: "o.jpg" })).toBe(false);
    expect(shouldOfferWebCandidates({ cutout_url: "c.png" })).toBe(false);
  });

  it("**`needsWebHero` より広い**(あてがう所は必ず候補も出る)", () => {
    const cases = [
      {},
      { placeholder_url: "n.jpg" },
      { selfie_url: "m.jpg" },
      { object_url: "o.jpg" },
      { cutout_url: "c.png" },
    ];
    for (const c of cases) {
      if (needsWebHero(c)) expect(shouldOfferWebCandidates(c)).toBe(true);
    }
  });
});

describe("heroSearchQuery", () => {
  it("意味をそのまま使う(語ではなく意味で探す)", () => {
    expect(heroSearchQuery({ headword: "腳踏車", meaning: "自転車" })).toBe("自転車");
  });

  it("**最初の語義だけに削る**(辞書の書き方を丸ごと投げない)", () => {
    expect(heroSearchQuery({ headword: "紙", meaning: "紙、書類、新聞" })).toBe("紙");
    expect(heroSearchQuery({ headword: "捷運", meaning: "MRT / 地下鉄" })).toBe("MRT");
    expect(heroSearchQuery({ headword: "雨傘", meaning: "傘・雨傘" })).toBe("傘");
  });

  it("括弧とその中身を落とす", () => {
    expect(heroSearchQuery({ headword: "腳踏車", meaning: "自転車（口語）" })).toBe("自転車");
    expect(heroSearchQuery({ headword: "跑", meaning: "走る《動》" })).toBe("走る");
    expect(heroSearchQuery({ headword: "書", meaning: "[名] 本" })).toBe("本");
  });

  it("**括弧の中の区切りで切らない**(片割れが残る)", () => {
    expect(heroSearchQuery({ headword: "腳踏車", meaning: "自転車（自転車、チャリ）" })).toBe(
      "自転車",
    );
  });

  it("穴埋めの記号を落とす", () => {
    expect(heroSearchQuery({ headword: "把", meaning: "〜を…する" })).toBe("を する");
  });

  it("**意味が無ければ見出し語で探す**(空の検索を投げない)", () => {
    expect(heroSearchQuery({ headword: "夜市", meaning: "" })).toBe("夜市");
    expect(heroSearchQuery({ headword: "夜市", meaning: null })).toBe("夜市");
    expect(heroSearchQuery({ headword: "夜市" })).toBe("夜市");
    // 括弧を落としたら何も残らない回も同じ
    expect(heroSearchQuery({ headword: "夜市", meaning: "（口語）" })).toBe("夜市");
  });

  it("どちらも無ければ空(呼ぶ側が投げないで済む)", () => {
    expect(heroSearchQuery({})).toBe("");
    expect(heroSearchQuery({ headword: null, meaning: null })).toBe("");
  });

  it(`長すぎる意味は ${MAX_QUERY_CHARS} 文字で切る`, () => {
    const long = "あ".repeat(120);
    expect(heroSearchQuery({ headword: "x", meaning: long })).toHaveLength(MAX_QUERY_CHARS);
  });

  it("前後の空白を残さない", () => {
    expect(heroSearchQuery({ headword: "書", meaning: "  本  、 書類 " })).toBe("本");
  });
});

/**
 * 探す言葉の作り方が**また散らばらない**ことを見る門。
 *
 * この周の直前まで、画像検索の言葉は3箇所で別々に組み立てられていた
 * (`StickerSheet` / `InputCatchSheet` / `WordCard`)。同じ札なのに
 * 保存のときに見えた絵と、詳細であてがわれる絵が違う理由が読めなくなる。
 * 型でもビルドでも落ちない後戻りなので、**数える以外に止める手が無い。**
 */
describe("探す言葉の作り方が散らばっていない", () => {
  const ROOTS = ["src/components", "src/hooks", "src/lib", "src/routes"];
  /**
   * 見なくてよい場所。
   * - `images.functions.ts` … サーバ側の入口(言葉を作る側ではない)
   * - `ImagePicker.tsx`     … 探す言葉を **呼ぶ側から受け取る** 部品
   * - `*.test.ts(x)`        … 試験は値そのものを書く
   */
  const ALLOWED = /(images\.functions\.ts|ImagePicker\.tsx|\.test\.tsx?)$/;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it("`searchImageCandidates` を呼ぶ所は `heroSearchQuery` を通している", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWED.test(file)) continue;
        let text: string;
        try {
          text = fs.readFileSync(file, "utf8");
        } catch {
          continue;
        }
        if (!text.includes("searchImageCandidates")) continue;
        if (!text.includes("heroSearchQuery")) offenders.push(file);
      }
    }
    // 見つかったら、その file の検索語を `heroSearchQuery` に寄せること。
    expect(offenders).toEqual([]);
  });
});
