import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { targetProfile } from "./target-profile";
import { sectionTitleKey } from "./card-sections";
import { TARGET_LANGUAGES } from "./target-lang";
import { DICT, UI_LANGS } from "./i18n";

/**
 * **学習言語・表示言語が「途中で捨てられていないか」を数える門。**
 *
 * この作業場で何度も起きているのは、同じ判断が2箇所に書かれて片方だけ
 * 直る事故。言語の設定はその最悪の例で、オーナー報告の
 * 「表示言語=台湾華語 / 学習言語=英語 にしても台湾華語の単語しか出ない」
 * は、**4つの別々の場所**が原因だった:
 *
 *  A. `setTargetLang` を呼ぶのが設定画面だけで、設定を開かない人には
 *     学習言語が届かない
 *  B. 撮った札の級・品詞が `"TOCFL-2"` / `"名詞"` の決め打ち
 *  C. 表示言語が3つあるのに `en ? "英語" : "日本語"` の2分岐
 *  D. AI に渡す JSON の見本が `"headword":"繁体字"` のまま
 *
 * どれも型では捕まらない(全部ただの文字列)。だから**本文を読んで数える**。
 * 絵の検査は10分以上かかるので、ここは秒で落ちる側に置く。
 */

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/**
 * 注釈を落とした本文。**「昔こう書いていた」と説明する注釈で門が落ちる**
 * のは偽の警報で、偽の警報を出す門は必ず無視されるようになる。
 * 見るのは実際に走る行だけ。
 */
const codeOnly = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");

describe("A. 学習言語がアプリ全体に届く", () => {
  it("AppShell が言語の設定を端末に写す", () => {
    // **全画面の親でやる**のが要点。設定画面だけの責任にすると、
    // 設定を一度も開かない人には学習言語がいつまでも届かない。
    //
    // 見るのは**呼び出し**であって import ではない。最初はここを
    // `toContain("useLanguagePrefsSync")` で書いていて、本体を潰しても
    // import の行に当たって**門が黙って通った**(この作業場で3度目の同じ事故)。
    const shell = codeOnly(read("components/AppShell.tsx"));
    const body = shell.replace(/^import .*$/gm, "");
    expect(body).toMatch(/useLanguagePrefsSync\(\s*\)/);
  });

  it("写す側は学習言語と表示言語の**両方**を書く", () => {
    const sync = read("lib/use-language-prefs.ts");
    expect(sync).toContain("setTargetLang");
    expect(sync).toContain("setUiLang");
    expect(sync).toContain("target_language");
    expect(sync).toContain("ui_language");
  });
});

describe("B. 撮った札の級・品詞を決め打たない", () => {
  const captureSheets = ["components/InputCatchSheet.tsx", "components/ScanCatchSheet.tsx"];

  it.each(captureSheets)("%s に台湾華語の級が直接書かれていない", (file) => {
    // 注釈の中で「昔こう書いていた」と説明するのは許す。
    const code = codeOnly(read(file));
    expect(code).not.toContain("TOCFL-");
    expect(code).not.toContain('"名詞"');
    expect(code).not.toContain('"フレーズ"');
  });

  it.each(captureSheets)("%s は学習言語の目盛りから級を作る", (file) => {
    const src = read(file);
    expect(src).toContain("targetProfile(targetLanguage)");
    expect(src).toContain("levels.toStored(");
  });

  it("目標の級が空のときの既定も学習言語から作る", () => {
    const src = read("lib/ai-provider.server.ts");
    expect(src).toContain("defaultLevelGoal");
    // 決め打ちの "TOCFL-2" が**返り値として**残っていないこと。
    expect(src).not.toMatch(/return\s+"TOCFL-2"/);
  });

  it("2つの言語で違う級が出る(同じ物を返していない)", () => {
    const zh = targetProfile("zh-TW").levels.toStored(2);
    const en = targetProfile("en").levels.toStored(2);
    expect(zh).toBe("TOCFL-2");
    expect(en).toBe("A2");
    expect(zh).not.toBe(en);
  });
});

describe("C. 表示言語を2つに潰さない", () => {
  it("ai.functions.ts に `en ? … : 日本語` の2分岐が無い", () => {
    // これが在ると繁體中文が「日本語」に落ちる。
    expect(codeOnly(read("lib/ai.functions.ts"))).not.toMatch(/explainLang\s*===\s*"en"\s*\?/);
  });

  it("解説の言語名は必ず `explanationLanguageName` から取る", () => {
    const src = read("lib/ai.functions.ts");
    const nlAssignments = codeOnly(src).match(/const NL = .*/g) ?? [];
    expect(nlAssignments.length).toBeGreaterThan(0);
    for (const line of nlAssignments) {
      expect(line).toContain("explanationLanguageName(");
    }
  });
});

