import { describe, it, expect } from "vitest";
import {
  pickReading,
  pickReadingOf,
  readReadingPref,
  writeReadingPref,
  type ReadingStore,
} from "./phonetic";
import { EN_PROFILE, ZH_TW_PROFILE } from "./target-profile";

/**
 * 読みの表記の切替の門。
 *
 * ここで一番怖いのは**言語をまたいだ漏れ** — 英語を学んでいる間に選んだ
 * `ipa-uk` が台湾華語の設定として残ると、その言語に存在しない表記を
 * 指したまま画面が動く(読みの欄がずっと空になる)。
 *
 * 2番目に怖いのは**古い選択の消失**。拼音を選んでいた人がこの変更で
 * 注音に戻ったら、その人にとっては不具合。
 */

/** 本物の localStorage と同じ挙動の最小の入れ物。 */
function makeStore(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  const store: ReadingStore & { data: Map<string, string> } = {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
  return store;
}

describe("readReadingPref", () => {
  it("何も憶えていなければ既定", () => {
    const s = makeStore();
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("zhuyin");
    // オーナー決定 2026-08-24「アメリカ英語を既定」。
    expect(readReadingPref(s, EN_PROFILE)).toBe("ipa-us");
  });

  it("憶えた表記を返す", () => {
    const s = makeStore({ "reading-pref-v1": '{"zh-TW":"pinyin","en":"ipa-uk"}' });
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("pinyin");
    expect(readReadingPref(s, EN_PROFILE)).toBe("ipa-uk");
  });

  it("**古い鍵の選択を捨てない**(拼音の人が注音に戻らない)", () => {
    const s = makeStore({ "phonetic-pref-v1": "pinyin" });
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("pinyin");
  });

  it("新しい表があれば古い鍵より優先する", () => {
    const s = makeStore({
      "phonetic-pref-v1": "pinyin",
      "reading-pref-v1": '{"zh-TW":"zhuyin"}',
    });
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("zhuyin");
  });

  it("**古い鍵は英語には効かない**(注音は英語に存在しない)", () => {
    const s = makeStore({ "phonetic-pref-v1": "pinyin" });
    expect(readReadingPref(s, EN_PROFILE)).toBe("ipa-us");
  });

  it("**その言語に無い表記は無視する**(言語をまたいで漏れない)", () => {
    const s = makeStore({ "reading-pref-v1": '{"zh-TW":"ipa-uk","en":"zhuyin"}' });
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("zhuyin");
    expect(readReadingPref(s, EN_PROFILE)).toBe("ipa-us");
  });

  it("壊れた中身で落ちない", () => {
    for (const raw of ["", "null", "[]", "7", "{", '{"zh-TW":null}', '{"zh-TW":3}']) {
      const s = makeStore({ "reading-pref-v1": raw });
      expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("zhuyin");
    }
  });

  it("読めない入れ物でも既定を返す", () => {
    const s: ReadingStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("zhuyin");
  });
});

describe("writeReadingPref", () => {
  it("憶えて、読み返せる", () => {
    const s = makeStore();
    writeReadingPref(s, ZH_TW_PROFILE, "pinyin");
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("pinyin");
  });

  it("**言語ごとに別に憶える**(片方を変えても他方が動かない)", () => {
    const s = makeStore();
    writeReadingPref(s, ZH_TW_PROFILE, "pinyin");
    writeReadingPref(s, EN_PROFILE, "ipa-uk");
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("pinyin");
    expect(readReadingPref(s, EN_PROFILE)).toBe("ipa-uk");
  });

  it("台湾華語の分は古い鍵にも書く(古い版に戻っても残る)", () => {
    const s = makeStore();
    writeReadingPref(s, ZH_TW_PROFILE, "pinyin");
    expect(s.data.get("phonetic-pref-v1")).toBe("pinyin");
  });

  it("**英語の選択を古い鍵に書かない**(台湾華語の設定を壊さない)", () => {
    const s = makeStore({ "phonetic-pref-v1": "pinyin" });
    writeReadingPref(s, EN_PROFILE, "ipa-uk");
    expect(s.data.get("phonetic-pref-v1")).toBe("pinyin");
  });

  it("**その言語に無い表記は憶えない**", () => {
    const s = makeStore();
    writeReadingPref(s, ZH_TW_PROFILE, "ipa-uk");
    expect(readReadingPref(s, ZH_TW_PROFILE)).toBe("zhuyin");
  });

  it("書けない入れ物でも落ちない", () => {
    const s: ReadingStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(() => writeReadingPref(s, ZH_TW_PROFILE, "pinyin")).not.toThrow();
  });
});

describe("pickReadingOf", () => {
  it("選んだ表記を出す", () => {
    expect(pickReadingOf(ZH_TW_PROFILE, "pinyin", { zhuyin: "ㄕㄨ", pinyin: "shū" })).toBe("shū");
    expect(pickReadingOf(ZH_TW_PROFILE, "zhuyin", { zhuyin: "ㄕㄨ", pinyin: "shū" })).toBe("ㄕㄨ");
  });

  it("**片方しか無い語で読みを空にしない**", () => {
    expect(pickReadingOf(ZH_TW_PROFILE, "pinyin", { zhuyin: "ㄕㄨ" })).toBe("ㄕㄨ");
    expect(pickReadingOf(ZH_TW_PROFILE, "zhuyin", { pinyin: "shū" })).toBe("shū");
  });

  it("空白だけは「無い」と同じ", () => {
    expect(pickReadingOf(ZH_TW_PROFILE, "pinyin", { zhuyin: "ㄕㄨ", pinyin: "   " })).toBe("ㄕㄨ");
  });

  it("どれも無ければ空", () => {
    expect(pickReadingOf(ZH_TW_PROFILE, "zhuyin", {})).toBe("");
    expect(pickReadingOf(ZH_TW_PROFILE, "zhuyin", { zhuyin: null, pinyin: undefined })).toBe("");
  });

  it("英語も同じ形で選べる", () => {
    const r = { "ipa-us": "ˈtoʊmeɪtoʊ", "ipa-uk": "təˈmɑːtəʊ" } as const;
    expect(pickReadingOf(EN_PROFILE, "ipa-us", r)).toBe("ˈtoʊmeɪtoʊ");
    expect(pickReadingOf(EN_PROFILE, "ipa-uk", r)).toBe("təˈmɑːtəʊ");
    expect(pickReadingOf(EN_PROFILE, "ipa-uk", { "ipa-us": "ˈtoʊmeɪtoʊ" })).toBe("ˈtoʊmeɪtoʊ");
  });

  it("**別の言語の読みを混ぜない**(英語のカードに注音が出ない)", () => {
    expect(pickReadingOf(EN_PROFILE, "ipa-us", { zhuyin: "ㄕㄨ" })).toBe("");
  });
});

describe("pickReading — 古い口の動きが変わっていない", () => {
  it("拼音のときは拼音、無ければ注音", () => {
    expect(pickReading("pinyin", "ㄕㄨ", "shū")).toBe("shū");
    expect(pickReading("pinyin", "ㄕㄨ", null)).toBe("ㄕㄨ");
  });

  it("注音のときは注音、無ければ拼音", () => {
    expect(pickReading("zhuyin", "ㄕㄨ", "shū")).toBe("ㄕㄨ");
    expect(pickReading("zhuyin", null, "shū")).toBe("shū");
  });

  it("どちらも無ければ空", () => {
    expect(pickReading("zhuyin", null, null)).toBe("");
    expect(pickReading("pinyin", "", "  ")).toBe("");
  });
});
