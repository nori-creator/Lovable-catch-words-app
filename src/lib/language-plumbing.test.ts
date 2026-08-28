import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { targetProfile } from "./target-profile";
import { sectionTitleKey } from "./card-sections";
import { TARGET_LANGUAGES } from "./target-lang";
import { LEVEL_OUT, parseLevelStep } from "./level-scale";
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
    // **同じ行に並べた**ので(オーナー報告 2026-08-26、3度目「CEFR の欄と
    // 品詞の大きさを揃えて、横に並べて」)、伏せる条件も1つに畳んである。
    expect(src).toMatch(/\{!minimal && \(word\.part_of_speech \|\| word\.level\) && \(/);
    const row = src.slice(src.indexOf("{!minimal && (word.part_of_speech"));
    expect(row.slice(0, row.indexOf("</div>"))).toMatch(/<TocflLadder/);
    // **撮った直後は見出しを直す鉛筆も出さない**(「訳と発音以外は出さない」)。
    expect(src).toMatch(/!minimal && onEditHeadword && !editingHead/);
    // 見出しの行は `minimal` を受け取り続けること（引数が増えたので
    // 1行の写しでは見ない）。
    const header = src.slice(src.indexOf("<HeaderRow"));
    expect(header.slice(0, header.indexOf("/>"))).toMatch(/minimal=\{minimal\}/);
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
    // 2026-08-27 ⑤ で浮いて跳ねる札になった(`SceneBubbles`)。
    expect(fs.existsSync(path.join(root, "components/SceneBubbles.tsx"))).toBe(true);
    expect(read("components/WordCard.tsx")).toContain("<SceneBubbles");
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
    // **import の行を落として見る** — 落とさないと、`setTargetLang` が
    // 冒頭の import に当たり、順番の判定が意味を失う
    // (この作業場で6度目の「文字列が別の場所に在る」事故)。
    const src = codeOnly(read("lib/use-language-prefs.ts"))
      .split("\n")
      .filter((l) => !l.trim().startsWith("import "))
      .join("\n");
    expect(src).toMatch(/if \(p\.partial\) return;/);
    // 印を見るのが**書き込みより前**であること。
    expect(src.indexOf("p.partial")).toBeLessThan(src.indexOf("setTargetLang("));
  });

  it("**この端末で選んでいるなら、サーバの値で塗り替えない**", () => {
    // オーナー報告 2026-08-26(2度目)「一度設定を保存したらその後キープして」。
    // ここは画面を開くたびに走るので、設定画面だけ直しても塞げない。
    const src = codeOnly(read("lib/use-language-prefs.ts"));
    expect(src).toMatch(/reconcileLanguage\(\{[\s\S]{0,120}?stored: storedTargetLang\(\)/);
    expect(src).toMatch(/reconcileLanguage\(\{[\s\S]{0,120}?stored: storedUiLang\(\)/);
    // 生のサーバの値をそのまま書かないこと。
    expect(src).not.toMatch(/setTargetLang\(p\.target_language\)/);
    expect(src).not.toMatch(/setUiLang\(normalizeUiLang\(p\.ui_language\)\)/);
  });

  it("設定の画面も同じ規則で突き合わせ、揃えるために書き戻す", () => {
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    // 突き合わせは `settings-restore.ts` ただ1つ(3度目の報告で移した)。
    expect(src).toMatch(/restoreSettings\(\{/);
    expect(src).toMatch(/uiLanguage: storedUiLang\(\)/);
    expect(src).toMatch(/targetLanguage: storedTarget/);
    expect(src).toMatch(/if \(picked\.pushToServer\)/);
    // 読み込んだ生の値をそのまま画面へ入れないこと。
    expect(src).not.toMatch(/setTargetLanguage\(profile\.target_language\)/);
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

  it("**鍵盤と読み上げの口を消していない**(取っ手に移した)", () => {
    // 掴む道を足すのであって、押す道を奪うのではない。
    // 消すと touch 以外の人が並べ替えられなくなる。
    //
    // オーナー報告 2026-08-26(3度目)「並び替えの欄が前よりも大きくなって
    // 見づらい」で ▲▼ の2つを**1つの取っ手**にまとめた。押す道は
    // 消していない — 取っ手に焦点を当てて ↑↓ で動かす。
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toContain("card.reorder");
    expect(src).toMatch(/data-drag-handle/);
    expect(src).toMatch(/e\.key === "ArrowUp"/);
    expect(src).toMatch(/e\.key === "ArrowDown"/);
    // ↑↓ が計算へ繋がっていること(ラベルだけ在って動かない、を防ぐ)。
    expect(src).toMatch(/move\(id, -1\)/);
    expect(src).toMatch(/move\(id, 1\)/);
  });

  it("**掴んだ後に指で画面が動かない**(受動 listener では止まらない)", () => {
    // オーナー報告 2026-08-26(3度目)「未だに長押ししてドロップしたら
    // 順序が変えられるように変更されてないから実装して」。
    //
    // React の合成イベントは受動で登録されるので、そこの
    // `preventDefault()` は効かない。効かないと browser がスクロールを
    // 始め、`pointercancel` で掴んだ手が毎回離れる。
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toMatch(/addEventListener\("touchmove", stop, \{ passive: false \}\)/);
    // 指をその行に縛る(隣の行へ入った瞬間に落ちない)。
    expect(src).toMatch(/setPointerCapture\(pointerId\)/);
    // `pointerleave` で終わらせない(端の行を持ち上げた瞬間に落ちる)。
    expect(src).not.toMatch(/onPointerLeave=\{endDrag\}/);
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
    // **出す条件は `PhotoAddButtons` ただ1つ**(オーナー指示 2026-08-26)。
    // 呼ぶ側それぞれに書いていたので、図鑑の詳細にはボタンそのものが
    // 無かった。渡すのは絵の在りかだけ。
    const btns = codeOnly(read("components/PhotoAddButtons.tsx"));
    expect(btns).toMatch(/const canSelfie = !selfieUrl;/);
    expect(btns).toMatch(/const canCutout = !!objectUrl && !cutoutUrl;/);
    // **両方の詳細から出る。** 片方だけ直る事故がこの報告の中身。
    for (const rel of [
      "components/HeroPhotoPicker.tsx",
      "routes/_authenticated/dex.$stickerId.tsx",
    ]) {
      expect(codeOnly(read(rel)), rel).toMatch(/<PhotoAddButtons/);
    }
    // 足す道も1つ(`use-photo-attach.tsx`)。
    expect(fs.existsSync(path.join(root, "lib/use-photo-attach.tsx"))).toBe(true);
    for (const rel of ["components/StickerSheet.tsx", "routes/_authenticated/dex.$stickerId.tsx"]) {
      expect(codeOnly(read(rel)), rel).toMatch(/usePhotoAttach\(/);
    }
  });

  it("自撮りは `<label>` で包む(押した指の操作としてカメラに届く)", () => {
    // 2026-08-20 のオーナー指摘「自撮りするを押してもインカメラに
    // ならない」の原因は `button` からの `.click()` だった。
    // **注釈を読ませない。** 最初は `read` のまま書いていて、
    // `capture="user"` を消しても上の注釈の中の同じ文字列に当たって
    // 通ってしまった(この作業場で5度目の「文字列が別の場所に在る」事故)。
    const btns = codeOnly(read("components/PhotoAddButtons.tsx"));
    expect(btns).toMatch(/<label[\s\S]{0,900}?capture="user"[\s\S]{0,300}?<\/label>/);
    expect(btns).not.toMatch(/selfieInputRef\.current\?\.click\(\)/);
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

describe("第3段: 一言は音声だけ、聞く所は日付と場所の隣", () => {
  it("動画の名残が**どこにも残っていない**", () => {
    // オーナー指示 2026-08-26「一言は音声だけにして。動画の撮影はやめて」。
    expect(fs.existsSync(path.join(root, "lib/voice-video.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "components/VoiceVideoNote.tsx"))).toBe(false);
    // **あとから録る欄そのものを消した**(オーナー指示 2026-08-26、3度目
    // 「あとからひと言を録画とる項目は消して」)。一言は撮ったその瞬間に
    // 録る物なので、録るのは撮る画面(`VoiceCaptionButton`)だけ。
    expect(fs.existsSync(path.join(root, "components/VoiceNote.tsx"))).toBe(false);
    // 撮る側に `<video>` が1つでも残っていたら、カメラがまた点く。
    const cap = codeOnly(read("components/VoiceCaptionButton.tsx"));
    expect(cap).not.toMatch(/<video/);
    expect(cap).not.toMatch(/previewRef/);
  });

  it("録るときに**カメラを掴まない**", () => {
    const lib = codeOnly(read("lib/voice-note.ts"));
    expect(lib).toMatch(/return \{ audio: true \};/);
    expect(lib).not.toMatch(/facingMode/);
  });

  it("前に撮った動画と**同じ道**に落ちる(消せない物を残さない)", () => {
    const lib = codeOnly(read("lib/voice-note.ts"));
    // `voice.<拡張子>` の形が変わると、撮り直しても古い動画が置き場所に
    // 残り続け、画面からは消せなくなる。
    expect(lib).toMatch(/voice\.\$\{extensionForMime\(mime\)\}/);
  });

  it("聞くのは `<audio>`(前に撮った動画もそのまま鳴る)", () => {
    const player = codeOnly(read("components/VoiceNotePlayer.tsx"));
    expect(player).toMatch(/<audio/);
    expect(player).not.toMatch(/<video/);
    // **自動で再生しない。** 図鑑を開くたび声が鳴ると人前で開けない。
    expect(player).not.toMatch(/autoPlay/);
  });

  it("再生は**日付と場所の行**に在り、録る所には無い", () => {
    // オーナー指示「再生ボタンは真ん中、日付と場所の名前の隣に置いて」。
    const sheet = codeOnly(read("components/StickerSheet.tsx"));
    const row = sheet.slice(sheet.indexOf("<Clock"), sheet.indexOf("{s.caption &&"));
    expect(row).toMatch(/<VoiceNotePlayer url=\{s\.voice_video_url\} \/>/);
    // カードに**録る欄が無い**こと(オーナー指示 3度目)。
    expect(sheet).not.toMatch(/<VoiceNote /);
    expect(sheet).not.toMatch(/components\/VoiceNote"/);
  });

  it("上げる道は**1つ**(3つの入口が同じ関数を通る)", () => {
    expect(fs.existsSync(path.join(root, "lib/voice-note-upload.ts"))).toBe(true);
    for (const rel of ["components/ScanCatchSheet.tsx", "routes/_authenticated/capture.tsx"]) {
      expect(codeOnly(read(rel)), rel).toMatch(/uploadVoiceNote\(/);
    }
    // 置き場所を自分で組み立てる所が残っていないこと。
    for (const rel of ["components/ScanCatchSheet.tsx", "routes/_authenticated/capture.tsx"]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/voiceNotePath\(/);
    }
  });

  it("キャッチの最中の一言は**文字の欄の隣**に在る", () => {
    // オーナー指示「キャッチのときに一言を声で吹き込めるように。
    // 文字入力の隣にボタンを置いて」。
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    const box = cap.slice(cap.indexOf('id="caption"'), cap.indexOf('id="caption"') + 900);
    expect(box).toMatch(/<VoiceCaptionButton/);
    const scan = codeOnly(read("components/ScanCatchSheet.tsx"));
    const box2 = scan.slice(scan.indexOf('placeholder={t("sheet.notePlaceholder")}'));
    expect(box2.slice(0, 500)).toMatch(/<VoiceCaptionButton/);
  });

  it("キャッチの保存を**待たせない**(録った物は札が出来てから裏で上げる)", () => {
    // オーナーが「最大のペイン」と書いたのは「一瞬でも早く」。
    // 保存の前に上げると、いちばん壊してはいけない所が遅くなる。
    const btn = codeOnly(read("components/VoiceCaptionButton.tsx"));
    expect(btn).not.toMatch(/uploadVoiceNote/);
    expect(btn).not.toMatch(/useServerFn/);
    for (const rel of ["components/ScanCatchSheet.tsx", "routes/_authenticated/capture.tsx"]) {
      const src = codeOnly(read(rel));
      // `void (async () => {` で投げっぱなしにしていること(= 待たない)。
      expect(src, rel).toMatch(/void \(async \(\) => \{[\s\S]{0,400}?uploadVoiceNote\(/);
    }
  });

  it("上げ損ねたら**黙って捨てない**", () => {
    for (const rel of ["components/ScanCatchSheet.tsx", "routes/_authenticated/capture.tsx"]) {
      expect(codeOnly(read(rel)), rel).toMatch(/voice\.attachFailed/);
    }
  });

  it("検索の欄が**カメラの画面そのもの**に在る", () => {
    // オーナー指示「検索欄をカメラの画面に直接置いて」。
    // 前は「文字で打つ」のボタンで、押して面が開いてから打てた。
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/capture\.searchPlaceholder/);
    // **この画面のまま調べる**(オーナー指示 2026-08-26「輸入捕捉って
    // 表示されるページ消して、元のページのまま検索して」)。
    // 前は別の面(`InputCatchSheet`)を開いていて、その面が台湾華語の
    // 決め打ちで引いていたので、英語を学んでいる人にも中国語が出ていた。
    // **打った語は学習言語へ直してから進む**(オーナー報告 2026-08-26、絵つき
    // 「学習言語台湾華語なのに、日本語で入力したら、日本語の単語が出てくる」)。
    // ここが `confirmWord` を直に呼んでいたので、消した面に入っていた
    // 母語 → 学習言語の解決だけが道連れになっていた。
    expect(cap).toMatch(/onSearch=\{\(w\) => void searchWord\(w\)\}/);
    expect(cap).not.toMatch(/setInputSheet/);
    expect(cap).not.toMatch(/<InputCatchSheet/);
    expect(cap).not.toMatch(/from "@\/components\/InputCatchSheet"/);
  });

  it("**撮る前の画面に場面がある**(検索の欄が機械の目に映る)", () => {
    // このアプリで最初に見る面なのに、長らく雛形に場面が無かった。
    // 「場面が無い部品は測られない」でこの作業場は何度も落ちている。
    const audit = read("../scripts/ui-audit.mjs");
    expect(audit).toMatch(/scene: "capture-object"/);
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/export function CaptureObjectPanel\(/);
  });

  it("検査の雛形が新しい面を撮っている", () => {
    const audit = read("../scripts/ui-audit.mjs");
    // `voice-note` の場面は部品ごと消えた(あとから録る欄をやめたため)。
    expect(audit).not.toMatch(/scene: "voice-note"/);
    expect(audit).toMatch(/scene: "voice-player"/);
    expect(audit).toMatch(/variant: "voice"/);
    expect(audit).not.toMatch(/scene: "voice-video"/);
  });
});

describe("第6段: 級は CEFR-J だけが決める／辞書だけでカードを出す道", () => {
  it("頻度からの見積もりが**どこにも残っていない**", () => {
    // オーナー指示 2026-08-26「頻度からの級の見積もりをやめて、
    // CEFR-J に無い語は級外にして」。
    const lib = codeOnly(read("lib/lexicon-import.ts"));
    const fn = lib.slice(lib.indexOf("export function cefrStep("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    // 見積もりの部品(順位の境目・検定の印での挟み)が戻っていないこと。
    expect(body).not.toMatch(/freqRank/);
    expect(body).not.toMatch(/parseExamTags/);
    expect(body).not.toMatch(/Math\.min|Math\.max/);
    expect(body).toMatch(/return null;/);
  });

  it("級外の行を**落とさない**(落とすと辞書が空になる)", () => {
    const lib = codeOnly(read("lib/lexicon-import.ts"));
    expect(lib).toMatch(/row\.level_step != null &&/);
  });

  it("CEFR-J を渡さずに**書き出せない**", () => {
    // 渡さずに流すと全部級外になり、いま入っている公式の級を
    // 級外で上書きしてしまう(`level_step = excluded.level_step`)。
    const tool = read("../scripts/import-lexicon.mjs");
    for (const cmd of ["sql", "csv", "json"]) {
      expect(tool.includes(`requireCefrj("${cmd}")`), cmd).toBe(true);
    }
  });

  it("級外を保存して**読み返せる**", () => {
    const scale = codeOnly(read("lib/level-scale.ts"));
    expect(scale).toMatch(/outStored: "TOCFL-0"/);
    expect(scale).toMatch(/outStored: "CEFR-0"/);
  });

  it("キャッチが**当てずっぽうの級を書かない**", () => {
    // 前は級が分からないとき `toStored(2)` =「A2」を書いていた。
    for (const rel of ["components/ScanCatchSheet.tsx", "components/InputCatchSheet.tsx"]) {
      const src = codeOnly(read(rel));
      expect(src, rel).not.toMatch(/levels\.toStored\(2\)/);
      expect(src, rel).toMatch(/levels\.outStored/);
      // 辞書が級を持っていれば、そちらを使う。
      expect(src, rel).toMatch(/dict\??\.?level_step/);
    }
  });

  it("辞書を引くとき**新しい列も見る**(英語が空で返らない)", () => {
    // 英語の行は `reading_primary` / `meanings` / `level_step` にしか
    // 入らない(`admin.functions.ts` の注)。古い列だけを見ていたので、
    // 辞書だけでカードを出す道が英語で丸ごと死んでいた。
    const de = codeOnly(read("lib/dictionary-entry.ts"));
    for (const col of ["reading_primary", "reading_alt", "meanings", "level_step"]) {
      expect(de, col).toMatch(new RegExp(col));
    }
    const scan = codeOnly(read("lib/scan.functions.ts"));
    expect(scan).toMatch(/\.select\(DICTIONARY_SELECT\)/);
    expect(scan).toMatch(/resolveDictionaryFields\(r, data\.explain_lang\)/);
  });

  it("辞書を**学習言語で**引く(英語を学ぶ人に台湾華語の行を出さない)", () => {
    // 前はどの呼び出しも `language` を渡しておらず、既定の台湾華語を
    // 引いていた。
    for (const rel of ["routes/_authenticated/scan.tsx", "components/InputCatchSheet.tsx"]) {
      const src = codeOnly(read(rel));
      const calls = src.match(/lookupFn\(\{[\s\S]*?\}\)/g) ?? [];
      expect(calls.length, rel).toBeGreaterThan(0);
      for (const c of calls) {
        expect(c, `${rel}: ${c}`).toMatch(/language: targetLanguage/);
        expect(c, `${rel}: ${c}`).toMatch(/explain_lang: uiLang/);
      }
    }
  });

  it("**違う言語の語釈を出さない**", () => {
    const de = codeOnly(read("lib/dictionary-entry.ts"));
    // `meaning_ja` は名前のとおり日本語。読む人が日本語のときだけの受け皿。
    expect(de).toMatch(/explainLang === "ja" \? clean\(row\.meaning_ja\) : null/);
  });
});

describe("発音のラグ: 端末に貯める／出来てからボタンを出す", () => {
  it("**音そのものを端末に貯める**(URL だけ覚えない)", () => {
    // オーナー指摘 2026-08-26「音声ボタンを押しても発音がすぐに聞こえない」。
    // 前は URL だけを画面ごとの `useRef` に持っていたので、
    //  ・画面を閉じると消える
    //  ・押した瞬間に mp3 のダウンロードが始まる
    // の2つで毎回待たされていた。
    const store = codeOnly(read("lib/tts-store.ts"));
    expect(store).toMatch(/indexedDB\.open/);
    const hook = codeOnly(read("lib/use-pronounce.tsx"));
    expect(hook).toMatch(/putCachedAudio\(key, blob\)/);
    expect(hook).toMatch(/getCachedAudio\(key\)/);
    // URL を貰った後に**必ず落とす**。ここが消えると元の遅さに戻る。
    expect(hook).toMatch(/const res = await fetch\(url\);/);
    expect(hook).toMatch(/const blob = await res\.blob\(\);/);
    // 画面ごとの入れ物に戻っていないこと。
    expect(hook).not.toMatch(/useRef<Map<string, string>>/);
  });

  it("端末に在るときは**サーバに行かない**", () => {
    const hook = codeOnly(read("lib/use-pronounce.tsx"));
    // `speechUrl(key)` が在れば、その場で鳴らす。
    expect(hook).toMatch(/const url = speechUrl\(key\) \?\? \(await ensureAudio\(/);
  });

  it("**二重に取りに行かない**(同じ語の合成を2回払わない)", () => {
    const hook = codeOnly(read("lib/use-pronounce.tsx"));
    expect(hook).toMatch(/inflight\.get\(key\)/);
    expect(hook).toMatch(/inflight\.set\(key, job\)/);
  });

  it("**鳴らせるまでボタンを出さない**", () => {
    // オーナー指示「発音がでるようになってから発音ボタンを表示して」。
    const btn = codeOnly(read("components/PronounceButton.tsx"));
    expect(btn).toMatch(/state === "none" \|\| state === "loading"/);
    // 出ていない間も**場所は空けておく**(出た瞬間に行がずれない)。
    expect(btn).toMatch(/aria-hidden className=\{`\$\{box\} shrink-0/);
  });

  it("端末の声しか無いときは**ボタンを消さない**", () => {
    // `failed` で永久に隠すと、端末の声で読む道まで閉じてしまう。
    const btn = codeOnly(read("components/PronounceButton.tsx"));
    expect(btn).not.toMatch(/state === "failed"[\s\S]{0,80}return <span/);
  });

  it("発音ボタンの写しが**どこにも残っていない**", () => {
    // 図鑑に同じ名前の部品が別に住んでいた(この作業場の持病)。
    const dex = codeOnly(read("routes/_authenticated/dex.tsx"));
    expect(dex).not.toMatch(/function PronounceButton\(/);
    for (const rel of [
      "routes/_authenticated/dex.tsx",
      "components/WordCandidateRow.tsx",
      "components/WordCard.tsx",
    ]) {
      expect(codeOnly(read(rel)), rel).toMatch(/<PronounceButton/);
    }
  });

  it("**語の言語で鍵を分ける**(同じ綴りが両方の言語に在る)", () => {
    const store = codeOnly(read("lib/tts-store.ts"));
    expect(store).toMatch(/\$\{language\}\|\$\{voice\}\|\$\{text\.trim\(\)\}/);
    const row = codeOnly(read("components/WordCandidateRow.tsx"));
    expect(row).toMatch(/language=\{language\}/);
  });
});

describe("2026-08-26 の報告: 言語が混ざる", () => {
  it("設定の画面が**置き場所の行で言語を上書きしない**", () => {
    // オーナー報告「学習言語を英語、表示言語を台湾華語にすると、設定の
    // ページを触ると勝手に既定へ戻る」。`getMyProfile` は私用の列が
    // 読めないとき `partial: true` を付けて既定を返す。
    //
    // **3度目の報告で `return` をやめた。** 戻ると画面が `useState` の
    // 初期値のまま据え置かれ、端末の写しを一度も読まずに既定が見える
    // (`settings-restore.ts` の注)。置き場所の行は「サーバ側が無い」
    // として突き合わせに渡す。
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).toMatch(/const partial = !!\(profile as \{ partial\?: boolean \}\)\.partial;/);
    expect(src).toMatch(/partial,/);
    expect(src).not.toMatch(/\}\)\.partial\) return;/);
  });

  it("言語だけを**単独で保存する**(他の列に巻き込まれない)", () => {
    // 1回の UPDATE にまとめると、どれか1列が撥ねられただけで
    // 言語もまとめて保存されない。
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    const first = src.slice(src.indexOf("async function handleSave"));
    const call = first.slice(first.indexOf("await updateProfile"), first.indexOf("});") + 3);
    expect(call).toMatch(/ui_language: uiLanguage/);
    expect(call).toMatch(/target_language: targetLanguage/);
    // **同じ塊にレベルや名前を入れない。**
    expect(call).not.toMatch(/level_goal/);
    expect(call).not.toMatch(/display_name/);
  });

  it("値を撥ねられた列も**外して保存し直す**", () => {
    const src = codeOnly(read("lib/profile.functions.ts"));
    expect(src).toMatch(/function offendingColumn\(/);
    expect(src).toMatch(/violates\|invalid input value/);
  });

  it("**見出し語の文字から言語を正す**(英単語に TOCFL を出さない)", () => {
    // オーナー報告(絵つき)「英単語なのに TOCFL のレベルが表示される」。
    // `lamp` に TOCFL 1級・量詞・台灣筆記が並んでいた。
    const card = codeOnly(read("components/WordCard.tsx"));
    expect(card).toMatch(/resolveWordLanguage\(rawWord\.language, rawWord\.headword\)/);
    expect(fs.existsSync(path.join(root, "lib/word-language.ts"))).toBe(true);
  });

  it("Reverso は**どの学習言語でも出さない**", () => {
    const links = codeOnly(read("lib/real-usage-links.ts"));
    expect(links).not.toMatch(/reverso/i);
  });

  it("英語のときは Instagram(Threads ではない)", () => {
    const links = codeOnly(read("lib/real-usage-links.ts"));
    expect(links).toMatch(/id: "instagram"/);
  });

  it("一言メモの項目名と中身を**プロフィールが決める**", () => {
    // 前は生成の指示に `taiwan_note` が直に書いてあったので、英語のカードは
    // 「台湾の雑学を書け」と言われながら `culture_note` が一度も埋まらない。
    const prof = codeOnly(read("lib/target-profile.ts"));
    expect(prof).toMatch(/noteField: "taiwan_note"/);
    expect(prof).toMatch(/noteField: "culture_note"/);
    const ai = codeOnly(read("lib/ai.functions.ts"));
    expect(ai).toMatch(/\$\{cardProfile\.capture\.noteField\}/);
    expect(ai).toMatch(/\$\{cardProfile\.capture\.noteRule\}/);
    // 空判定も両方を見る(見ないと英語のカードで作り直しが毎回走る)。
    expect(ai).toMatch(/e\.culture_note/);
  });

  it("復習は**学習言語の語だけ**を返す", () => {
    // オーナー報告「復習の記憶の状態が他の学習言語と混ざってる」。
    // 問い合わせ側の絞りは、列が無い環境で**外して**投げ直していた。
    const src = codeOnly(read("lib/reviews.functions.ts"));
    expect(src).toMatch(
      /matchesTargetLanguage\(r\.stickers\?\.words\?\.language, targetLanguage\)/,
    );
  });

  it("4択の誤答も**学習言語の語**から作る", () => {
    // オーナー報告「英単語の4択なのに台湾華語のものが混ざってる」。
    const src = codeOnly(read("lib/reviews.functions.ts"));
    expect(src).toMatch(/\.eq\("language", targetLanguage\)/);
    // **既定の言語で引く所が残っていないこと。** ここが本体。
    expect(src).not.toMatch(/\.eq\("language", DEFAULT_TARGET_LANGUAGE\)/);
  });
});

describe("鳴らす道は1本だけ", () => {
  it("復習が**自前の再生**を持っていない", () => {
    // この画面は `playAudio` / `playText` と自前の `sharedAudio` を持って
    // いた。作り置きが無い語はすぐ端末の声に落ちるので、**サーバの合成を
    // 1度も使わない** — 同じ語が画面によって別の声で読まれていた。
    const src = codeOnly(read("routes/_authenticated/review.tsx"));
    expect(src).not.toMatch(/function playAudio\(/);
    expect(src).not.toMatch(/function playText\(/);
    expect(src).not.toMatch(/let sharedAudio/);
  });

  it("作り置きの音は**サーバ関数を呼ばずに**端末へ落ちる", () => {
    const src = codeOnly(read("routes/_authenticated/review.tsx"));
    // **話す面と4択の面の両方**。片方だけだと、もう片方は毎回
    // サーバ関数を呼び直す(直したつもりで半分残る形)。
    const seeds = src.match(/urls: \{ \[card\.headword\]: card\.audio_url \}/g) ?? [];
    expect(seeds.length).toBe(2);
  });

  it("復習の発音ボタンも**鳴らせるようになってから**出る", () => {
    const src = codeOnly(read("routes/_authenticated/review.tsx"));
    // 4択の行・見出し語・添削文の3種類とも共通の部品に寄せる。
    const uses = src.match(/<PronounceButton/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(4);
    expect(src).not.toMatch(/aria-label=\{t\("rv\.pronOf"/);
  });

  it("添削文も**その語の言語**で読む", () => {
    // `usePronounce()` を引数なしで呼んでいたので、英語の添削文が
    // 中国語の声で読まれ、しかもその音は保存されていた。
    const src = codeOnly(read("routes/_authenticated/review.tsx"));
    expect(src).toMatch(/const pronounceLang = card\.language \?\? undefined;/);
    expect(src).not.toMatch(/usePronounce\(\)/);
  });

  it("単語帳も同じ部品・同じ言語", () => {
    const card = codeOnly(read("components/WordbookReviewCard.tsx"));
    expect(card).toMatch(/<PronounceButton/);
    expect(card).not.toMatch(/onSpeak/);
    const page = codeOnly(read("routes/_authenticated/wordbooks.tsx"));
    expect(page).toMatch(/language=\{targetLanguage\}/);
    expect(page).not.toMatch(/usePronounce\(\)/);
  });
});

describe("2026-08-26 の2度目の報告", () => {
  it("**一度出した発音ボタンは引っ込めない**", () => {
    // オーナー報告「単語の候補の音声ボタン押したら消える」。
    // 押すと状態が一瞬 `loading` に戻ることがあり、素直に描くと
    // 押した指の下でボタンが消える。
    const btn = codeOnly(read("components/PronounceButton.tsx"));
    expect(btn).toMatch(/if \(!shown\.current && \(state === "none" \|\| state === "loading"\)\)/);
    // 語が差し替わったら**描くより先に**忘れる(効果だと1回ぶん遅れる)。
    expect(btn).toMatch(/if \(shownFor\.current !== text\) \{/);
    expect(btn).not.toMatch(/useEffect\(/);
  });

  it("**駄目だと分かっている語で待たせない**", () => {
    // オーナー報告「発音のラグがまだある」。合成が使えないとき、
    // `fetchWithBackoff` が4回まで待ってから端末の声に落ちていた。
    const hook = codeOnly(read("lib/use-pronounce.tsx"));
    expect(hook).toMatch(
      /if \(speechState\(key\) === "failed"\) \{[\s\S]{0,200}?speak\(word, language\);/,
    );
  });

  it("記憶の状態も**学習言語で分ける**", () => {
    // オーナー報告「記憶の状態が学習言語を英語に切り替えたのに台湾華語」。
    // ここには絞りが1つも無く、列に `language` すら持ってきていなかった。
    const src = codeOnly(read("lib/reviews.functions.ts"));
    const fn = src.slice(src.indexOf("export const getMemoryOverview"));
    expect(fn).toMatch(/words\(headword, language\)/);
    expect(fn).toMatch(/matchesTargetLanguage\(r\.stickers\?\.words\?\.language, targetLanguage\)/);
  });

  it("4択の**受け皿**もその言語のもの", () => {
    // オーナー報告「4択が学習言語英語なのに台湾華語の単語が混ざってる」。
    // 撮った語が少ない人ほどここまで落ちるので、始めたばかりの人ほど
    // 丸ごと別の言語の4択になっていた。
    const prof = codeOnly(read("lib/target-profile.ts"));
    expect(prof).toMatch(/quizFallbackHeadwords: \["蘋果"/);
    expect(prof).toMatch(/quizFallbackHeadwords: \["apple"/);
    const rev = codeOnly(read("lib/reviews.functions.ts"));
    expect(rev).toMatch(/quizFallback\.headwords/);
    expect(rev).not.toMatch(/FALLBACK_HEADWORDS/);
  });

  it("**学習言語で書かれていない例文は出さない**", () => {
    // オーナー報告(絵つき)「学習言語英語なのに例文が台湾華語で表示される」。
    const card = codeOnly(read("components/WordCard.tsx"));
    expect(card).toMatch(/looksLikeTargetLanguage\(word\.example_sentence, word\.language\)/);
    expect(card).toMatch(/looksLikeTargetLanguage\(e\.zh, word\.language\)/);
    expect(fs.existsSync(path.join(root, "lib/text-language.ts"))).toBe(true);
  });

  it("文字の検索は**画面を変えずに**調べる", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).not.toMatch(/<InputCatchSheet/);
    expect(cap).not.toMatch(/from "@\/components\/InputCatchSheet"/);
    // 検索している間も検索の画面のまま。全画面の「分析中」へ飛ばさない。
    expect(cap).toMatch(/setSearching\(true\)/);
    expect(cap).toMatch(/disabled=\{searching \|\| !typedWord\.trim\(\)\}/);
  });
});

describe("読む人の言語で書かれていない解説を出さない", () => {
  it("札の面が**読む人の言語を渡している**", () => {
    // オーナー報告 2026-08-26(絵つき)「表示言語台灣華語なのに
    // 言語が混ざってる」。届いた絵では例文の訳は繁体字なのに
    // 追加例文の訳だけ日本語だった。
    const sheet = codeOnly(read("components/StickerSheet.tsx"));
    expect(sheet).toMatch(/resolveDisplayWord\([\s\S]{0,220}?\n\s*uiLang,\n\s*\);/);
  });

  it("目印の言語が違えば解説を落とす", () => {
    const lib = codeOnly(read("lib/word-explanation.ts"));
    expect(lib).toMatch(/const wrongLanguage = !!want && !!has && has !== want;/);
    // **意味と例文の訳は落とさない**(そこは別の列から来る)。
    expect(lib).toMatch(/extras: wrongLanguage \? \(null as E\) : extras,/);
  });
});

describe("2026-08-26 の3度目の報告", () => {
  it("**設定は端末の写しを先に載せる**(プロフィールを待たずに)", () => {
    // 「一度保存しても、ほかのページ移ってから設定のページに行くと…戻る」。
    // 戻った先の4つは `useState` の初期値そのものだった。開いた時点で
    // 端末の写しを載せていれば、プロフィールが `partial` でも戻らない。
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    const mount = src.slice(src.indexOf("setPhotoPrefState(getPhotoPref());"));
    const body = mount.slice(0, mount.indexOf("}, []);"));
    expect(body).toMatch(/storedTargetLang\(\)/);
    expect(body).toMatch(/storedUiLang\(\)/);
    expect(body).toMatch(/storedLevels\(/);
  });

  it("級も**端末に憶える**(言語と同じ形)", () => {
    expect(fs.existsSync(path.join(root, "lib/level-pref.ts"))).toBe(true);
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    // 保存のときに書く。`current_level` の列が無い環境でも消えない。
    const save = src.slice(src.indexOf("async function handleSave"));
    expect(save).toMatch(/setStoredLevels\(targetLanguage, \{[\s\S]*?current: currentLevel/);
  });

  it("**中身の無い節は1つも並べない**(作れない節も含めて)", () => {
    // 「例文や単語の変化が回答が生成されてないのに項目が表示されてる。
    //  回答が生成されるまで項目が表示しないで。」
    const src = codeOnly(read("components/WordCard.tsx"));
    // 2026-08-27 ④ で「ネットの画像は届いてから」が加わったので、
    // 条件は `canShow` に名前が付いた。中身は同じ — 行に中身が在るか、
    // ネットの画像なら1枚でも届いたか。
    expect(src).toMatch(/order\.filter\(\(id\) => isVisible\(id\) && canShow\(id\)\)/);
    expect(src).toMatch(/: hasContent\(id\)/);
    // 「まだ作られていません」の枠そのものが残っていないこと。
    expect(src).not.toMatch(/EmptySection/);
    expect(src).not.toMatch(/card\.notYet/);
    expect(codeOnly(read("lib/i18n.tsx"))).not.toMatch(/"card\.notYet"/);
  });

  it("**数える側も例文の言語を見る**(描く側と食い違わせない)", () => {
    // 数える側が「例文は在る」と言い、描く側が
    // `looksLikeTargetLanguage` で落とすと、見出しだけの節が残る。
    const src = codeOnly(read("lib/card-sections.ts"));
    expect(src).toMatch(/looksLikeTargetLanguage\(input\.example_sentence, input\.language\)/);
    expect(src).toMatch(/looksLikeTargetLanguage\(e\?\.zh, input\.language\)/);
    // 渡す側が渡し忘れていないこと。
    expect(codeOnly(read("components/WordCard.tsx"))).toMatch(/language: word\.language,/);
    expect(codeOnly(read("lib/ai.functions.ts"))).toMatch(
      /language: word\.language as string \| null,/,
    );
  });

  it("**英語の型を8文字の物差しで落とさない**", () => {
    // 「単語のチャンク型の項目が生成されてない」。生成はされていて、
    // `MAX_CHUNK_CHARS`(繁体字8文字)が英語の型を全部落としていた。
    const src = codeOnly(read("lib/extras.ts"));
    expect(src).toMatch(/MAX_CHUNK_WORDS_EN/);
    expect(src).toMatch(/normalizeTargetLanguage\(language\) === "en"/);
    // 呼ぶ側が学習言語を渡していること(渡さないと同じ穴に落ちる)。
    for (const rel of ["lib/card-sections.ts", "components/WordCard.tsx"]) {
      expect(codeOnly(read(rel)), rel).toMatch(/refineUsageChunks\([\s\S]{0,200}?language/);
    }
    const rev = codeOnly(read("lib/reviews.functions.ts"));
    expect(rev).toMatch(/topChunkOf\(w\.extras, w\.headword, w\.language\)/);
    expect(rev).toMatch(/explainOf\(w\.extras, w\.headword, w\.language\)/);
  });

  it("型を作らせる言い方が**言語ごと**にある", () => {
    const prof = codeOnly(read("lib/target-profile.ts"));
    expect(prof).toMatch(/chunkPrompt/);
    expect(targetProfile("en").chunkPrompt.lengthRule).not.toContain("繁体字");
    expect(targetProfile("en").chunkPrompt.styleRule).not.toContain("量詞");
    expect(targetProfile("en").chunkPrompt.posRule).not.toContain("詞類表");
    expect(targetProfile("zh-TW").chunkPrompt.lengthRule).toContain("繁体字");
    const ai = codeOnly(read("lib/ai.functions.ts"));
    // 決め打ちが戻っていないこと。
    expect(ai).not.toMatch(/型1つは繁体字で/);
    expect(ai).toMatch(/chunkPrompt\.lengthRule/);
    expect(ai).toMatch(/chunkPrompt\.styleRule/);
  });

  it("**地名が保存に届く**(画面の写しだけを直さない)", () => {
    // 「撮った地図の地名が表示されてない」。`resolve()` は地名を
    // `void` で投げっぱなしにしていたので、行に入るのはいつも null。
    const src = codeOnly(read("lib/use-catch-location.tsx"));
    expect(src).toMatch(/const next: CatchLocation = \{ lat, lng, name \};/);
    // 座標と一緒に温める(撮る道を遅くしない)。
    expect(src).toMatch(/shouldGeocode\(prev, \{ lat, lng \}\)/);
    // 投げっぱなしの形が戻っていないこと。
    expect(src).not.toMatch(
      /const next: CatchLocation = \{ lat, lng, name: null \};\s*setLoc\(next\);\s*if \(lat == null/,
    );
  });

  it("あとから一言を録る欄が**消えている**", () => {
    expect(fs.existsSync(path.join(root, "components/VoiceNote.tsx"))).toBe(false);
    const sheet = codeOnly(read("components/StickerSheet.tsx"));
    expect(sheet).not.toMatch(/<VoiceNote /);
    // 聞く所は残っている(日付と場所の行)。
    expect(sheet).toMatch(/<VoiceNotePlayer url=\{s\.voice_video_url\} \/>/);
  });

  it("級の札が**品詞の札と同じ寸法**(44px の塊にしない)", () => {
    const src = codeOnly(read("components/TocflLadder.tsx"));
    const collapsed = src.slice(
      src.indexOf("if (!open) {"),
      src.indexOf("return (\n    <div className={`inline-flex flex-col"),
    );
    // 見た目は品詞と同じ `px-2 py-0.5`、指の当たりは `::before` で広げる。
    expect(collapsed).toMatch(/px-2 py-0\.5/);
    expect(collapsed).toMatch(/before:-inset-y-3/);
    expect(collapsed).not.toMatch(/min-h-11/);
  });
});

describe("2026-08-26: 注音・拼音を英語のカードに出さない", () => {
  /**
   * オーナー報告:
   * > 「学習言語英語、母語台湾華語のとき、注音やピンインを決して表示しないで。
   * >  単語の詳細や単語の候補、文字入力の候補などを含むアプリ全体で。」
   *
   * 読みを出す口が**5箇所**に散らばっていて、そのうち4箇所が
   * `pickReading`(台湾華語のプロフィールで決め打ち)を直に呼ぶか、
   * 注音と拼音を素で並べていた。
   */
  const READ_SITES = [
    "components/WordCandidateRow.tsx",
    "components/ScanCatchSheet.tsx",
    "components/InputCatchSheet.tsx",
    "routes/_authenticated/capture.tsx",
    "routes/_authenticated/review.tsx",
  ];

  it("**読みを出す所は `Reading` か `useReadingText` を通る**", () => {
    for (const rel of READ_SITES) {
      const src = codeOnly(read(rel));
      expect(src, rel).toMatch(/<Reading\b|useReadingText\(|pickReadingOf\(/);
    }
  });

  it("**`pickReading(` を新しく呼ばない**(台湾華語の決め打ち)", () => {
    // `pickReadingOf(profile, …)` は言語を受けるので別物。素の
    // `pickReading(` だけを禁じる。
    for (const rel of READ_SITES) {
      const src = codeOnly(read(rel));
      expect(src, rel).not.toMatch(/[^A-Za-z]pickReading\(/);
    }
  });

  it("**注音と拼音を素で並べない**(片方ずつ書くと言語の判定を抜ける)", () => {
    for (const rel of READ_SITES) {
      const src = codeOnly(read(rel));
      // `{…zhuyin}` と `{…pinyin}` が同じ行に並ぶ形が戻っていないこと。
      expect(src, rel).not.toMatch(/\{[^}\n]*\bzhuyin\b[^}\n]*\}\s*\n?\s*\{[^}\n]*\bpinyin\b/);
    }
  });

  it("`Reading` は**その言語に在る表記しか返さない**", () => {
    const src = codeOnly(read("lib/phonetic.tsx"));
    // 落ちる順は `profile.readings` から作る(言語ごとの一覧)。
    expect(src).toMatch(/for \(const k of \[kind, \.\.\.profile\.readings\]\)/);
  });
});

describe("2026-08-26: 学習言語の語を、その言語の字で組む", () => {
  /**
   * オーナー報告「カメラ撮った後の単語の候補の字体が変」。
   * `Zh` は `lang="zh-Hant"` を決め打ちで付ける包みなので、英語の語に
   * 中国語のフォントが当たっていた。
   */
  it("`Term` が `target-profile` の `scriptLang` から字を決める", () => {
    expect(fs.existsSync(path.join(root, "components/Term.tsx"))).toBe(true);
    const src = codeOnly(read("components/Term.tsx"));
    expect(src).toMatch(/targetProfile\(lang\)\.scriptLang/);
    // ここに言語の分岐を書かない(言語が増えた日にここだけ増えない)。
    expect(src).not.toMatch(/=== "en"/);
  });

  it("**学習言語の語が入る所は `Term` を通る**", () => {
    for (const rel of [
      "components/WordCandidateRow.tsx",
      "components/WordCard.tsx",
      "components/ScanCatchSheet.tsx",
      "components/CatchLanding.tsx",
      "routes/_authenticated/capture.tsx",
      "routes/_authenticated/review.tsx",
    ]) {
      expect(codeOnly(read(rel)), rel).toMatch(/<Term\b/);
    }
  });

  it("`Zh` は**必ず繁体字が入る所**にだけ残す", () => {
    // 候補の行から `Zh` が消えていること(そこは学習言語の語)。
    const row = codeOnly(read("components/WordCandidateRow.tsx"));
    expect(row).not.toMatch(/<Zh\b/);
  });
});

describe("2026-08-26: 名前を変える", () => {
  it("学習言語の呼び名が**繁體字（台灣）/ Mandarin (Taiwan)**", () => {
    expect(DICT["settings.langZhTw"].ja).toBe("繁體字（台灣）");
    expect(DICT["settings.langZhTw"].en).toBe("Mandarin (Taiwan)");
    expect(DICT["settings.langZhTw"]["zh-TW"]).toBe("繁體字（台灣）");
  });

  it("復習の自動は「AIが選ぶ」ではなく**自動**", () => {
    for (const key of ["review.auto", "settings.modeHybrid"]) {
      for (const lang of UI_LANGS) {
        expect(DICT[key][lang], `${key}/${lang}`).not.toMatch(/AI/);
      }
    }
  });

  it("表示言語の欄は**母語**", () => {
    expect(DICT["settings.uiLang"].ja).toBe("母語");
    expect(DICT["settings.uiLang"]["zh-TW"]).toBe("母語");
  });
});

describe("2026-08-26: 設定から消した項目", () => {
  it("発音判定の厳しさと優先する記憶段階の**欄が無い**", () => {
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).not.toMatch(/label=\{t\("settings\.strictness"\)\}/);
    expect(src).not.toMatch(/label=\{t\("settings\.reviewFocus"\)\}/);
    // **列は残す** — 既に選んである人の値を保存のたびに消さないため。
    expect(src).toMatch(/pronunciation_strictness: strictness/);
    expect(src).toMatch(/review_stage_focus: reviewFocus/);
  });

  it("開発者用の2つの道具が**部品ごと消えている**", () => {
    expect(fs.existsSync(path.join(root, "components/ThemeLab.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(root, "components/EffectLab.tsx"))).toBe(false);
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).not.toMatch(/ThemeLabButton|EffectLabButton/);
  });

  it("UIテーマの一覧は**畳んである**", () => {
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    const picker = src.slice(src.indexOf("function UiThemePicker"));
    const tag = picker.slice(
      picker.indexOf("<details"),
      picker.indexOf(">", picker.indexOf("<details")),
    );
    expect(tag).not.toMatch(/\bopen\b/);
  });
});

describe("2026-08-26: 打つのは何語でもよいが、見出しは学習言語だけ", () => {
  /**
   * オーナー報告（絵つき）:
   * > 「文字入力、学習言語台湾華語なのに、日本語で入力したら、日本語の単語が
   * >  出てくる。文字入力は日本語、英語、台湾華語すべての言語で入力を可能に
   * >  して。ただし単語のカードの見出しは必ずユーザーが設定してる学習言語
   * >  だけを表示して。」
   *
   * 届いた絵は見出し「駅の改札」・読み `ㄧㄢˋ ㄆㄧㄠˋ ㄓㄚˊ ㄇㄣˊ`。
   * **読みと意味は正しく引けていて、見出しだけが打った日本語のまま**だった。
   */
  it("打った語を**解決してから**カードを作る", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/async function searchWord\(/);
    // 学習言語の語ならそのまま（速い道を残す）。
    expect(cap).toMatch(/if \(isTargetHeadword\(word, targetLanguage\)\)/);
    // そうでなければ候補に訊く（打つ言語は選ばせない）。
    expect(cap).toMatch(/await candidatesFn\(\{/);
    // 学習言語の語として通る候補だけを使う。
    expect(cap).toMatch(/isTargetHeadword\(c\.headword, targetLanguage\)/);
  });

  it("**手で打つ所も同じ道を通る**（片方だけ直る事故を防ぐ）", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/onManual=\{\(\) => void searchWord\(manualWord\)\}/);
  });

  it("生成が返した見出し語を**採る**（最後の砦）", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/function adoptResolvedHead\(/);
    // 学習言語として通らない値は採らない。
    expect(cap).toMatch(/!isTargetHeadword\(resolved, targetLanguage\)\) return;/);
    // 生成が返った所で必ず呼ぶ（2箇所とも）。
    expect(cap.match(/adoptResolvedHead\(c\)/g) ?? []).toHaveLength(2);
  });
});

describe("2026-08-26: 見出し語を直せる", () => {
  it("**`words` の行を書き換えない**（共有の行なので他の人まで変わる）", () => {
    const src = codeOnly(read("lib/stickers.functions.ts"));
    const fn = src.slice(src.indexOf("export const setStickerHeadword"));
    const body = fn.slice(0, fn.indexOf("\n  });"));
    // 直すのは「この札がどの語を指すか」だけ。
    expect(body).toMatch(/\.update\(\{ word_id: wordId \} as never\)/);
    expect(body).toMatch(/from\("stickers"\)/);
    // 語の行は**探すか作るか**（`upsertWord`）で、update はしない。
    expect(body).toMatch(/upsertWord\(/);
    expect(body).not.toMatch(/from\("words"\)[\s\S]{0,80}\.update\(/);
  });

  it("**母語のまま通さない**（直したのにまた母語になる）", () => {
    const src = codeOnly(read("lib/stickers.functions.ts"));
    const fn = src.slice(src.indexOf("export const setStickerHeadword"));
    expect(fn.slice(0, 2000)).toMatch(/if \(!isTargetHeadword\(headword, language\)\)/);
  });

  it("**自分の札だけ**", () => {
    const src = codeOnly(read("lib/stickers.functions.ts"));
    const fn = src.slice(src.indexOf("export const setStickerHeadword"));
    const body = fn.slice(0, fn.indexOf("\n  });"));
    expect(body.match(/\.eq\("user_id", userId\)/g) ?? []).toHaveLength(2);
  });

  it("カードは**描くだけ**（通信を持たない）", () => {
    const src = codeOnly(read("components/WordCard.tsx"));
    expect(src).toMatch(/onEditHeadword\?: \(next: string\) => void \| Promise<void>;/);
    // カードの中から server を呼んでいないこと。
    expect(src).not.toMatch(/setStickerHeadword/);
  });
});

describe("2026-08-26（7件目）: 文字検索・言語の切り替え・記憶の状態", () => {
  it("**見つからなかった知らせに学習言語の名前を入れる**", () => {
    // 「学習言語英語…検索に台湾華語を入力してもエラーが起きて、英単語が
    //  表示されない」。ここは「中文の単語が…」の決め打ちで、英語を
    //  学んでいる人にも中文の話をしていた。
    for (const lang of UI_LANGS) {
      expect(DICT["input.notTargetLang"][lang], lang).toMatch(/\{lang\}/);
    }
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/input\.notTargetLang", \{ lang: t\(TARGET_LANG_LABEL_KEYS/);
  });

  it("**調べている間も検索の画面のまま**(打った語を消さない)", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    // 撮ったときの全画面へ飛ばさない。
    const fn = cap.slice(cap.indexOf("async function searchWord"));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    expect(body).not.toMatch(/setStep\("processing"\)/);
    expect(body).toMatch(/setSearching\(true\)/);
    // 打った語は**次へ進むと決まってから**消す。
    const form = cap.slice(cap.indexOf("onSubmit={(e) => {"));
    expect(form.slice(0, form.indexOf("}}"))).not.toMatch(/setTypedWord\(""\)/);
  });

  it("**候補が1つなら選ばせない**(意味と発音へ直行)", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/if \(usable\.length === 1\)/);
    const one = cap.slice(cap.indexOf("if (usable.length === 1)"));
    expect(one.slice(0, one.indexOf("setSuggestions"))).toMatch(/confirmWord\(/);
  });

  it("**母語も選んだ瞬間に効く**(学習言語と同じ形)", () => {
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).toMatch(/const pickUiLanguage = \(next: string\) => \{/);
    const fn = src.slice(src.indexOf("const pickUiLanguage"));
    expect(fn.slice(0, fn.indexOf("};"))).toMatch(/setUiLang\(normalized\)/);
    // 欄が新しい口を使っていること（作っただけで繋がっていない、を防ぐ）。
    expect(src).toMatch(/onChange=\{pickUiLanguage\}/);
  });

  it("**学習言語を切り替えたら一覧を読み直す**", () => {
    const src = codeOnly(read("lib/use-language-prefs.ts"));
    expect(src).toMatch(/export function useRefreshOnTargetLanguage\(\)/);
    // 図鑑・アルバム・復習・記憶・単語帳が入っていること。
    for (const key of ["stickers", "reviews-due", "memory-overview", "wordbooks"]) {
      expect(src, key).toContain(`"${key}"`);
    }
    // 呼ばれていること（作っただけ、を防ぐ）。
    expect(codeOnly(read("components/AppShell.tsx"))).toMatch(/useRefreshOnTargetLanguage\(\)/);
  });

  it("**4択の誤答は、その人の撮った語も学習言語で絞る**", () => {
    // 前の周で辞書の池と受け皿は絞ったのに、いちばん先に使われる
    // 「その人のデッキ」だけ素通しだった。
    const src = codeOnly(read("lib/reviews.functions.ts"));
    const deck = src.slice(src.indexOf("const { data: deckRows }"));
    const body = deck.slice(0, deck.indexOf("// A3"));
    expect(body).toMatch(/words\(id, headword, language,/);
    expect(body).toMatch(/matchesTargetLanguage\(r\.words\.language, targetLanguage\)/);
  });

  it("**全体の記憶率も学習言語で分ける**", () => {
    const src = codeOnly(read("lib/reviews.functions.ts"));
    const fn = src.slice(src.indexOf("export const getOverallMemoryStats"));
    const body = fn.slice(0, fn.indexOf("\n  });"));
    expect(body).toMatch(/getUserTargetLanguage\(userId\)/);
    expect(body).toMatch(
      /matchesTargetLanguage\(r\.stickers\?\.words\?\.language, targetLanguage\)/,
    );
    // 記録も同じ札のものだけ（過去側の線がその言語を始める前から伸びない）。
    expect(body).toMatch(/keep\.has\(e\.sticker_id\)/);
  });

  it("**グラフは始めた日から**(空っぽの左側を描かない)", () => {
    const src = codeOnly(read("lib/retention-series.ts"));
    expect(src).toMatch(/export function trimBeforeStart\(/);
    expect(src).toMatch(/trimBeforeStart\(series\)/);
  });

  it("**記憶の一覧は1語も切らない**(長期記憶が抜け落ちない)", () => {
    // 並びは危険な語が上なので、切ると必ず「いちばん覚えている語」が消える。
    const src = codeOnly(read("routes/_authenticated/review.tsx"));
    expect(src).not.toMatch(/overview\.words\.slice\(/);
    expect(src).toMatch(/overview\.words\.map\(\(w\) =>/);
  });

  it("**自撮りの入力を `display:none` にしない**(capture が効かない端末がある)", () => {
    for (const rel of [
      "components/PhotoAddButtons.tsx",
      "components/ScanCatchSheet.tsx",
      "routes/_authenticated/capture.tsx",
    ]) {
      const src = read(rel);
      for (const m of src.matchAll(
        /<input[\s\S]{0,400}?capture="(?:user|environment)"[\s\S]{0,300}?\/>/g,
      )) {
        expect(m[0], rel).not.toMatch(/className="hidden"/);
        expect(m[0], rel).toMatch(/className="sr-only"/);
      }
    }
  });

  it("**長押しの面が両方の詳細に在る**(入口で選べたり選べなかったりしない)", () => {
    // オーナー指示「画像長押ししたら元の画像・自撮り・切り抜きの3種類が
    // 表示されるようにして表示する画像を選択できるように」。
    // この面は `StickerSheet` にだけ在って、図鑑の詳細には無かった。
    for (const rel of ["components/StickerSheet.tsx", "routes/_authenticated/dex.$stickerId.tsx"]) {
      expect(codeOnly(read(rel)), rel).toMatch(/<HeroPhotoPicker/);
    }
    // **図鑑の詳細が決めるのは詳細の見え方だけ**(アルバムは別)。
    const dex = codeOnly(read("routes/_authenticated/dex.$stickerId.tsx"));
    expect(dex).toMatch(/surface="detail"/);
    expect(dex).not.toMatch(/surface="album"/);
    // 長押しで開く(押しただけでは裏返るだけ)。
    expect(dex).toMatch(/onPointerDown=\{startPress\}/);
  });

  it("**座標しか無い札にも地名を出す**(両方の詳細から同じ道)", () => {
    expect(fs.existsSync(path.join(root, "lib/use-place-name.ts"))).toBe(true);
    for (const rel of ["components/StickerSheet.tsx", "routes/_authenticated/dex.$stickerId.tsx"]) {
      const src = codeOnly(read(rel));
      expect(src, rel).toMatch(/usePlaceName\(s\.lat, s\.lng, s\.location_name\)/);
      expect(src, rel).toMatch(/location_name \?\? resolvedPlace \?\? t\("common\.shotHere"\)/);
    }
  });
});

/**
 * 読み上げの言語（オーナー報告 2026-08-27 ①⑯）。
 *
 * > 「Mapの発音おかしい。pが発音されてない。」
 * > 「音声の声がたまに異なる。様々な別のソフトの声がする。声質を統一したい。」
 *
 * 原因は1つ。**何語として読むかを渡していない呼び出しが4つ**あった。
 * `usePronounce()` の既定は台湾華語なので、そこから鳴る英語は
 * 中国語の声で合成される — 中国語に語末の /p/ は無いので "map" は
 * 「マー」になる。しかも `scan.tsx` は道そのものの写しを持っていて、
 * 控えの側で `new SpeechSynthesisUtterance` を直に作り、**声を1つも
 * 選んでいなかった**。端末がその場で選ぶので、鳴らすたびに声が変わる。
 */
describe("読み上げは必ず「何語か」を連れて歩く", () => {
  const CALLERS = [
    "components/ScanCatchSheet.tsx",
    "components/InputCatchSheet.tsx",
    "components/WordCard.tsx",
    "routes/_authenticated/capture.tsx",
    "routes/_authenticated/scan.tsx",
    "routes/_authenticated/review.tsx",
  ];

  it("`usePronounce()` を引数なしで呼ぶ所が1つも無い", () => {
    for (const rel of CALLERS) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/usePronounce\(\s*\)/);
    }
  });

  it("画面が `SpeechSynthesisUtterance` を自分で作らない", () => {
    for (const rel of CALLERS) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/new SpeechSynthesisUtterance/);
    }
  });

  it("かざす画面は合成のサーバ関数を直に呼ばない", () => {
    const scan = codeOnly(read("routes/_authenticated/scan.tsx"));
    expect(scan).not.toMatch(/synthesizeSpeech/);
    expect(scan).toMatch(/usePronounce\(targetLanguage\)/);
  });

  it("辞書の音声の作り置きは学習言語を選べる", () => {
    const admin = codeOnly(read("routes/_authenticated/admin.metrics.tsx"));
    expect(admin).toMatch(/pregenFn\(\{ data: \{ batch: 25, language \} \}\)/);
    expect(admin).toMatch(/dry_run: true, language/);
  });
});

/** アルバムは「自分が出会って撮った物」の紙（オーナー指摘 2026-08-27 ②）。 */
describe("アルバムに借り物を貼らない", () => {
  const home = () => codeOnly(read("routes/_authenticated/home.tsx"));

  it("ネットの絵はアルバムの選択肢から外れている", () => {
    expect(home()).toMatch(/exclude: \["placeholder"\]/);
  });

  it("写真が無い札には印画紙も三角コーナーも付かない", () => {
    const src = home();
    expect(src).toMatch(/heroUrl \? "photo-print" : "album-note"/);
    expect(src).toMatch(/\{heroUrl && \(\s*<>\s*<span aria-hidden className="photo-corner tl"/);
  });

  it("アルバムの見出し語の字形は学習言語から決める", () => {
    const src = home();
    // **属性そのものを見る。** 注釈の中で `lang="zh-Hant"` と説明している
    // 行があり、`codeOnly` は `{/*` 始まりの行を落とさない。
    expect(src).not.toMatch(/^\s*lang="zh-Hant"$/m);
    expect(src).toMatch(/<Term\s+lang=\{s\.word\.language\}/);
  });
});

/** 型の節は**かたまりしか出さない**(オーナー指摘 2026-08-27 ②⑫⑮)。 */
describe("型の節はかたまりしか出さない", () => {
  const card = () => codeOnly(read("components/WordCard.tsx"));

  it("語順の解説文を型の節に流さない", () => {
    expect(card()).not.toMatch(/ex\.word_order/);
  });

  it("数える側からも `word_order` が消えている(描く側と揃える)", () => {
    expect(codeOnly(read("lib/card-sections.ts"))).not.toMatch(/ex\.word_order/);
  });

  it("古いカードのコロケーションも同じ物差しを通る", () => {
    expect(card()).toMatch(/usableCollocations\(ex\.collocations, word\.language\)/);
    expect(codeOnly(read("lib/card-sections.ts"))).toMatch(
      /usableCollocations\(ex\.collocations, input\.language\)/,
    );
  });

  it("量詞に触れる型は1つも通さない", () => {
    const lib = codeOnly(read("lib/extras.ts"));
    expect(lib).toMatch(/export function withoutMeasureWords\(/);
    expect(lib).not.toMatch(/parts\.some\(\(t\) => !cores\.has/);
  });

  it("生成側にも「量詞を使わない」と書いてある", () => {
    expect(targetProfile("zh-TW").chunkPrompt.styleRule).toContain("量詞を1つも使わない");
    for (const code of TARGET_LANGUAGES) {
      expect(targetProfile(code).chunkPrompt.lengthRule, code).toMatch(/感嘆符|疑問符/);
    }
  });
});

/** 関連語の欄(オーナー指示 2026-08-27 ⑧)。 */
describe("関連語は読めて・鳴らせて・読みやすい", () => {
  it("読みの欄が語の持ち物として在る", () => {
    const lib = codeOnly(read("lib/extras.ts"));
    expect(lib).toMatch(/reading: z\.string\(\)\.catch\(""\)/);
    expect(lib).toMatch(/reading_alt: z\.string\(\)\.catch\(""\)/);
  });

  it("読みは表記の名前を持たない(注音か IPA かは言語が決める)", () => {
    expect(codeOnly(read("lib/target-profile.ts"))).toMatch(/export function readingPromptNames\(/);
    const ph = codeOnly(read("lib/phonetic.tsx"));
    expect(ph).toMatch(/export function neutralReadings\(/);
    expect(ph).toMatch(/export function ReadingOf\(/);
  });

  it("画面は `ReadingOf` を通す(英語の語に注音を出さない唯一の道)", () => {
    expect(codeOnly(read("components/WordCard.tsx"))).toMatch(/<ReadingOf/);
  });

  it("語そのものは注釈より大きい", () => {
    const src = codeOnly(read("components/WordCard.tsx"));
    const row = src.slice(src.indexOf("function RelatedWordRow"));
    expect(row.slice(0, 2000)).toMatch(/text-body font-medium/);
  });

  it("見出しは「類義語 / 反義語 / 関連語」", () => {
    expect(DICT["card.synonym"].ja).toBe("類義語");
    expect(DICT["card.antonym"].ja).toBe("反義語");
    expect(DICT["card.relatedTag"].ja).toBe("関連語");
  });

  it("例文・型・関連語のどれからも鳴らせる", () => {
    const src = codeOnly(read("components/WordCard.tsx"));
    expect((src.match(/<PronounceButton/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(src).toMatch(/onSpeak=\{\(text\) => void pronounce\(text\)\}/);
  });
});

/** ネットの画像（オーナー報告 2026-08-27 ④）。 */
describe("ネットの画像は、届いてから並べる", () => {
  it("鍵の要らない出所がある", () => {
    expect(fs.existsSync(path.join(root, "lib/commons-images.ts"))).toBe(true);
    const fn = codeOnly(read("lib/images.functions.ts"));
    expect(fn).toMatch(/commonsSearchUrl\(data\.query\)/);
    expect(fn).toMatch(/source: "commons"/);
    expect(fn.indexOf("commonsSearchUrl")).toBeLessThan(
      fn.indexOf("generateOneAiImage(data.query)"),
    );
  });

  it("並べる側と描く側が**同じ問い合わせ**を読む", () => {
    expect(fs.existsSync(path.join(root, "lib/use-web-images.ts"))).toBe(true);
    const card = codeOnly(read("components/WordCard.tsx"));
    expect(card).not.toMatch(/queryKey: \["web-images"/);
    expect(card).not.toMatch(/searchImageCandidates/);
    expect((card.match(/useWebImages\(/g) ?? []).length).toBe(2);
  });

  it("1枚も無い語では節ごと出さない", () => {
    const card = codeOnly(read("components/WordCard.tsx"));
    expect(card).toMatch(
      /id === "web_images" \? webImages\.candidates\.length > 0 : hasContent\(id\)/,
    );
    expect((card.match(/canShow\(id\)/g) ?? []).length).toBe(2);
  });
});

/** 話すモードの採点（オーナー指示 2026-08-27 ⑦）。 */
describe("言い直して当てた語を「覚えていた」に数えない", () => {
  const rv = () => codeOnly(read("routes/_authenticated/review.tsx"));

  it("判断は純粋な物1つに在る", () => {
    expect(fs.existsSync(path.join(root, "lib/speaking-grade.ts"))).toBe(true);
    expect(rv()).toMatch(/speakingResult\(\{ kind, objectiveOk, failedAttempts \}\)/);
    expect(rv()).not.toMatch(/kind === "skip" \? "skip" : objectiveOk \? "success" : "skip"/);
  });

  it("外した回数を数えている(最後の1回ではなく)", () => {
    const src = rv();
    expect(src).toMatch(/const \[failedAttempts, setFailedAttempts\] = useState\(0\)/);
    expect((src.match(/setFailedAttempts\(\(n\) => n \+ 1\)/g) ?? []).length).toBe(2);
  });

  it("グラフが読む `correct` も同じ所から出す", () => {
    const src = rv();
    expect(src).toMatch(/correct: countsAsRemembered\(result\)/);
    expect(src).not.toMatch(/correct: result === "success"/);
  });

  it("明日また出る理由をその場で言う", () => {
    expect(rv()).toMatch(/retried=\{failedAttempts > 0\}/);
    expect(DICT["review.retriedCountsAsLapse"]).toBeDefined();
  });
});

/** 級（オーナー指摘 2026-08-27 ⑭）。 */
describe("級は辞書が正、分からないものは級外", () => {
  const ai = () => codeOnly(read("lib/ai.functions.ts"));

  it("決め方は純粋な物1つに在る", () => {
    expect(fs.existsSync(path.join(root, "lib/level-source.ts"))).toBe(true);
    expect(ai()).toMatch(
      /resolveLevel\(\{ scale: cardProfile\.levels, dictStep, aiLevel: card\.level \}\)/,
    );
    expect(ai()).toMatch(/level: level\.stored/);
  });

  it("カードを作るときに辞書を引く", () => {
    const src = ai();
    expect(src).toMatch(/from\("dictionary_entries"\)/);
    expect(src).toMatch(/\.select\("level_step, exam_tags"\)/);
    expect(src).toMatch(/const cardLanguage = cardProfile\.code/);
    expect(src).toMatch(/\.eq\("language", cardLanguage\)/);
  });

  it("**指示文に級外の口がある**(6つのどれかを強いない)", () => {
    expect(ai()).toMatch(/級外/);
    for (const code of TARGET_LANGUAGES) {
      expect(parseLevelStep(targetProfile(code).levels.outStored), code).toBe(LEVEL_OUT);
    }
  });

  it("級外の語には、級の代わりに検定の印を出す", () => {
    expect(fs.existsSync(path.join(root, "lib/exam-tags.ts"))).toBe(true);
    const card = codeOnly(read("components/WordCard.tsx"));
    expect(card).toMatch(/parseLevelStep\(word\.level\) === LEVEL_OUT/);
    expect(card).toMatch(/examTagLabels\(word\.extras\?\.exam_tags\)/);
    expect(ai()).toMatch(/exam_tags: examTags/);
  });
});

/** 地の文の読みやすさ（オーナー指摘 2026-08-27 ⑥）。 */
describe("地の文は読める組みで出す", () => {
  const css = () => read("styles.css");

  it("和文の行送りに直してある(欧文の 1.6 のままにしない)", () => {
    expect(css()).toMatch(/\.prose-body \{[\s\S]*?line-height: 1\.85;/);
  });

  it("行長を切る(横向き・タブレットで1行60字にしない)", () => {
    expect(css()).toMatch(/\.prose-body \{[\s\S]*?max-width: 34em;/);
  });

  it("**`balance` ではなく `pretty`**(あれは見出しのための物)", () => {
    expect(css()).toMatch(/\.prose-body \{[\s\S]*?text-wrap: pretty;/);
    expect(codeOnly(read("components/Prose.tsx"))).not.toMatch(/text-balance/);
  });

  it("地の文だけの節は沈めた面に載る", () => {
    expect(css()).toMatch(/\.prose-panel \{/);
    const card = codeOnly(read("components/WordCard.tsx"));
    expect((card.match(/<Prose panel /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("例文も追加例文と同じ面に載る(1つめだけ素の白地にしない)", () => {
    expect(codeOnly(read("components/WordCard.tsx"))).toMatch(
      /className="prose-body min-w-0 flex-1 text-body"/,
    );
  });

  it("印を付けた語の字形は学習言語から決める", () => {
    const prose = codeOnly(read("components/Prose.tsx"));
    expect(prose).not.toMatch(/lang="zh-Hant"/);
    expect(prose).toMatch(/<Term\s+key=\{j\}\s+lang=\{lang\}/);
  });
});

/** 使う場面の札（オーナー指示 2026-08-27 ⑤）。 */
describe("どこで出会うかは、整列した札で出す", () => {
  /**
   * オーナー指示 2026-08-28 ①。前は物理の輪で札の**位置そのもの**を
   * 飛ばしていたので、開くたびに並びが変わった。位置は整列に戻し、
   * 浮遊感は影・奥行き・揺れ・押した時の弾みで出す。
   */
  it("**位置を計算で飛ばさない**(並びが毎回変わらない)", () => {
    const view = codeOnly(read("components/SceneBubbles.tsx"));
    expect(view).not.toMatch(/stepBubbles|layoutBubbles|requestAnimationFrame/);
    expect(view).not.toMatch(/position:\s*absolute|className="absolute/);
    expect(fs.existsSync(path.join(root, "lib/bubble-physics.ts"))).toBe(false);
  });

  it("揺れ方は純粋な物に切り出してある(描き直しでちらつかない)", () => {
    expect(fs.existsSync(path.join(root, "lib/bubble-float.ts"))).toBe(true);
    expect(codeOnly(read("components/SceneBubbles.tsx"))).toMatch(/floatStyle\(b\.id, i\)/);
  });

  it("どの札を出すかも純粋な物に切り出してある", () => {
    expect(fs.existsSync(path.join(root, "lib/scene-bubbles.ts"))).toBe(true);
    expect(codeOnly(read("components/SceneBubbles.tsx"))).toMatch(/sceneGroups\(\{/);
  });

  it("**軸ごとに束ねて見出しを付ける**(同じ形で1列に並べない)", () => {
    const view = codeOnly(read("components/SceneBubbles.tsx"));
    expect(view).toMatch(/AXIS_KEY\[g\.axis\]/);
    for (const axis of ["limited", "where", "when", "scene", "trait", "feeling"]) {
      expect([axis, !!DICT[`card.axis.${axis}`]]).toEqual([axis, true]);
    }
  });

  it("**限定の札を作る**(extras に在るのに画面に出ていなかった2つ)", () => {
    const lib = codeOnly(read("lib/scene-bubbles.ts"));
    expect(lib).toMatch(/ex\.region_scope/);
    expect(lib).toMatch(/seasonOf\(ex\.season_months\)/);
    expect(DICT["card.limitedTo"].ja).toBe("{place}限定");
  });

  it("**理由の無い限定を通さない**(立扇に台湾限定が出た)", () => {
    const lib = codeOnly(read("lib/scene-bubbles.ts"));
    expect(lib).toMatch(/limitedRegion\(ex\.region_scope, ex\.region_scope_kind\)/);
    // 生成側も理由を訊いていること。片方だけ直すと、欄が永久に空になる。
    expect(read("lib/ai.functions.ts")).toMatch(/region_scope_kind/);
  });

  it("**札で言えるときは文章を出さない**(欄が2倍の高さにならない)", () => {
    const card = codeOnly(read("components/WordCard.tsx"));
    expect(card).toMatch(/bubbleCount === 0 && text && <Prose/);
    expect(card).toMatch(/const bubbleCount = sceneBubbles\(\{/);
  });

  it("動きを止めたい人には止めて出す", () => {
    // 揺れは CSS の animation なので、止めるのも CSS 側。
    expect(read("styles.css")).toMatch(/prefers-reduced-motion: reduce/);
    expect(read("styles.css")).toMatch(/\.scene-chip \{\s*\n\s*animation: none;/);
  });
});