describe("D. AI に渡す見本を学習言語から作る", () => {
  it("写真の候補の JSON 見本に「繁体字」が直接書かれていない", () => {
    // **見本は指示より強い。** 本文で「英語の語を出せ」と書いても、
    // 最後の見本が `"headword":"繁体字"` なら AI はそちらに従う。
    const src = read("lib/ai.functions.ts");
    expect(codeOnly(src)).not.toContain('"headword":"繁体字"');
    expect(src).toContain("capture.jsonHeadwordHint");
    expect(src).toContain("capture.jsonReadingHint");
  });

  it("見本は言語ごとに実際に違う", () => {
    const zh = targetProfile("zh-TW").capture;
    const en = targetProfile("en").capture;
    expect(zh.jsonHeadwordHint).not.toBe(en.jsonHeadwordHint);
    expect(zh.jsonReadingHint).not.toBe(en.jsonReadingHint);
    expect(zh.namingExamples).not.toBe(en.namingExamples);
    expect(zh.defaultPos).not.toBe(en.defaultPos);
    // 英語の読みの欄は**空**でなければならない — 注音を埋めさせない。
    expect(en.jsonReadingHint).toContain('"reading_zhuyin":""');
    expect(en.jsonReadingHint).toContain('"pinyin":""');
  });

  it("どの学習言語にも見本が揃っている(足し忘れで空文字にならない)", () => {
    for (const lang of TARGET_LANGUAGES) {
      const c = targetProfile(lang).capture;
      expect(c.jsonHeadwordHint.trim(), lang).not.toBe("");
      expect(c.jsonReadingHint.trim(), lang).not.toBe("");
      expect(c.namingExamples.trim(), lang).not.toBe("");
      expect(c.defaultPos.trim(), lang).not.toBe("");
      expect(c.phrasePos.trim(), lang).not.toBe("");
    }
  });

  it("台湾華語の例が英語の欄に紛れていない", () => {
    // 表を足すときに片方をコピーして直し忘れる事故を潰す。
    // 指示の**地の文**は解説用の日本語なので漢字が在ってよい。見るのは
    // 「（…）」の中に並べた**語の例**だけ — そこに漢字が出たら、
    // 英語の欄に台湾華語の例が残っている。
    const en = targetProfile("en").capture;
    const examples = [...en.namingExamples.matchAll(/（([^）]*)）/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) expect(ex, ex).not.toMatch(/[\u4e00-\u9fff]/);
    expect(en.jsonHeadwordHint).not.toMatch(/[\u4e00-\u9fff]/);
    // 逆向きも見る — 台湾華語の欄に英語だけの例に差し替わっていないこと。
    const zhExamples = [
      ...targetProfile("zh-TW").capture.namingExamples.matchAll(/（([^）]*)）/g),
    ].map((m) => m[1]);
    expect(zhExamples.length).toBeGreaterThan(0);
    for (const ex of zhExamples) expect(ex, ex).toMatch(/[\u4e00-\u9fff]/);
  });
});

describe("復習の「終わり」を数から決める", () => {
  it("サーバは残り枚数を返す", () => {
    const src = read("lib/reviews.functions.ts");
    expect(src).toContain("dueRemaining");
    expect(src).toContain("batchEndKind");
  });

  it("画面は自分で判断せず `batchEndKind` を読む", () => {
    const src = read("routes/_authenticated/review.tsx");
    expect(src).toContain("batchEndKind(");
    // 「今日は終わり」の文面を**無条件では出さない**。
    expect(src).toContain('kind === "more"');
    expect(src).toContain("review.moreTitle");
  });
});

describe("第1段: 学習言語で「見えるもの」を分ける", () => {
  it("図鑑・アルバムの一覧が学習言語で絞られる", () => {
    const src = codeOnly(read("lib/stickers.functions.ts"));
    // **`!inner` が要る。** 普通の埋め込みだと条件に合わない札が
    // `words: null` で残り、「絵はあるのに文字が無い札」が並ぶ。
    expect(src).toContain("words!inner(");
    expect(src).toContain("wordLanguageFilter(");
    expect(src).toMatch(/\.or\(langFilter, \{ referencedTable: "words" \}\)/);
  });

  it("一覧は端末ではなくプロフィールの学習言語を正とする", () => {
    // 端末の値で絞ると、別の端末で開いたときに違う物が見える。
    const src = codeOnly(read("lib/stickers.functions.ts"));
    expect(src).toContain("getUserTargetLanguage(userId)");
    expect(src).not.toContain("useTargetLang");
  });

  it("絞れなかったときは空にせず、同じ規則で JS 側が絞る", () => {
    // 空の図鑑を出すのが一番悪い。**混ざるより消えるほうが悪い。**
    const src = codeOnly(read("lib/stickers.functions.ts"));
    expect(src).toContain("filterInDb");
    expect(src).toContain("matchesTargetLanguage(");
  });

  it("復習の列も同じ学習言語で絞る", () => {
    const src = codeOnly(read("lib/reviews.functions.ts"));
    expect(src).toContain("stickers!inner(");
    expect(src).toContain("words!inner(");
    // 2段先に掛けるので prefix は `stickers.words`。
    expect(src).toMatch(/referencedTable: "stickers\.words"/);
  });

  it("「あと何枚」の数も同じ絞りで数える", () => {
    // ここだけ絞らないと「あと190枚あります」と言ったのに
    // 「続ける」で1枚も出てこない。
    const src = codeOnly(read("lib/reviews.functions.ts"));
    expect(src).toContain("countDue(");
    const countDue = src.slice(src.indexOf("async function countDue"));
    expect(countDue.slice(0, 1200)).toMatch(/referencedTable: "stickers\.words"/);
  });

  it("図鑑が空のとき「まだ何もキャッチしていません」と嘘をつかない", () => {
    // 学習言語を変えた人は150枚持っている。集めた物が消えたように
    // 見える画面は、このアプリで一番やってはいけない壊し方。
    const server = codeOnly(read("lib/stickers.functions.ts"));
    expect(server).toContain("otherLanguages");
    const dex = codeOnly(read("routes/_authenticated/dex.tsx"));
    expect(dex).toContain("otherLanguages");
    expect(dex).toContain("dex.emptyOtherLangTitle");
  });
});

describe("第1段: 母語と表示言語を1つにする", () => {
  it("設定から母語の行が消えている", () => {
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).not.toContain('id="lang-native"');
    expect(src).not.toContain("settings.nativeLang");
    // 表示言語の行は残っている(片方だけ消す事故を潰す)。
    expect(src).toContain('id="lang-ui"');
  });

  it("母語の情報を保存で捨てない", () => {
    // 行は消えたが列は残す。持ち回らずに保存すると、その人の母語が
    // 一度の保存で消える。
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).toContain("native_language: readerL1(");
  });

  it("サーバの母語は表示言語から決まる", () => {
    const src = codeOnly(read("lib/ai-provider.server.ts"));
    expect(src).toContain("readerL1(");
    expect(src).toContain("ui_language, native_language, target_language");
    // 母語の列だけを読む古い形が残っていないこと。
    expect(src).not.toMatch(/\.select\("native_language"\)/);
  });

  it("消した翻訳キーが本当に消えている(死んだ文字列を残さない)", () => {
    const dict = read("lib/i18n.tsx");
    expect(dict).not.toContain('"settings.nativeLang"');
    expect(dict).not.toContain('"settings.nativeLangHint"');
  });
});

