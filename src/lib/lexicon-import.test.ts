import { describe, it, expect } from "vitest";
import {
  DEFAULT_POLICY,
  arpabetToIpa,
  buildCefrjIndex,
  cefrLabelToStep,
  cefrStep,
  cleanGloss,
  csvRecords,
  freqRank,
  isImportableHeadword,
  isValidRow,
  normalizeIpa,
  parseCmudictLine,
  parseExamTags,
  parseExchange,
  posOf,
  rowToEntry,
  shouldImport,
  stressOf,
  stripStress,
  syllabify,
  toLexiconRow,
  unescapeEcdict,
  type EcdictRaw,
} from "./lexicon-import";
import { CHINESE_EXPLANATION_LANGUAGE } from "./target-lang";

/**
 * 英語の種辞書を作る所の門。
 *
 * ここで一番怖いのは**静かに間違ったデータが3〜4万行入ること**。
 * 1回流すだけの処理なので、おかしな級や壊れた発音が付いた語を後から
 * 見つけるのは事実上むり。だから判断を全部この純粋な所に置いて、
 * **本物のデータから採った例**で押さえる。
 */

/** ECDICT の本物の行（`ecdict.csv` から採った）。 */
const HEADER =
  "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio".split(
    ",",
  );

function raw(over: Partial<EcdictRaw> & { word: string }): EcdictRaw {
  return {
    phonetic: "",
    definition: "",
    translation: "",
    pos: "",
    collins: "",
    oxford: "",
    tag: "",
    bnc: "0",
    frq: "0",
    exchange: "",
    ...over,
  } as EcdictRaw;
}

const BICYCLE = raw({
  word: "bicycle",
  phonetic: "'baisikl",
  definition: "n. a wheeled vehicle that has two wheels and is moved by foot pedals",
  translation: "n. 自行车",
  collins: "2",
  oxford: "1",
  tag: "zk gk cet4 ky ielts",
  bnc: "5312",
  frq: "4366",
  exchange: "s:bicycles/p:bicycled/i:bicycling/d:bicycled/3:bicycles",
});

