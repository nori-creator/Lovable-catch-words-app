import { describe, expect, it, beforeEach, vi } from "vitest";
import fs from "node:fs";
import { getTargetLang, setTargetLang } from "./target-lang-pref";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "./target-lang";

/**
 * 守るのは「**設定で選んだ学習言語が、撮る道まで届くこと**」。
 *
 * ここが繋がっていなかったので、英語を選んでも撮る道は台湾華語で
 * 辞書を引き、台湾華語として保存していた（6ファイル20箇所）。
 */

const store = new Map<string, string>();
const events: string[] = [];

beforeEach(() => {
  store.clear();
  events.length = 0;
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", {
    dispatchEvent: (e: Event) => {
      events.push(e.type);
      return true;
    },
  });
});

describe("憶えて読む", () => {
  it("何も憶えていなければ既定", () => {
    expect(getTargetLang()).toBe(DEFAULT_TARGET_LANGUAGE);
  });

  it("**選べる言語は全部、往復する**", () => {
    for (const l of TARGET_LANGUAGES) {
      setTargetLang(l);
      expect(getTargetLang(), l).toBe(l);
    }
  });

  it("知らない値は既定に落とす(未知の言語で辞書を引きに行かない)", () => {
    for (const bad of [null, undefined, "", "  ", "kl-GL", "ja", "zh-CN"]) {
      store.clear();
      setTargetLang(bad);
      expect(getTargetLang(), String(bad)).toBe(DEFAULT_TARGET_LANGUAGE);
    }
  });

  it("**壊れた値が入っていても読める**(前の版・手で書き換えた値)", () => {
    store.set("target-lang-v1", "ko");
    expect(getTargetLang()).toBe(DEFAULT_TARGET_LANGUAGE);
  });
});

describe("知らせ方", () => {
  it("変わったときだけ知らせる", () => {
    setTargetLang("en");
    expect(events.length).toBe(1);
    // プロフィールは画面を開くたびに届く。毎回知らせると聞いている画面が
    // 毎回描き直される。
    setTargetLang("en");
    expect(events.length).toBe(1);
    setTargetLang(DEFAULT_TARGET_LANGUAGE);
    expect(events.length).toBe(2);
  });

  it("**知らない値を既定に正した結果も、同じなら知らせない**", () => {
    setTargetLang(DEFAULT_TARGET_LANGUAGE);
    events.length = 0;
    setTargetLang("kl-GL"); // 既定に落ちる = いまと同じ
    expect(events.length).toBe(0);
  });
});

describe("表示言語とは別の箱", () => {
  it("**鍵が `ui-lang-v1` と違う**(混ぜると英語を学ぶ台湾の人が壊れる)", () => {
    setTargetLang("en");
    expect(store.has("ui-lang-v1")).toBe(false);
    expect(store.get("target-lang-v1")).toBe("en");
  });
});

describe("storage が使えなくても落ちない", () => {
  it("読めなくても既定を返す(プライベートモードなど)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(getTargetLang()).toBe(DEFAULT_TARGET_LANGUAGE);
    expect(() => setTargetLang("en")).not.toThrow();
  });
});

describe("撮る道に決め打ちが残っていない", () => {
  /**
   * ここが本題。**設定で英語を選んでも、撮る道は台湾華語のまま**だった。
   * 6ファイル20箇所が `DEFAULT_TARGET_LANGUAGE` を直に使っていて、
   *
   *   ・母語で書いた語から候補を出すとき  → 台湾華語の候補が出る
   *   ・カードを作るとき                  → 台湾華語のカードになる
   *   ・持っているかを見るとき            → 英語の語が毎回「新しい」になる
   *   ・保存するとき                      → 台湾華語として保存される
   *
   * 型でもビルドでも落ちない。**設定を変えた人にだけ起きる。**
   */
  const CAPTURE_PATH = [
    "src/components/InputCatchSheet.tsx",
    "src/components/ScanCatchSheet.tsx",
    "src/routes/_authenticated/scan.tsx",
    "src/routes/_authenticated/capture.tsx",
  ];

  it("**撮る道のどのファイルも `DEFAULT_TARGET_LANGUAGE` を直に使っていない**", () => {
    const offenders: string[] = [];
    for (const f of CAPTURE_PATH) {
      const text = fs.readFileSync(f, "utf8");
      if (text.includes("DEFAULT_TARGET_LANGUAGE")) offenders.push(f);
    }
    // 見つかったら `useTargetLang()` を使うこと。
    expect(offenders).toEqual([]);
  });

  it("**撮る道は全部 `useTargetLang()` を通っている**(1つでも漏れると食い違う)", () => {
    for (const f of CAPTURE_PATH) {
      const text = fs.readFileSync(f, "utf8");
      expect(text.includes("useTargetLang"), f).toBe(true);
    }
  });

  /**
   * 保存済みの語は**その語の `language`** を見る。いま設定している
   * 学習言語ではない — 台湾華語の語と英語の語を両方持っている人が居る。
   */
  it("**保存済みの語を扱う所は、その語の言語を見る**", () => {
    const text = fs.readFileSync("src/components/StickerSheet.tsx", "utf8");
    expect(text.includes("DEFAULT_TARGET_LANGUAGE")).toBe(false);
    expect(text.includes("s.word.language")).toBe(true);
    // 設定の値を混ぜていないこと（混ぜると、英語に切り替えた人が
    // 台湾華語の語を開いたとき、英語として作り直してしまう）。
    expect(text.includes("useTargetLang")).toBe(false);
  });

  it("**設定は選んだ瞬間と保存の両方で端末に写す**", () => {
    const text = fs.readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
    // 3箇所: 選んだとき / 保存したとき / プロフィールが届いたとき。
    expect(text.split("setTargetLang(").length - 1).toBeGreaterThanOrEqual(3);
  });
});