describe("候補を選んだ直後は「訳と発音」だけ", () => {
  it("`minimal` は節を**伏せる**(空箱にするのではない)", () => {
    // 前はここが `empty={!hasContent(id)}` に効くだけだったので、
    // ネットの画像・実際の使われ方・出会う見込みが
    // 「まだ作られていません」の空箱として**並んだまま**だった
    // (オーナーの絵の3枚目)。伏せるのは `shown` の側でやる。
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toContain("MINIMAL_SECTIONS");
    expect(src).toMatch(/shown\s*=\s*minimal/);
    // 級の段々と品詞の札も出さない。「訳」でも「発音」でもない。
    expect(src).toMatch(/\{!minimal && \(?\s*<?TocflLadder/s);
    expect(src).toContain("<HeaderRow word={word} autoplay={autoplay} minimal={minimal} />");
  });

  it("裏の生成は止めない", () => {
    // 「裏で同時に項目の生成をするだけにして」。`missing` が `minimal` を
    // 見てしまうと、見えない = 作らない になり、保存後に空のカードが残る。
    const src = codeOnly(read("components/WordCard.tsx"));
    const line = src.split("\n").find((l) => l.includes("const missing = missingSections("));
    expect(line).toBeTruthy();
    expect(line).not.toContain("minimal");
  });

  it("撮る道のカードは全部 `minimal` を渡している", () => {
    // `ScanDetailSheet` だけ渡していなかった。1箇所抜けると、
    // その画面だけ昔のままになる(この作業場で繰り返している形)。
    for (const file of ["routes/_authenticated/capture.tsx", "components/ScanDetailSheet.tsx"]) {
      const src = codeOnly(read(file));
      const idx = src.indexOf("<WordCard");
      expect(idx, file).toBeGreaterThan(-1);
      // その要素の閉じまでの間に `minimal` が在ること。
      const tag = src.slice(idx, src.indexOf("/>", idx));
      expect(tag, file).toContain("minimal");
    }
  });

  it("保存した語の詳細では**全部**出す(minimal を撒かない)", () => {
    // 図鑑から開く単語の詳細は本来の全項目。ここまで minimal にすると
    // 「作ったのに一生見られない項目」ができる。
    const src = codeOnly(read("components/StickerSheet.tsx"));
    const idx = src.indexOf("<WordCard");
    const tag = src.slice(idx, src.indexOf("/>", idx));
    expect(tag).not.toContain("minimal");
  });
});

describe("第2段: 消したものが戻ってこない", () => {
  const gone = [
    "components/CorpusLinks.tsx",
    "lib/corpus-links.ts",
    "components/EncounterPanel.tsx",
    "lib/encounter.functions.ts",
    "lib/rarity.ts",
  ];

  it.each(gone)("%s は消えている", (rel) => {
    expect(fs.existsSync(path.join(root, rel)), rel).toBe(false);
  });

  it("カードにコーパスのリンクが1つも無い", () => {
    // オーナー指示「コーパスのリンクを全部削除して」。
    const src = read("components/WordCard.tsx");
    expect(src).not.toContain("CorpusLinks");
  });

  it("「出会う確率」の節が節の一覧から消えている", () => {
    // オーナー指示「出会う確率の項目も削除して。その他の確率や機能は
    // すべて削除して」。**一覧に残っていると裏の生成が呼び続ける** —
    // 何を作っても埋まらないので、上限に当たるまで金と時間を払う。
    const sections = read("lib/card-sections.ts");
    expect(sections).not.toContain('"encounter"');
    const profile = read("lib/target-profile.ts");
    expect(profile).not.toContain('"encounter"');
  });

  it("**場面の札は残っている**(消しすぎていない)", () => {
    // 消すのは確率だけ。「どこで出会うか」の読める札は
    // オーナーが「質の高いカテゴリーを作って」と言っている当のもの。
    expect(fs.existsSync(path.join(root, "components/EncounterLabels.tsx"))).toBe(true);
    expect(read("components/WordCard.tsx")).toContain("<EncounterLabels");
  });

  it("頻度の実測(`corpus_stats`)は残っている", () => {
    // 外へのリンクを消しただけで、頻度そのものは場面カテゴリーの材料。
    expect(read("lib/lexicon.server.ts")).toContain("corpus_stats");
  });

  it("単語の詳細の一番下の地図が**両方**から消えている", () => {
    // 片方だけ消すと、図鑑から開いたときと札から開いたときで
    // 見えるものが食い違う(この作業場が繰り返している形)。
    for (const f of ["components/StickerSheet.tsx", "routes/_authenticated/dex.$stickerId.tsx"]) {
      expect(read(f), f).not.toContain("openstreetmap.org/export/embed");
    }
  });

  it("上の「撮った所」の行は残っている(地名と導線)", () => {
    // 地図を消したのであって、場所を消したのではない。
    // **札の文言ではなく行そのものを見る** — 最初は `card.openMap` が
    // 在ることを数えていたが、その札は「地名が無いときの代わり」に
    // 使うのをやめた文言で、消したら門が落ちた(門が実物より古かった)。
    for (const f of ["components/StickerSheet.tsx", "routes/_authenticated/dex.$stickerId.tsx"]) {
      const src = codeOnly(read(f));
      expect(src, f).toContain("google.com/maps?q=");
      expect(src, f).toContain("s.location_name ??");
    }
  });

  it("地名が無いときにボタンの名前を場所の名前として出さない", () => {
    // 「地図を開く」を地名の代わりに置くと、**そこが「地図を開く」という
    // 場所に見える**(オーナー指摘)。
    for (const f of ["components/StickerSheet.tsx", "routes/_authenticated/dex.$stickerId.tsx"]) {
      expect(codeOnly(read(f)), f).not.toContain('s.location_name ?? t("card.openMap")');
    }
  });
});

describe("中身の無いプロフィールで端末の言語を上書きしない", () => {
  it("`getMyProfile` の逃げ道は決め打ちの言語を書かない", () => {
    // main(Lovable)が私用の列を読めないときの逃げ道を足したとき、
    // `target_language: "zh-TW"` / `ui_language: "ja"` / `level_goal: "TOCFL-2"`
    // を直に書いていた。**直したばかりの根っこがそのまま再発する形。**
    const src = codeOnly(read("lib/profile.functions.ts"));
    expect(src).not.toContain('target_language: "zh-TW"');
    expect(src).not.toContain('level_goal: "TOCFL-2"');
    expect(src).toContain("DEFAULT_TARGET_LANGUAGE");
    expect(src).toContain("levels.toStored(");
  });

  it("逃げ道は「これは設定ではない」と印を付ける", () => {
    const src = codeOnly(read("lib/profile.functions.ts"));
    expect(src).toContain("partial: true");
  });

  it("写す側はその印を見て、端末を上書きしない", () => {
    // 印だけ付けて読む側が見ていなければ、何も守られていない。
    const src = codeOnly(read("lib/use-language-prefs.ts"));
    expect(src).toMatch(/if \(p\.partial\) return;/);
    // 印を見るのが `setTargetLang` **より前**であること。
    expect(src.indexOf("p.partial")).toBeLessThan(src.indexOf("setTargetLang(p."));
  });
});

describe("第2段: 語源と地名を言語ごとに正しく", () => {
  it("語源のプロンプトが漢字の話で決め打ちされていない", () => {
    // 英語のカードにも「漢字の語源」「部首と意味」を作らせていた
    // (オーナー指示「英単語の由来 — 接頭語・接尾語 — を解説して」)。
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).not.toContain("漢字の語源・成り立ち");
    expect(src).not.toContain("部首と意味");
    expect(src).toContain("capture.etymologyRule");
    expect(src).toContain("capture.radicalsRule");
  });

  it("英語の語源は接頭辞・接尾辞に触れ、部首には触れない", () => {
    const en = targetProfile("en").capture;
    expect(en.etymologyRule).toContain("接頭辞");
    expect(en.etymologyRule).toContain("接尾辞");
    expect(en.etymologyRule).not.toContain("部首");
    expect(en.hasRadicals).toBe(false);
    const zh = targetProfile("zh-TW").capture;
    expect(zh.etymologyRule).toContain("漢字");
    expect(zh.hasRadicals).toBe(true);
  });

  it("部首の行は華語のカードだけに出る", () => {
    // 指示で空にさせても、古いデータには入っている。
    // 「作らせない」と「描かない」は別の話。
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toContain("targetProfile(word.language).capture.hasRadicals");
  });

  it("地名を受け取る言葉が決め打ちされていない", () => {
    // `zh-TW` 固定だったので、日本語の画面の人にも中文の地名が返っていた。
    const src = codeOnly(read("lib/geocode.functions.ts"));
    expect(src).toContain("readerMapLanguage(");
    expect(src).not.toMatch(/language: z\.string\(\)\.default\(/);
  });
});

describe("語源の仲間の語と、母語に引っ掛ける覚え方", () => {
  it("仲間の語は**どの学習言語でも**作らせる", () => {
    // オーナー指示 2026-08-26「やっぱり全ての学習言語で語源の項目の欄で、
    // 同じ語源や由来がある関連単語は表示して」。
    for (const lang of TARGET_LANGUAGES) {
      expect(targetProfile(lang).capture.relativesRule.trim(), lang).not.toBe("");
    }
  });

  it("**接頭辞・接尾辞の分解は英語だけ**", () => {
    // オーナー指示「接頭語、接尾語の解説は学習言語英語の時だけで」。
    // 華語に接頭辞・接尾辞の話を持ち込むと、部首の話と混ざって濁る。
    const en = targetProfile("en").capture.etymologyRule;
    expect(en).toContain("接頭辞");
    expect(en).toContain("接尾辞");
    const zh = targetProfile("zh-TW").capture.etymologyRule;
    expect(zh).not.toContain("接頭辞");
    expect(zh).not.toContain("接尾辞");
  });

  it("どの言語の仲間の語も「似ているだけ」を弾き、空を許す", () => {
    // 無理に埋めさせると、**覚え違いの種**を配ることになる。
    for (const lang of TARGET_LANGUAGES) {
      const r = targetProfile(lang).capture.relativesRule;
      expect(r, lang).toContain("空配列");
      expect(r, lang).toMatch(/本当に同じ意味/);
    }
  });

  it("プロンプトが `relativesRule` から出ている(決め打ちでない)", () => {
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).toContain("capture.relativesRule");
    // 空の言語では「空配列」と言い切る分岐が在ること。
    expect(src).toContain("etymology_relatives");
  });

  it("画面が仲間の語を描く", () => {
    const src = codeOnly(read("components/WordCard.tsx"));
    // **部分一致で数えない。** 最初は `toContain("etymology_relatives")` と
    // 書いていて、`etymology_relatives_DISABLED` に潰しても**通った**
    // (この作業場で4度目の同じ罠)。実際に描く式の形を見る。
    expect(src).toMatch(/ex\.etymology_relatives\?\.length/);
    expect(src).toMatch(/ex\.etymology_relatives!\.map\(/);
    expect(src).toMatch(/t\("card\.etymologyRelatives"\)/);
  });

  it("仲間の語だけが届いた段階でも節を「空」にしない", () => {
    // 空扱いのままだと、裏の生成が同じ節を作り直し続ける。
    const src = codeOnly(read("lib/card-sections.ts"));
    expect(src).toContain("etymology_relatives");
  });

  it("覚え方は**すべての学習言語**で母語に引っ掛ける", () => {
    // オーナー追記「覚え方のコツはすべての学習言語に適用して」。
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).toContain("mnemonicRule(");
    // 「記憶に残るひとことフレーズ・覚え方」の決め打ちが残っていないこと。
    expect(src).not.toContain("記憶に残るひとことフレーズ・覚え方");
  });

  it("覚え方の指示は**母語も**受け取る(学習言語だけでは決まらない)", () => {
    const src = codeOnly(read("lib/ai.functions.ts"));
    // 一括生成と作り直しの両方で、母語の符号を渡していること。
    expect(src).toContain("mnemonicRule(data.targetLanguage, l1Info.code");
    expect(src).toContain("mnemonicRule(word.language as string | null, regenL1.code");
  });
});

describe("節の見出しが言語で嘘をつかない", () => {
  it("英語のカードの語源の見出しに「部首」が入らない", () => {
    // **絵で見つけた。** 英語のカードの見出しが `語源・部首` のままだった。
    // 中身(部首の行)は既に言語で伏せていたのに、見出しだけ残っていた。
    const key = sectionTitleKey("etymology", "en");
    expect(key).toBe("card.etymologyOnly");
    for (const lang of UI_LANGS) {
      expect(DICT[key][lang], lang).not.toContain("部首");
      expect(DICT[key][lang].trim(), lang).not.toBe("");
    }
  });

  it("華語のカードは今までどおり「語源・部首」", () => {
    expect(sectionTitleKey("etymology", "zh-TW")).toBe("card.etymology");
  });

  it("ほかの節の見出しは機械的に引く(例外を増やさない)", () => {
    for (const id of ["meaning", "example", "mnemonic"] as const) {
      expect(sectionTitleKey(id, "en")).toBe(`card.${id}`);
      expect(sectionTitleKey(id, "zh-TW")).toBe(`card.${id}`);
    }
  });

  it("画面は見出しを**この関数から**引く", () => {
    // ここを通さない呼び出しが増えると、同じ嘘が別の場所で戻る。
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toContain("t(sectionTitleKey(id, word.language))");
  });
});

describe("意味の説明は要るときだけ / フレーズカードも学習言語に従う", () => {
  it("意味の指示が「簡潔に」だけで済まされていない", () => {
    // オーナー指示「母語の意味の説明は1対1で明らかなら不要」。
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).toContain("meaningRule(");
    expect(src).not.toContain("意味（簡潔に。**解説の言語**で書く");
  });

  it("候補とカードが**同じ**規則を読む(散文を2箇所に書かない)", () => {
    // 同じ原則を2箇所の散文に書くと、必ず片方だけ古くなる。
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).toContain("distinctionRule(");
    // 候補側に散文の写しが残っていないこと。
    expect(src).not.toContain("**distinction(使い分けの一言)は、区別が要るときだけ書く:**");
  });

  it("フレーズカードが台湾華語で決め打たれていない", () => {
    // 英語を学ぶ人が一言を拾うと、英語の画面に中文のフレーズカードが返っていた。
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).not.toContain("台湾華語(繁體字)のフレーズカードを作ります");
    expect(src).not.toContain("(TOCFL)。repliesの語彙");
    expect(src).toContain("phraseProfile.promptName");
    expect(src).toContain("phraseProfile.capture.readingRule");
  });

  it("フレーズの読みの欄も言語の表から出る", () => {
    // 「注音(台湾教育部準拠)」「拼音」を英語のフレーズに求めない。
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).not.toContain("フレーズ全体の注音(台湾教育部準拠)");
  });
});