describe("csvRecords — 引用符の中の改行で件が割れない", () => {
  it("素直な表", () => {
    expect([...csvRecords("a,b\n1,2\n")]).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("**引用符の中の改行を件の切れ目にしない**(ECDICT の語釈がこの形)", () => {
    const got = [...csvRecords('w,t\nrun,"n. 跑\nvi. 奔跑"\n')];
    expect(got).toHaveLength(2);
    expect(got[1]).toEqual(["run", "n. 跑\nvi. 奔跑"]);
  });

  it("引用符の中のカンマで列が増えない", () => {
    expect([...csvRecords('w,t\ninformation,"n. 消息, 知识"\n')][1]).toEqual([
      "information",
      "n. 消息, 知识",
    ]);
  });

  it('`""` は引用符そのもの', () => {
    expect([...csvRecords('a\n"say ""hi"""\n')][1]).toEqual(['say "hi"']);
  });

  it("最後の行に改行が無くても落とさない", () => {
    expect([...csvRecords("a,b\n1,2")]).toHaveLength(2);
  });

  it("空の列を保つ(列がずれない)", () => {
    expect([...csvRecords("a,b,c\n1,,3\n")][1]).toEqual(["1", "", "3"]);
  });

  it("見出しと突き合わせて名前で引ける", () => {
    const e = rowToEntry(HEADER, [
      "bicycle",
      "'baisikl",
      "",
      "n. 自行车",
      "",
      "2",
      "1",
      "zk",
      "0",
      "0",
      "",
      "",
      "",
    ]);
    expect(e.word).toBe("bicycle");
    expect(e.oxford).toBe("1");
    expect(e.frq).toBe("0");
  });
});

describe("ECDICT の癖", () => {
  it("**文字どおりの `\\n` を改行に直す**(そのまま出すと画面に \\n と出る)", () => {
    expect(unescapeEcdict("n. 水\\nvt. 澆水")).toBe("n. 水\nvt. 澆水");
  });

  it("**当てにならない `[网络]` の行を落とす**", () => {
    const got = cleanGloss("n. 罩\\n[网络] 胡德；兜帽；引擎盖");
    expect(got).toEqual(["n. 罩"]);
  });

  it("分野の印(`[计]`)は残す(分かるほうが役に立つ)", () => {
    expect(cleanGloss("n. 消息\\n[计] 信息")).toEqual(["n. 消息", "[计] 信息"]);
  });

  it("**全部が当てにならない語は空を返す**(無理に1行残さない)", () => {
    expect(cleanGloss("[网络] 胡德")).toEqual([]);
  });

  it("空白だけの行は落とす", () => {
    expect(cleanGloss("n. 水\\n   \\nvt. 澆水")).toEqual(["n. 水", "vt. 澆水"]);
  });
});

describe("normalizeIpa — 見た目が同じで別の文字を直す", () => {
  it("**キリル文字のシュワー(U+04D9)を IPA の ə(U+0259) に**", () => {
    const got = normalizeIpa("tә'mɑ:tәu");
    expect(got).not.toContain("ә");
    expect(got).toContain("ə");
  });

  it("長音のコロンを ː に", () => {
    expect(normalizeIpa("'wɒ:tә")).toContain("ː");
    expect(normalizeIpa("'wɒ:tә")).not.toContain(":");
  });

  it("強勢の `'` を ˈ に", () => {
    expect(normalizeIpa("'baisikl")).toBe("ˈbaisikl");
  });

  it("先頭の `.` は副次の強勢", () => {
    expect(normalizeIpa(".infә'meiʃәn")).toBe("ˌinfəˈmeiʃən");
  });

  it("空は空(空文字を画面に渡さない)", () => {
    expect(normalizeIpa("")).toBe("");
    expect(normalizeIpa("   ")).toBe("");
  });
});

describe("parseExchange — 活用", () => {
  it("bicycle の本物の行を解く", () => {
    expect(parseExchange(BICYCLE.exchange)).toEqual({
      plural: "bicycles",
      past: "bicycled",
      ing: "bicycling",
      pastParticiple: "bicycled",
      third: "bicycles",
    });
  });

  it("不規則な動詞も解ける", () => {
    // run の本物の行。`1:d` は「この語は原形の過去分詞」という**種類の記号**。
    const got = parseExchange("p:ran/i:running/d:run/0:run/1:d/3:runs/s:runs");
    expect(got.past).toBe("ran");
    expect(got.ing).toBe("running");
    expect(got.lemma).toBe("run");
  });

  it("**`1:` を活用として取り込まない**(画面の欄に `d` の1文字が出る)", () => {
    const got = parseExchange("0:run/1:d");
    expect(Object.values(got)).not.toContain("d");
    expect(got.lemma).toBe("run");
  });

  it("比較級・最上級", () => {
    expect(parseExchange("r:bigger/t:biggest")).toEqual({
      comparative: "bigger",
      superlative: "biggest",
    });
  });

  it("空・壊れた形で落ちない", () => {
    expect(parseExchange("")).toEqual({});
    expect(parseExchange("s")).toEqual({});
    expect(parseExchange("s:")).toEqual({});
    expect(parseExchange(":x")).toEqual({});
  });
});

describe("parseExamTags", () => {
  it("bicycle の印を並び順を固定して読む", () => {
    expect(parseExamTags(BICYCLE.tag)).toEqual(["zk", "gk", "cet4", "ky", "ielts"]);
  });

  it("**並びが揺れない**(入れ直すたびに差分が出ないように)", () => {
    expect(parseExamTags("ielts zk")).toEqual(parseExamTags("zk ielts"));
  });

  it("知らない印は落とす", () => {
    expect(parseExamTags("zk nonsense")).toEqual(["zk"]);
    expect(parseExamTags("")).toEqual([]);
  });
});

describe("cefrStep — 級の見積もり", () => {
  it("**とてもよく使う語は A1**", () => {
    expect(cefrStep({ frq: "202", tag: "zk gk" })).toBe(1); // run
  });

  it("bicycle は zk が付いているので A2 まで", () => {
    // 順位だけなら B1 だが、中考の語だと分かっている。
    expect(cefrStep(BICYCLE)).toBe(2);
  });

  it("**GRE の語を入門に置かない**", () => {
    expect(cefrStep({ frq: "30000", tag: "gre" })).toBeGreaterThanOrEqual(5);
    // 順位が上でも GRE なら C1 から。
    expect(cefrStep({ frq: "3000", tag: "gre" })).toBeGreaterThanOrEqual(5);
  });

  it("**順位が無い語を最易にしない**(見えていないだけの語が初心者に出る)", () => {
    expect(cefrStep({ frq: "0", bnc: "0" })).toBeGreaterThan(3);
  });

  it("Oxford3000 は B2 まで(定義上そこまでの語)", () => {
    expect(cefrStep({ frq: "0", bnc: "0", oxford: "1" })).toBeLessThanOrEqual(4);
  });

  it("**必ず1〜6に収まる**(段の外を画面に渡さない)", () => {
    const cases = [
      { frq: "1" },
      { frq: "999999" },
      { frq: "0", tag: "gre zk" }, // 上限と下限がぶつかる形
      { frq: "-5" },
      { frq: "abc" },
      {},
    ];
    for (const c of cases) {
      const s = cefrStep(c);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(6);
      expect(Number.isInteger(s)).toBe(true);
    }
  });

  it("順位が上がるほど段が下がらない(単調)", () => {
    const steps = [500, 1500, 3000, 6000, 12000, 30000].map((frq) =>
      cefrStep({ frq: String(frq) }),
    );
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
  });
});

describe("freqRank", () => {
  it("COCA を先に見て、無ければ BNC", () => {
    expect(freqRank({ frq: "4366", bnc: "5312" })).toBe(4366);
    expect(freqRank({ frq: "0", bnc: "5312" })).toBe(5312);
  });

  it("**`0` は順位ではない**(1位として扱うと最易に落ちる)", () => {
    expect(freqRank({ frq: "0", bnc: "0" })).toBeNull();
    expect(freqRank({ frq: "", bnc: "" })).toBeNull();
  });
});

describe("isImportableHeadword — 図鑑に接辞を並べない", () => {
  it("ふつうの語と2語の言い回しは通す", () => {
    expect(isImportableHeadword("bicycle")).toBe(true);
    expect(isImportableHeadword("night market")).toBe(true);
    expect(isImportableHeadword("well-known")).toBe(true);
  });

  it("**接辞・アポストロフィ始まりは通さない**(本物のデータに混ざっている)", () => {
    expect(isImportableHeadword("-ability")).toBe(false);
    expect(isImportableHeadword("'hood")).toBe(false);
    expect(isImportableHeadword("'s Gravenhage")).toBe(false);
  });

  it("3語以上の言い回しは通さない", () => {
    expect(isImportableHeadword("as a matter of fact")).toBe(false);
  });

  it("数字混じり・空・記号だけは通さない", () => {
    for (const w of ["", "   ", "COVID19", "3D", "!!!"]) {
      expect([w, isImportableHeadword(w)]).toEqual([w, false]);
    }
  });
});

describe("shouldImport — 検定・頻出だけ", () => {
  it("検定の印がある語は入れる", () => {
    expect(shouldImport(BICYCLE)).toBe(true);
  });

  it("頻度が上位なら印が無くても入れる", () => {
    expect(shouldImport(raw({ word: "chair", translation: "n. 椅子", frq: "3000" }))).toBe(true);
  });

  it("**頻度も印も無い語は入れない**(3〜4万に収める)", () => {
    expect(shouldImport(raw({ word: "zygodactyl", translation: "a. 對趾的", frq: "0" }))).toBe(
      false,
    );
  });

  it("境目のちょうど上は入れて、1つ外は入れない", () => {
    const at = raw({ word: "aaa", translation: "n. x", frq: String(DEFAULT_POLICY.freqTop) });
    const over = raw({ word: "bbb", translation: "n. x", frq: String(DEFAULT_POLICY.freqTop + 1) });
    expect(shouldImport(at)).toBe(true);
    expect(shouldImport(over)).toBe(false);
  });

  it("**語釈が1行も残らない語は入れない**(空の欄のカードを作らない)", () => {
    expect(shouldImport(raw({ word: "hood", translation: "[网络] 胡德", tag: "zk" }))).toBe(false);
  });

  it("見出しに使えない形は、印があっても入れない", () => {
    expect(shouldImport(raw({ word: "-ability", translation: "suf. 表示", tag: "gre" }))).toBe(
      false,
    );
  });
});

describe("CMUdict — アメリカ英語の発音", () => {
  it("強勢の数字を外す・強さを読む", () => {
    expect(stripStress("AH0")).toBe("AH");
    expect(stressOf("AH0")).toBe(0);
    expect(stressOf("EY1")).toBe(1);
    expect(stressOf("OW2")).toBe(2);
    expect(stressOf("T")).toBeNull();
  });

  it("**無強勢の AH は ə**(シュワーを落とすと英語らしさが消える)", () => {
    // about = AH0 B AW1 T
    expect(arpabetToIpa(["AH0", "B", "AW1", "T"])).toBe("əˈbaʊt");
  });

  it("無強勢の ER は ɚ", () => {
    // teacher = T IY1 CH ER0
    expect(arpabetToIpa(["T", "IY1", "CH", "ER0"])).toBe("ˈtitʃɚ");
  });

  it("**1音節の語に強勢の印を付けない**(`cat` を `ˈkæt` とは書かない)", () => {
    expect(arpabetToIpa(["K", "AE1", "T"])).toBe("kæt");
  });

  it("tomato の強勢が正しい位置に付く", () => {
    // T AH0 M EY1 T OW2
    expect(arpabetToIpa(["T", "AH0", "M", "EY1", "T", "OW2"])).toBe("təˈmeɪˌtoʊ");
  });

  it("bicycle", () => {
    // B AY1 S IH0 K AH0 L
    expect(arpabetToIpa(["B", "AY1", "S", "IH0", "K", "AH0", "L"])).toBe("ˈbaɪsɪkəl");
  });

  it("**頭に立てられない並びを頭に寄せない**(`extra` が `ɛ.kstɹə` にならない)", () => {
    // extra = EH1 K S T R AH0。`kstr` は英語の頭に立てられないので、
    // 立てられる `str` だけを後ろの音節に渡し、`k` は前に残る。
    // 辞書の切り方(ek-strə)と一致する。
    const syl = syllabify(["EH1", "K", "S", "T", "R", "AH0"]);
    expect(syl).toEqual([
      ["EH1", "K"],
      ["S", "T", "R", "AH0"],
    ]);
    expect(arpabetToIpa(["EH1", "K", "S", "T", "R", "AH0"])).toBe("ˈɛkstɹə");
  });

  it("立てられる並びは頭に寄せる", () => {
    // secret = S IY1 K R AH0 T
    expect(syllabify(["S", "IY1", "K", "R", "AH0", "T"])).toEqual([
      ["S", "IY1"],
      ["K", "R", "AH0", "T"],
    ]);
  });

  it("母音が無い並びで落ちない", () => {
    expect(syllabify([])).toEqual([]);
    expect(arpabetToIpa(["S"])).toBe("s");
  });

  it("知らない音素は落とす(壊れた記号を画面に出さない)", () => {
    expect(arpabetToIpa(["K", "AE1", "XX", "T"])).toBe("kæt");
  });

  it("行を読む", () => {
    expect(parseCmudictLine("bicycle B AY1 S IH0 K AH0 L")).toEqual({
      word: "bicycle",
      ipa: "ˈbaɪsɪkəl",
    });
  });

  it("**2つ目以降の読みは取らない**(どちらを覚えるか分からなくなる)", () => {
    expect(parseCmudictLine("tomato(2) T AH0 M AA1 T OW2")).toBeNull();
  });

  it("説明の行・空行・壊れた行で落ちない", () => {
    for (const l of [";;; comment", "", "   ", "onlyword"]) {
      expect(parseCmudictLine(l)).toBeNull();
    }
  });

  it("行末のコメントを読みに混ぜない", () => {
    expect(parseCmudictLine("read R EH1 D # past tense")?.ipa).toBe("ɹɛd");
  });
});

describe("posOf — 品詞", () => {
  it("語釈の先頭から取る(ECDICT の `pos` 欄は割合で空が多い)", () => {
    expect(posOf(BICYCLE)).toBe("n.");
  });

  it("中文が無ければ英英から取る", () => {
    expect(posOf(raw({ word: "x", definition: "v. to move quickly" }))).toBe("v.");
  });

  it("どこにも無ければ null(でっち上げない)", () => {
    expect(posOf(raw({ word: "x", translation: "自行车" }))).toBeNull();
  });
});

describe("toLexiconRow — 入れる1行", () => {
  const zhTw = (s: string) => s.replace(/车/g, "車").replace(/习/g, "習");

  it("bicycle の本物の行から作る", () => {
    const row = toLexiconRow(BICYCLE, { ipaUs: "ˈbaɪsɪkəl", glossTranslate: zhTw });
    expect(row.headword).toBe("bicycle");
    expect(row.language).toBe("en");
    expect(row.reading_primary).toBe("ˈbaɪsɪkəl");
    expect(row.reading_alt).toBe("ˈbaisikl");
    expect(row.level_step).toBe(2);
    expect(row.freq_rank).toBe(4366);
    expect(row.exam_tags).toEqual(["zk", "gk", "cet4", "ky", "ielts"]);
    expect(row.forms?.plural).toBe("bicycles");
    expect(row.entry_type).toBe("word");
    expect(row.source).toBe("dict");
  });

  it("**簡体字を台湾正体字に直してから入れる**(台湾の学習者に簡体字を出さない)", () => {
    const row = toLexiconRow(BICYCLE, { ipaUs: null, glossTranslate: zhTw });
    expect(row.meanings[CHINESE_EXPLANATION_LANGUAGE]).toBe("n. 自行車");
    expect(row.meanings[CHINESE_EXPLANATION_LANGUAGE]).not.toContain("车");
  });

  it("英英の語釈も持つ(上の級には英英のほうが効く)", () => {
    const row = toLexiconRow(BICYCLE, { ipaUs: null, glossTranslate: zhTw });
    expect(row.meanings["en"]).toContain("wheeled vehicle");
  });

  it("**読みが無ければ null**(空文字を入れると「読みが在る」ことになる)", () => {
    const row = toLexiconRow(raw({ word: "x", translation: "n. 東西" }), {
      ipaUs: "  ",
      glossTranslate: zhTw,
    });
    expect(row.reading_primary).toBeNull();
    expect(row.reading_alt).toBeNull();
  });

  it("2語の言い回しは phrase", () => {
    const row = toLexiconRow(raw({ word: "night market", translation: "n. 夜市" }), {
      ipaUs: null,
      glossTranslate: zhTw,
    });
    expect(row.entry_type).toBe("phrase");
  });

  it("**出所を書く**(級は見積もりなので後から直せるようにしておく)", () => {
    const row = toLexiconRow(BICYCLE, { ipaUs: null, glossTranslate: zhTw });
    expect(row.notes).toContain("ECDICT");
    expect(row.notes).toContain("見積もり");
  });

  it("活用が無ければ null(空の入れ物を入れない)", () => {
    const row = toLexiconRow(raw({ word: "x", translation: "n. 東西" }), {
      ipaUs: null,
      glossTranslate: zhTw,
    });
    expect(row.forms).toBeNull();
  });
});

describe("isValidRow — 入れる前の最後の関門", () => {
  const zhTw = (s: string) => s;

  it("ちゃんとした行は通る", () => {
    expect(isValidRow(toLexiconRow(BICYCLE, { ipaUs: null, glossTranslate: zhTw }))).toBe(true);
  });

  it("**意味が1つも無い行は通さない**", () => {
    const row = toLexiconRow(raw({ word: "x" }), { ipaUs: null, glossTranslate: zhTw });
    expect(isValidRow(row)).toBe(false);
  });

  it("**段が6つの外の行は通さない**", () => {
    const row = toLexiconRow(BICYCLE, { ipaUs: null, glossTranslate: zhTw });
    expect(isValidRow({ ...row, level_step: 0 })).toBe(false);
    expect(isValidRow({ ...row, level_step: 7 })).toBe(false);
  });

  it("見出しが空の行は通さない", () => {
    const row = toLexiconRow(BICYCLE, { ipaUs: null, glossTranslate: zhTw });
    expect(isValidRow({ ...row, headword: "" })).toBe(false);
  });
});

describe("CEFR-J — 公式の級", () => {
  it("綴りを段に読む", () => {
    expect(cefrLabelToStep("A1")).toBe(1);
    expect(cefrLabelToStep("B2")).toBe(4);
    expect(cefrLabelToStep("c1")).toBe(5);
  });

  it("知らない綴りは null(でっち上げない)", () => {
    for (const s of ["", "  ", "A3", "D1", "B", "1", "A1+"]) {
      expect([s, cefrLabelToStep(s)]).toEqual([s, null]);
    }
  });

  it("**同じ語に級が2つあるときはやさしいほうを採る**", () => {
    // 本物の例: above は前置詞 A1 / 副詞 B1（この形が 578 語ある）。
    // 難しいほうを採ると、その語が学習者の範囲から外れて出てこなくなる。
    const idx = buildCefrjIndex([
      { headword: "above", pos: "adverb", cefr: "B1" },
      { headword: "above", pos: "preposition", cefr: "A1" },
    ]);
    expect(idx.get("above")).toBe(1);
  });

  it("**見出しは小文字に揃える**(揃えないと ECDICT 側とほとんど当たらない)", () => {
    const idx = buildCefrjIndex([{ headword: "A.M.", pos: "adverb", cefr: "A1" }]);
    expect(idx.get("a.m.")).toBe(1);
  });

  it("読めない行は飛ばす(表が壊れない)", () => {
    const idx = buildCefrjIndex([
      { headword: "", pos: "noun", cefr: "A1" },
      { headword: "x", pos: "noun", cefr: "" },
      { headword: "ok", pos: "noun", cefr: "A2" },
    ]);
    expect(idx.size).toBe(1);
    expect(idx.get("ok")).toBe(2);
  });
});

describe("公式の級が見積もりに勝つ", () => {
  it("**CEFR-J に載っていれば見積もりを使わない**", () => {
    // 見積もりだけなら A1（とてもよく使う語）。
    expect(cefrStep({ frq: "202" })).toBe(1);
    // 公式が B1 と言うならそちら。
    expect(cefrStep({ frq: "202" }, 3)).toBe(3);
  });

  it("公式が無ければ見積もり(C1/C2 は CEFR-J の対象外)", () => {
    expect(cefrStep({ frq: "30000", tag: "gre" }, null)).toBeGreaterThanOrEqual(5);
  });

  it("**壊れた公式の値は信じない**(段の外を通さない)", () => {
    expect(cefrStep({ frq: "202" }, 0 as never)).toBe(1);
    expect(cefrStep({ frq: "202" }, 9 as never)).toBe(1);
  });

  it("**出所を語ごとに書き分ける**(どれが見積もりか分からないと直せない)", () => {
    const zh = (s: string) => s;
    const official = toLexiconRow(BICYCLE, { glossTranslate: zh, officialLevel: 2 });
    const guessed = toLexiconRow(BICYCLE, { glossTranslate: zh });
    expect(official.notes).toContain("CEFR-J");
    expect(guessed.notes).toContain("見積もり");
    expect(guessed.notes).not.toContain("CEFR-J");
  });
});

describe("公式の級が付いた語は必ず入れる", () => {
  /**
   * 最初の版は頻度と検定タグだけで切っていて、CEFR-J が A2 と言っている
   * `alarm clock` が落ちていた（数えたら 435 語）。どれも街で撮る物。
   * 一方で GRE の難語は 7,504 語まるごと通っていた。**逆さまだった。**
   */
  const everyday = raw({ word: "alarm clock", translation: "n. 鬧鐘", frq: "0", bnc: "0" });

  it("公式の級が無ければ落ちる(これが元の動き)", () => {
    expect(shouldImport(everyday)).toBe(false);
  });

  it("**公式の級があれば入れる**", () => {
    expect(shouldImport(everyday, DEFAULT_POLICY, 2)).toBe(true);
  });

  it("公式の級があっても、見出しに使えない形は入れない", () => {
    expect(shouldImport(raw({ word: "-ness", translation: "suf. 表示" }), DEFAULT_POLICY, 1)).toBe(
      false,
    );
  });

  it("公式の級があっても、語釈が空なら入れない", () => {
    expect(shouldImport(raw({ word: "hood", translation: "[网络] 胡德" }), DEFAULT_POLICY, 1)).toBe(
      false,
    );
  });
});