describe("項目の並べ替え / 例文のレベル連動", () => {
  it("長押しで掴んで並べ替えられる", () => {
    // オーナー指示「単語の項目の選択バーを長押ししたらドラッグ&ドロップで」。
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toContain("LONG_PRESS_MS");
    expect(src).toContain("dragTarget(");
    expect(src).toContain("onPointerDown={onPointerDown(id)}");
  });

  it("**▲▼のボタンを消していない**(鍵盤と読み上げの唯一の口)", () => {
    // 掴む道を足すのであって、押す道を奪うのではない。
    // 消すと touch 以外の人が並べ替えられなくなる。
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toContain("card.moveUp");
    expect(src).toContain("card.moveDown");
  });

  it("並べ替えの計算は純粋な関数に置く(指の扱いと混ぜない)", () => {
    // 順番がずれたときに「指か計算か」を切り分けられるようにする。
    expect(fs.existsSync(path.join(root, "lib/reorder.ts"))).toBe(true);
    const card = codeOnly(read("components/WordCard.tsx"));
    // 画面側で並べ替えを手書きしていないこと。
    expect(card).toContain("moveItem(p.order, from, to)");
  });

  it("保存は離したときに1回だけ", () => {
    // 動かすたびに書くと、指1回で何十回も保存が走る。
    const src = codeOnly(read("components/WordCard.tsx"));
    const endDrag = src.slice(src.indexOf("const endDrag"), src.indexOf("const endDrag") + 500);
    expect(endDrag).toContain("savePrefs(p)");
  });

  it("項目ごとの作り直しにもレベルの縛りが掛かる", () => {
    // **既に効いていた**(`base` が `levelRule` を持ち、各項目は
    // `${base}` から始まる)。外れたら気づけるように数えておく。
    const src = codeOnly(read("lib/ai.functions.ts"));
    const base = src.split("\n").find((l) => l.includes("const base = `"));
    expect(base).toBeTruthy();
    expect(base).toContain("${levelRule}");
  });
});

describe("第5段: 設定の整理", () => {
  it("ボタンの下の解説を**書けなくする**", () => {
    // オーナー指示「設定のボタンの下の解説を全部消す」。
    // 呼び出しだけ消すと、次に行を足す人がまた `hint` を付ける。
    // **部品から口ごと外す**ので、型で止まる。
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).not.toMatch(/hint\?: string;/);
    expect(src).not.toMatch(/hint: string;/);
    expect(src).not.toContain("hint={t(");
  });

  it("解説の翻訳キーも残さない", () => {
    const dict = read("lib/i18n.tsx");
    for (const k of ["settings.levelHint", "settings.photoPrefHint", "settings.phoneticHint"]) {
      expect(dict, k).not.toContain(`"${k}"`);
    }
  });

  it("読みの設定に**学習言語を渡す**", () => {
    // 渡していなかったので既定(台湾華語)で考え、英語を学ぶ人にも
    // 注音・拼音の選択が出ていた。英語では米式/英式の IPA になる。
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).toContain("<PhoneticRow lang={targetLanguage} />");
    // 検査の雛形も同じにする(片方だけだと実物と違う絵を撮る)。
    const harness = codeOnly(read("../scripts/ui-harness/scenes/settings.tsx"));
    expect(harness).toContain("<PhoneticRow lang={target} />");
  });

  it("選ぶものが1つしか無いなら読みの行を出さない", () => {
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).toContain("if (profile.readings.length < 2) return null;");
  });

  it("出典は設定から消えて、**約款の中に残る**", () => {
    // CEFR-J は出典明記が利用の条件。目立たない所へ移すのであって、
    // 消すのではない。
    const settings = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(settings).not.toContain("DataSourcesCard");
    expect(settings).not.toContain("DATA_SOURCES");
    const terms = codeOnly(read("routes/terms.tsx"));
    expect(terms).toContain("<DataSourcesList />");
    expect(fs.existsSync(path.join(root, "components/DataSourcesList.tsx"))).toBe(true);
  });
});

describe("第5段: ホームを下スクロールの形に戻す", () => {
  const gone = [
    "components/AlbumShelf.tsx",
    "components/AlbumSpread.tsx",
    "components/AlbumSpanTabs.tsx",
    "lib/album-spread.ts",
  ];

  it.each(gone)("%s は消えている", (rel) => {
    expect(fs.existsSync(path.join(root, rel)), rel).toBe(false);
  });

  it("ホームが**過去を縦に並べる**", () => {
    // オーナー指示「ホームの本棚の機能を全削除して、前のように
    // 下スクロールで過去が見える形に戻して」。
    const src = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(src).toContain("<PastDays");
    expect(src).not.toContain("AlbumShelf");
    expect(src).not.toContain("AlbumSpread");
  });

  it("日/週/月の切替が**どこにも残っていない**", () => {
    // オーナー指摘「ホームの画面の日、週、月のボタンを消して」。
    const src = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(src).not.toContain("AlbumSpanTabs");
    expect(src).not.toContain("setSpan");
    expect(src).not.toContain('localStorage.getItem("album-span")');
  });

  it("打ち切りをちゃんと伝える(古い日が黙って消えない)", () => {
    // ホームは日付ごとに遡る画面なので、上限で切れた日が黙って消えると
    // **その日は何も撮らなかった**ように見える。
    const src = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(src).toContain("truncated={truncated}");
    expect(src).toContain("stickers?.truncated");
  });

  it("検査の雛形からも棚の場面が消えている", () => {
    const audit = read("../scripts/ui-audit.mjs");
    expect(audit).not.toContain('scene: "home-shelf"');
    expect(audit).not.toContain('scene: "home-spread"');
  });
});

describe("第4段: アルバムと単語詳細で、絵を別々に選ぶ", () => {
  it("「設定に従う」は**どこにも残っていない**", () => {
    // オーナー指示 2026-08-25「アルバム/単語詳細の画像長押しの
    // 『設定に従う』ボタンを削除」。文言(i18n)ごと消す — 鍵だけ残すと
    // 次に誰かが同じボタンを生やす。
    const picker = codeOnly(read("components/HeroPhotoPicker.tsx"));
    expect(picker).not.toMatch(/photo\.followSetting/);
    const i18n = read("lib/i18n.tsx");
    expect(i18n).not.toMatch(/"photo\.followSetting"/);
    expect(i18n).not.toMatch(/"photo\.followSettingHint"/);
  });

  it("選べるのは**役だけ**(null を渡す道が閉じている)", () => {
    // 「設定に従う」が消えた以上、`onPick(null)` の呼び先も消えていないと
    // 型は通るのにボタンだけ無い、という中途半端が残る。
    const picker = codeOnly(read("components/HeroPhotoPicker.tsx"));
    expect(picker).toMatch(/onPick:\s*\(role: PhotoRole\) => void;/);
    expect(picker).not.toMatch(/onPick\(null\)/);
  });

  it("面は**どちらの画面のためか**を持ち、それを画面にも出す", () => {
    const picker = codeOnly(read("components/HeroPhotoPicker.tsx"));
    expect(picker).toMatch(/surface: PhotoSurface;/);
    expect(picker).toMatch(/photo\.forAlbum/);
    expect(picker).toMatch(/photo\.forDetail/);
  });

  it("アルバムの選択は**端末に**、詳細の選択は**サーバに**入る", () => {
    const sheet = codeOnly(read("components/StickerSheet.tsx"));
    expect(sheet).toMatch(/setSurfaceRole\("album", stickerId, role\)/);
    // 詳細のほうは今までどおり `hero_role`。
    expect(sheet).toMatch(/setHeroRoleFn\(/);
  });

  it("アルバムから長押しで開いた面は**アルバムの面**になる", () => {
    // ここを取り違えると、アルバムで選んだのに詳細の見え方が変わる
    // (= 別々にした意味が消える)。
    const sheet = codeOnly(read("components/StickerSheet.tsx"));
    expect(sheet).toMatch(/if \(openPhotoPicker && stickerId\) setPickerSurface\("album"\);/);
    expect(sheet).toMatch(/setPickerSurface\("detail"\);/);
  });

  it("アルバムの絵が**アルバムの選択**を見ている", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/surfaceRoles\[surfaceKey\("album", s\.id\)\]/);
    expect(home).toMatch(/useSurfaceRoleMap\(\)/);
    // 札の枚数だけ hook を呼ばない(枚数が変わると React が落ちる)。
    expect(home).not.toMatch(/useSurfaceRole\("album", s\.id\)/);
  });

  it("自撮りが無い札には**自撮りを撮るボタン**が出る", () => {
    const picker = codeOnly(read("components/HeroPhotoPicker.tsx"));
    expect(picker).toMatch(/onSelfieFile &&/);
    const sheet = codeOnly(read("components/StickerSheet.tsx"));
    expect(sheet).toMatch(/onSelfieFile=\{s\.selfie_url \? undefined :/);
    expect(sheet).toMatch(/attachSelfieFn\(/);
  });

  it("自撮りは `<label>` で包む(押した指の操作としてカメラに届く)", () => {
    // 2026-08-20 のオーナー指摘「自撮りするを押してもインカメラに
    // ならない」の原因は `button` からの `.click()` だった。
    // **注釈を読ませない。** 最初は `read` のまま書いていて、
    // `capture="user"` を消しても上の注釈の中の同じ文字列に当たって
    // 通ってしまった(この作業場で5度目の「文字列が別の場所に在る」事故)。
    const picker = codeOnly(read("components/HeroPhotoPicker.tsx"));
    expect(picker).toMatch(/<label[\s\S]{0,900}?capture="user"[\s\S]{0,300}?<\/label>/);
    expect(picker).not.toMatch(/selfieInputRef\.current\?\.click\(\)/);
  });

  it("自撮りを足しても**元の写真を差し替えない**", () => {
    const fns = codeOnly(read("lib/stickers.functions.ts"));
    expect(fns).toMatch(/selfie_image_url:/);
    // 呼び先が自分の置き場所以外を指していないこと。
    expect(fns).toMatch(/data\.selfie_path\.startsWith\(`\$\{userId\}\/`\)/);
  });

  it("検査の雛形にアルバムの面がある", () => {
    const audit = read("../scripts/ui-audit.mjs");
    expect(audit).toMatch(/variant: "album"/);
  });
});
