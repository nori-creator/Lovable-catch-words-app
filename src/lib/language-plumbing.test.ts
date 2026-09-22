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
    // main（2026-09-19）で切り抜きが機能ごと止まった（`CUTOUT_ENABLED`）。
    // 止めた事実はそのまま認めつつ、**元の写真が無ければ切り抜かない**
    // という条件が消えていないことは見続ける。
    expect(btns).toMatch(/const canCutout = CUTOUT_ENABLED && !!objectUrl;/);
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
    // `speechUrl(key)` が在れば、その場で鳴らす。**`??` の左が端末**
    // であることだけを見る（右側は main で `waitUntilEnded` の分岐が
    // 入ったので、中身まで文字で縛ると直しでないもので落ちる）。
    expect(hook).toMatch(/const url =\s*\n?\s*speechUrl\(key\) \?\?/);
    expect(hook).toMatch(/ensureAudio\(key, word, fetcher\)/);
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
    // 端末の声に落ちる所は main で `deviceVoice()`（`speak` を包んで
    // 鳴り終わりを待てるようにした関数）へ変わった。**待たずに端末へ
    // 落ちる**ことだけを見る。
    expect(hook).toMatch(
      /if \(speechState\(key\) === "failed"\) \{[\s\S]{0,300}?(speak\(word, language\)|deviceVoice\(\));/,
    );
    expect(hook).toMatch(/const deviceVoice = \(\) =>[\s\S]{0,400}?speak\(word, language/);
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
    // 並びは弱い語が上なので、切ると必ず「いちばん覚えている語」が消える。
    const src = codeOnly(read("routes/_authenticated/review.tsx"));
    expect(src).not.toMatch(/overview\.words\.slice\(/);
    // 並べ替えは挟むが、**数は減らさない**（`sort` は写しを作ってから）。
    expect(src).toMatch(/\[\.\.\.overview\.words\]\.sort\(compareByMemory\)\.map\(\(w\) =>/);
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
describe("2026-08-28 の指摘（並べ替え・絵文字・アルバム・アイコン）", () => {
  it("**並べ替えは右上に収まり、中で巻く**(⑤ 下の項目が画面外に出ていた)", () => {
    const panel = codeOnly(read("components/SectionsPanel.tsx"));
    // 画面の端から端まで伸ばさない。
    expect(panel).not.toMatch(/fixed left-0 right-0 top-\[52px\]/);
    expect(panel).toMatch(/fixed right-3 top-\[52px\][^"`]*w-72/);
    // 高さを切って中で巻く（18項目でも一番下に届く）。
    expect(panel).toMatch(/max-h-\[min\(60vh,26rem\)\] overflow-y-auto/);
    // **写しを作らない。** シート側は部品を呼ぶだけ。
    const sheet = codeOnly(read("components/StickerSheet.tsx"));
    expect(sheet).toMatch(/<SectionsPanel open=\{editing\}/);
    expect(sheet).not.toMatch(/max-h-\[min\(60vh,26rem\)\]/);
    // 絵にも映るようにしてある（この形は一度も撮られていなかった）。
    expect(fs.readFileSync(path.join(root, "..", "scripts/ui-audit.mjs"), "utf8")).toMatch(
      /"sections-panel"/,
    );
  });

  it("**復習モードに絵文字を付けない**(⑥)", () => {
    for (const k of ["settings.modeHybrid", "settings.modeSpeaking", "settings.modeChoice"]) {
      for (const l of ["ja", "en", "zh-TW"] as const) {
        expect([k, l, /\p{Extended_Pictographic}/u.test(DICT[k][l])]).toEqual([k, l, false]);
      }
    }
  });

  it("**アルバムの文字の札に紙を敷かない**(⑦ 2度目の指摘)", () => {
    const css = read("styles.css");
    const block = css.slice(css.indexOf(".album-note {"), css.indexOf(".photo-corner {"));
    expect(block).not.toMatch(/background:/);
    expect(block).not.toMatch(/box-shadow:/);
    // 下罫も引かない。
    expect(block).not.toMatch(/\.album-note::after/);
  });

  it("**節の目印は青い丸の部品に統一**(⑧ 絵文字を残さない)", () => {
    const card = codeOnly(read("components/WordCard.tsx"));
    expect(card).toMatch(/<SectionIcon id=\{id\} \/>/);
    expect(card).not.toMatch(/SECTION_ICON/);
    // 復習の4択も同じ丸。
    expect(codeOnly(read("routes/_authenticated/review.tsx"))).toMatch(
      /<BadgeIcon name=\{BADGE_ICON_NAME\.quiz\}/,
    );
  });
});

describe("型は「その語ならでは」だけにする（オーナー指示 2026-08-28 ③）", () => {
  /**
   * > 「「買う（買）」や好きのような、どの名詞にも使える汎用的な組み合わせでは、
   * >  実践的なスピーキング力は養えません。」
   *
   * 指示文と門の**両方**が要る。指示文だけだと守られない回が在り、
   * 門だけだと作り直すたびに落とす物を作り続けることになる。
   */
  it("返ってきた物を落とす門が在り、型の絞り込みが通っている", () => {
    expect(fs.existsSync(path.join(root, "lib/generic-chunks.ts"))).toBe(true);
    expect(codeOnly(read("lib/extras.ts"))).toMatch(/withoutGenericChunks\(/);
  });

  it("**生成と再生成が同じ指示文を使う**(片方だけ直すと作り直しで戻る)", () => {
    const src = codeOnly(read("lib/ai.functions.ts"));
    const uses = src.match(/specificChunkRule\(/g) ?? [];
    // 定義1つ + 使う所2つ。
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it("**型はレベルで変える**(両方の道でレベルを渡している)", () => {
    const src = codeOnly(read("lib/ai.functions.ts"));
    expect(src).toMatch(/specificChunkRule\(data\.headword, levelGoal\)/);
    expect(src).toMatch(/specificChunkRule\(head, regenLevelGoal\)/);
  });

  it("量詞はチャンクに出さない(2度目の指摘。門が残っている)", () => {
    expect(codeOnly(read("lib/extras.ts"))).toMatch(/withoutMeasureWords\(/);
  });
});

describe("どこで出会うかは、整列した札で出す", () => {
  /**
   * オーナー指示 2026-08-28 ①。前は物理の輪で札の**位置そのもの**を
   * 飛ばしていたので、開くたびに並びが変わった。位置は整列に戻し、
   * 奥行きは影と押した時の弾みで出し、読む間の常時アニメーションは使わない。
   */
  it("**位置を計算で飛ばさない**(並びが毎回変わらない)", () => {
    const view = codeOnly(read("components/SceneBubbles.tsx"));
    expect(view).not.toMatch(/stepBubbles|layoutBubbles|requestAnimationFrame/);
    expect(view).not.toMatch(/position:\s*absolute|className="absolute/);
    expect(fs.existsSync(path.join(root, "lib/bubble-physics.ts"))).toBe(false);
  });

  it("読む間に札を動かし続けない", () => {
    const view = codeOnly(read("components/SceneBubbles.tsx"));
    expect(view).not.toMatch(/floatStyle|--float-duration|--float-lift/);
    expect(codeOnly(read("styles.css"))).not.toMatch(/\.scene-chip\s*\{[^}]*animation:/s);
  });

  it("どの札を出すかも純粋な物に切り出してある", () => {
    expect(fs.existsSync(path.join(root, "lib/scene-bubbles.ts"))).toBe(true);
    expect(codeOnly(read("components/SceneBubbles.tsx"))).toMatch(/sceneGroups\(\{/);
  });

  /**
   * **見出しは付けない。束ねる計算は残す。**（オーナー決定 2026-09-15
   * 「今のままで見出しなくていい」）
   *
   * 2026-09-13 の合流で軸ごとの見出しが外れ、以来「戻すか1列のままか」を
   * 保留していた。**1列のまま**で確定。理由は画面の長さ — 軸ごとに全候補を
   * 並べるとスマホで何段にも膨らみ、その下にある意味と例文が遠くなる。
   *
   * ここで守るのは**束ねる計算のほう**。見出しを出していないからといって
   * `sceneGroups` を外すと、出す4件の選び方が `AXIS_ORDER`（限定 → どこで →
   * いつ → どんな場面で → どんな物か → どんな気持ちで）の優先順から
   * **ただの登場順**に落ちる。見た目は同じなので、落ちても誰も気づけない。
   */
  /**
   * **振動は iPhone でも鳴る。**（オーナー 2026-09-15「lovable で実行した」）
   *
   * それまでは `navigator.vibrate` だけを見ていた。あれは **Android の
   * ブラウザにしか無い** Web の機能で、iOS Safari には存在しない。つまり
   * アプリ内の `haptic()` 43箇所が iPhone では**エラーも出さずに無反応**
   * だった。`@capacitor/haptics` を入れて、殻の中では OS の触覚を直に叩く。
   *
   * ここで守るのは**落とし方**。
   *   ・殻の中か外かで分ける（外では今までどおり `navigator.vibrate`）
   *   ・触覚を**待たない**。鳴るのが遅れても画面を止めない
   *   ・失敗を握り潰す。OS 側で触覚を切っている人が居る
   * どれか1つでも外れると、「たまに画面が固まる」か「例外で落ちる」に化ける。
   */
  it("振動はネイティブでは Capacitor、ブラウザでは navigator.vibrate に落ちる", () => {
    const src = codeOnly(read("lib/haptics.ts"));
    expect(src).toMatch(/from "@capacitor\/haptics"/);
    expect(src).toMatch(/Capacitor\.isNativePlatform\(\)/);
    // 殻の中: 待たない・失敗は捨てる。
    expect(src).toMatch(/void nativeHaptic\(kind\)\.catch\(\(\) => \{\}\)/);
    // 殻の外: 昔の道が残っていること。
    expect(src).toMatch(/nav\.vibrate\(PATTERNS\[kind\]\)/);
    // 種類の取り違えが起きやすい所だけ名指しで確かめる。
    expect(src).toMatch(/Haptics\.selectionChanged\(\)/);
    expect(src).toMatch(/NotificationType\.Success/);
    // 設定で切っている人には、殻の中でも鳴らさない。
    //
    // **`indexOf` の -1 で門を素通しにしない。** 最初はここを
    // `indexOf(A) < indexOf(B)` とだけ書いていた。A の行を丸ごと消すと
    // `-1 < 正の数` で**真になってしまい**、わざと壊しても落ちなかった
    // （門の破壊確認でそう出た）。在ることを先に確かめる。
    const body = src.slice(src.indexOf("export function haptic("));
    const off = body.indexOf("if (!enabled) return;");
    const native = body.indexOf("isNative()");
    expect([off >= 0, native >= 0]).toEqual([true, true]);
    expect(off).toBeLessThan(native);
  });

  it("場面の札は見出しを付けず、順は軸の優先順で決まる", () => {
    const view = codeOnly(read("components/SceneBubbles.tsx"));
    // 束ねる計算は生きている。ここが順を決めている。
    expect(view).toMatch(/sceneGroups\(/);
    expect(view).toMatch(/groups\s*\.flatMap\(\(group\) => group\.items\)/);
    // 訳語は残す（戻すときに作り直さないで済む）。
    for (const axis of ["limited", "where", "when", "scene", "trait", "feeling"]) {
      expect([axis, !!DICT[`card.axis.${axis}`]]).toEqual([axis, true]);
    }
    // 見出しは出さない。
    expect(view).not.toMatch(/AXIS_KEY\[g\.axis\]/);
    // 優先順そのものが `lib` 側に在ること。
    expect(codeOnly(read("lib/scene-bubbles.ts"))).toMatch(
      /const AXIS_ORDER: readonly SceneAxis\[\] = \[\s*"limited",\s*"where",\s*"when",\s*"scene",\s*"trait",\s*"feeling",?\s*\]/,
    );
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

  it("動きを止めたい人には押下の変形も止めて出す", () => {
    expect(read("styles.css")).toMatch(/prefers-reduced-motion: reduce/);
    expect(read("styles.css")).toMatch(/\.scene-chip:active \{\s*\n\s*transform: none;/);
  });
});

/**
 * Lovable からの独立（オーナー指示 2026-08-31）。
 *
 * > 「ドメインも独自で取得したい。」
 *
 * 独自ドメインに移る日に、**1箇所でも lovable.app が残ると気づけない**。
 * canonical と og:url は画面に何も出さないので、目視では絶対に見つからない。
 * 検索エンジンだけが古い住所を見続ける。だから門で止める。
 */
describe("独自ドメインへ移れる形になっているか", () => {
  const ROUTES = [
    "routes/__root.tsx",
    "routes/auth.tsx",
    "routes/terms.tsx",
    "routes/privacy.tsx",
    "routes/sitemap[.]xml.ts",
    "routes/_authenticated/u.$userId.tsx",
    "routes/_authenticated/post.$postId.tsx",
  ];

  it("**画面のコードにドメインを直接書かない**（移った日に取り残しが出る）", () => {
    // **落ちた時にどのファイルか分かる形にする。** 一度
    // `expect([file, source]).not.toContain(...)` と書いたが、配列に対する
    // toContain は「要素そのもの」を探すので中の文字列を1文字も見ておらず、
    // わざと直書きに戻しても素通しした。門は落ちることを確かめてから信じる。
    const offenders = ROUTES.filter((file) => codeOnly(read(file)).includes("lovable.app"));
    expect(offenders).toEqual([]);
  });

  it("住所を出す所は必ず site-url を通している", () => {
    for (const file of ROUTES) {
      expect([file, read(file).includes('from "@/lib/site-url"')]).toEqual([file, true]);
    }
  });

  it("**未設定のときは今の住所を返す**（設定するまで出力は1文字も変わらない）", () => {
    expect(codeOnly(read("lib/site-url.ts"))).toContain(
      'FALLBACK_SITE_URL = "https://word-snap-journey.lovable.app"',
    );
  });
});

/**
 * キャッチの報酬演出（オーナー指示 2026-09-13）。
 *
 * > 「今画像が動くような軌跡がまったくない。動的に変更して。」
 * > 「図鑑に追加するボタンは画像のすぐ下に変更して。」
 *
 * ここで止めるのは、**絵を見ても原因が分からない**類の壊れ方だけ。
 */
/**
 * 指が当たる範囲（apple-design §11: 44×44 が下限）。
 *
 * 絵の検査は `getBoundingClientRect()` ではなく `elementFromPoint` で
 * **実際の当たり判定**を見るので、見た目を大きくせずに `::before` で
 * 広げるのが正しいやり方（`scripts/ui-audit.mjs` の注）。
 */
/**
 * ホームのアルバムを iPhone のホーム画面のように触る（オーナー指示 2026-09-13）。
 *
 * > 「ホームの画像長押ししたら、iPhone のアプリを長押しした時のように
 * >  画像が揺れてドラックしたら場所を変更できて、角を引っ張ったら
 * >  大きさを変更できるようにして。」
 */
/**
 * 指で自由に置く台紙（`ScrapbookAlbum`）だけを切り出す。
 *
 * ホームには時刻の道順（`DayTimeline`）も同じファイルに在るので、
 * 「台紙の作り」を見る門をファイル全体に掛けると、道順の側の正しい
 * 書き方まで禁じてしまう（実際 `aspectRatio` で落ちた）。
 */
function albumOnly(): string {
  const home = codeOnly(read("routes/_authenticated/home.tsx"));
  const a = home.indexOf("export function ScrapbookAlbum(");
  expect(a).toBeGreaterThan(-1);
  return home.slice(a);
}

describe("ホームのアルバムの長押し", () => {
  it("**長押しした指でそのまま掴める**（一度離して押し直させない）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const fn = home.slice(home.indexOf("function startPress("));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    // 長押しが成立した所で掴みを始めること。前は `onPointerDown` が
    // `editing` のときだけ掴んでいたので、長押しで編集に入った瞬間には
    // もう pointerdown が終わっており、押し直しが要った。
    // 長押しが成立した時点で握りを組み立てること。組み立てないと、
    // 編集に入った瞬間にはもう `pointerdown` が終わっており、押し直しが要る。
    expect(body).toMatch(/grip\.current = \{/);
    expect(body).toMatch(/pointers: new Map\(\[\[pointerId, at\]\]\)/);
  });

  it("**指の微動で長押しを取り消さない**（遊びを持たせる）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    // 1px で取り消す作りにすると、長押しがほとんど成立しない。
    expect(home).toMatch(/PRESS_SLOP = \d+/);
    expect(home).toMatch(/Math\.hypot\([^)]*\) > PRESS_SLOP/);
  });

  it("掴んだ札は指に付いてきて、**揺れは止まる**", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/album-lifted/);
    // 掴んでいる間は `live` が立ち、その札だけ持ち上がって見える。
    expect(home).toMatch(/live\?\.id === s\.id \? "album-lifted"/);
    // 掴んだ物がぐらついていると、指に付いてきているのか揺れているのか
    // 見分けが付かない。CSS 側で止める。
    const css = read("styles.css");
    expect(css).toMatch(/\.album-lifted \{[\s\S]{0,80}animation: none !important/);
  });

  it("**指が横取りされた回も必ず戻す**（通知や電話で固まらない）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/onPointerCancel=/);
  });

  it("揺れは札ごとに位相が違う（全部が同じ拍だと機械の表に見える）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/jiggleStyle\(s\.id\)/);
    const css = read("styles.css");
    // 前は `nth-child(2n)` の2種類だけだった。
    expect(css).not.toMatch(/\.album-editing:nth-child\(2n\)/);
    expect(css).toMatch(/var\(--jiggle-delay/);
  });

  it("**ブラウザ自前のドラッグを止める**（止めないと掴んだ瞬間に取り上げられる）", () => {
    // 押して動かすと Chromium は中の img を掴んで native drag を始め、
    // `pointercancel` を投げて**ポインタを取り上げる**。実測で、押して 4px
    // 動かしただけで長押しも掴みも丸ごと死んでいた。
    // `touch-action: none` では止まらない（あれはスクロールの話）。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/draggable=\{false\}/);
    expect(home).toMatch(/onDragStart=/);
  });

  /**
   * **升目をやめた。**（オーナー指示 2026-09-15）
   *
   * > 「ホームの画像長押ししたら下に縦横とか出てくるんだけど、そうではなく
   * >  直感的に写真を指で動かせて大きさをズームしたら大きくなるように。
   * >  また傾きも指で決めれるできるようにして。今はカクカクして…」
   *
   * 「カクカク」の正体は升目そのもの（S/縦/横/L の4通り）で、指をどれだけ
   * 滑らかに動かしても結果が4つに飛ぶ以上、滑らかになりようが無かった。
   * 下に出ていた「縦 / 横」のボタンは、連続で決められないことの埋め合わせ。
   */
  it("**下に出ていた「縦 / 横」のボタンが無い**（連続で決められるので要らない）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).not.toMatch(/ALBUM_SIZE_LABEL/);
    expect(home).not.toMatch(/\["small", "portrait", "landscape", "large"\] as const/);
    // 角のつまみも無い（つまんで広げるほうが手に合う）。
    expect(home).not.toMatch(/beginResize/);
  });

  it("**指2本で、大きさも傾きも連続で決まる**", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    // 触れている指を持ち回ること。1本ぶんしか持たないと、つまむ操作が
    // そもそも表現できない。
    expect(home).toMatch(/pointers: Map<number, Pt>/);
    expect(home).toMatch(/gestureDelta\(g\.startGrip, gripOf\(g\.pointers\)\)/);
    expect(home).toMatch(/applyDelta\(g\.startPlace, d, board\.w, boardH\)/);
  });

  it("**指の数が変わったら握りを取り直す**（2本目を置いた瞬間に札が飛ばない）", () => {
    // 取り直さないと「真ん中」が急に変わるので、札がワープする。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/function reseat\(place: Placement\)/);
    // 札の上で1本目を置いたとき / 台紙で2本目を足したとき / 1本離れたとき。
    expect(home).toMatch(/reseat\(place\)/);
    expect(home).toMatch(/reseat\(pendingPlace\.current \?\? g\.startPlace\)/);
    expect(home).toMatch(/reseat\(now\)/);
  });

  it("**1フレームに1回だけ描き直す**（これが「カクカク」のもう半分）", () => {
    // `pointermove` は1フレームに何度も来る。そのたびに state を変えると
    // 札の枚数ぶん描き直しが積み上がって、掴んだ物が指から遅れる。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/moveRafPlace\.current = requestAnimationFrame\(/);
  });

  it("**書き戻すのは指を離したときだけ**（動かしている最中は `live` に置く）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    // 動かしている最中に配列ごと作り直すと、札の枚数ぶん描き直しになる。
    expect(home).toMatch(/function commitPlace\(id: string, p: Placement\)/);
    // まっすぐへの吸い付きも、書き戻しも、全部の指が離れたときだけ。
    expect(home).toMatch(/if \(g\.moved\) commitPlace\(g\.id, settle\(now\)\)/);
  });

  it("**中心を軸に置く**（つまんで広げても掴んだ所が動かない）", () => {
    // 左上を基準にすると、大きくするたびに右下へ逃げる。
    // 中央合わせは `transform` ではなく `translate` で書く（すぐ下の門の理由）。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/translate: "-50% -50%"/);
  });

  /**
   * **CSS アニメーションの `transform` は、インラインの `transform` を
   * 丸ごと置き換える。**（2026-09-15 に実測で判明）
   *
   * 札は `translate(-50%,-50%)` で中央を合わせていたが、編集中の札には
   * 揺れ(`album-jiggle`)が掛かっていて、その `transform` が中央合わせを
   * 消していた。結果、**編集に入った瞬間に全部の札が自分の半分ぶん
   * 右下へずれる**（実測 41px, 51px ＝ちょうど幅と高さの半分）。
   *
   * しかも掴んだ札だけは `.album-lifted` で揺れが止まるので、触れた瞬間に
   * 元の位置へ戻る。2本目の指はもう札の無い所に落ちることになり、
   * **つまむ操作が一度も成立しなかった**（生のイベントを数えると
   * `down#4@DIV` ＝札ではない要素に当たっていた）。
   *
   * `translate` / `rotate` / `scale` を個別に書けば、揺れの `transform` は
   * その後ろに重なるので喧嘩しない。
   */
  it("**札の置き方を `transform` で書かない**（揺れに上書きされる）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const style = home.slice(home.indexOf("left: `${place.x * 100}%`"));
    const block = style.slice(0, 900);
    expect(block).toMatch(/translate: "-50% -50%"/);
    expect(block).toMatch(/rotate: `\$\{place\.rot\}deg`/);
    // ここに `transform:` が戻ると、また揺れに消される。
    expect(block).not.toMatch(/transform:/);
  });

  it("**2本目の指は台紙のどこに置いても効く**（札の上を要求しない）", () => {
    // 札は 88px ほどしかないうえ、動かすと別の札に重なる。札の上だけで
    // 受けると、重なった回に上の札へ当たって弾かれる（実測で確認）。
    //
    // **切り出す終わりを「そこに無い語」で決めない。** ここは
    // `indexOf("aspectRatio")` で終わりを取っていた。無ければ `-1` が
    // 返り、`slice(a, -1)` は「最後の1文字まで」になるので**たまたま
    // 通っていた**。ホームに時刻の道順（`DayTimeline`）が入って
    // `aspectRatio` がこの台紙より**前**に現れた日、同じ式が空文字を
    // 返して門が落ちた。台紙そのもので切り出す。
    const board = albumOnly().slice(albumOnly().indexOf("ref={boardRef}"));
    expect(board).toMatch(/onPointerDown=/);
    expect(board).toMatch(/g\.pointers\.set\(e\.pointerId/);
  });

  it("**掴み取り(`setPointerCapture`)は使わない**（2本目が handler に来なくなる）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).not.toMatch(/setPointerCapture/);
    // 代わりに窓で受ける。指が札の外へ出ても続く。
    expect(home).toMatch(/window\.addEventListener\("pointermove", move\)/);
  });

  /**
   * **台紙の高さは中身から決める。**（オーナー報告 2026-09-15「デフォルトで
   * 表示するのは今までと同じ大きさにして」を直す過程で入れ替えた）
   *
   * 形を決め打ちにすると、札が増えた日に下がはみ出すか、少ない日に紙が
   * 余りすぎる。かといって高さを可変にすると、縦位置を「高さに対する割合」で
   * 持っている限り、**紙が伸びるたびに置いた札が全部動く**。だから縦も
   * 台紙の**幅**で測る。幅は変わらないので、紙が縦に伸びても札は動かない。
   */
  /**
   * **直した置き方を、保存の往復より先に捨てない。**（オーナー報告 2026-09-15
   * 「画像を大きくしたり、サイズを変えても結局元に戻る」）
   *
   * 表から届いた札を並べ直す effect の合図に `editing` が入っていた。
   * 「完了」を押して `editing` が false になった**その瞬間**にこれが走り、
   * まだ表に届いていない古い `stickers` で `ordered` を上書きしていた。
   * つまり指で直した置き方は、**表の列が在っても無くても 100% 元に戻る**。
   */
  it("**「完了」で置き方を捨てない**（合図に `editing` を入れない）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const eff = home.slice(home.indexOf("    setOrdered(\n      [...stickers].sort("));
    const deps = eff.slice(0, 600);
    // 合図は `stickers` だけ。`[stickers, editing]` に戻すと元の不具合に戻る。
    expect(deps).toMatch(/\}, \[stickers\]\);/);
    expect(deps).not.toMatch(/\}, \[stickers, editing\]\);/);
  });

  it("保存できたら表から読み直す / 列がまだ無いならそう言う", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const fn = home.slice(home.indexOf("function finishEditing()"));
    const body = fn.slice(0, 900);
    // 読み直さないと、次に組み直したとき古い値で描かれる。
    expect(body).toMatch(/invalidateQueries\(\{ queryKey: \["stickers"\] \}\)/);
    // 黙って諦めない（原因が誰にも分からなくなる）。
    expect(body).toMatch(/res\.placement === false/);
    expect(body).toMatch(/home\.placementNotSaved/);
  });

  /**
   * **伸びても角の丸みが変わらない。**（オーナー指摘 2026-09-15
   * 「青い形がバランス悪い」／参照は App Store の iOS 26 のタブ）
   *
   * `scaleX` で伸ばすと両端の丸が横に潰れて楕円になる。参照を止めて見ると、
   * 印は伸びている最中も角の丸みがまったく変わらない角丸の長方形で、
   * 伸びるのは真ん中の直線部分だけ。
   */
  it("**タブの印は `scaleX` で伸ばさない**（角の丸みが潰れる）", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    expect(src).not.toMatch(/scaleX\(/);
    // 幅そのものを動かす。
    expect(src).toMatch(/el\.style\.width = `\$\{Math\.max\(r - l, 1\)\}px`/);
    // 丸みは高さから決めるので、幅が変わっても変わらない。
    expect(src).toMatch(/el\.style\.borderRadius = `\$\{el\.offsetHeight \* radiusRatio\}px`/);
    // `rounded-full` が戻ると、また楕円になる。
    expect(src).not.toMatch(/rounded-full/);
  });

  /**
   * **枠の形を写真に合わせる。**（オーナー報告 2026-09-15「横長だと元の
   * 取った画像の上や下が見切れてる部分がある」）
   *
   * 札の形を升目から決め、写真を `object-cover` で流し込んでいたので、
   * **形が合わない写真は必ず切られていた**。枠のほうを写真に合わせれば
   * 切る所が無くなり、大きさを変えれば写真全体がそのまま大きくなる。
   * 横幅は升目のまま（並びの律動は保つ）で、高さだけが写真に従う。
   */
  it("**枠の縦横の比は、写真そのものから取る**（上下が切れない）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/naturalHeight \/ img\.naturalWidth/);
    // 写真がまだ読めていない札は升目の比に倒す（枠が消えない）。
    expect(home).toMatch(/photoRatio\[s\.id\] \?\? ratioOf\(sizes\[i\]\)/);
  });

  /**
   * **後から触った札が上。**（オーナー指示 2026-09-15「後から画像と画像を
   * 重ねた場合は、後から重ねた部分を上に表示するようにして」）
   *
   * 重なりは並び順がそのまま持つので、`album_order` として保存され、
   * 次に開いても同じ重なりで出る。
   */
  it("**触った札を並びの最後（＝最前面）へ送る**", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const fn = home.slice(
      home.indexOf("function commitPlace"),
      home.indexOf("function commitPlace") + 700,
    );
    expect(fn).toMatch(/return \[\.\.\.rest, moved\]/);
    // 重なりは並び順そのもの。`i % 5` のような繰り返しに戻すと、
    // 何番目に触ったかが重なりに出なくなる。
    expect(home).toMatch(/z: 10 \+ i,/);
    expect(home).not.toMatch(/z: 10 \+ \(i % 5\)/);
  });

  it("**自動の置き場所は「触った順」で変わらない**（関係ない札が動かない）", () => {
    // 重なりのために並びを入れ替えるので、置き場所をそちらで決めると
    // 触っていない札まで升目が繰り上がって動く。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const memo = home.slice(
      home.indexOf("const autoById = useMemo"),
      home.indexOf("const autoById = useMemo") + 900,
    );
    expect(memo).toMatch(/\[\.\.\.stickers\]/);
    expect(memo).toMatch(/\}, \[stickers\]\);/);
  });

  /**
   * **答え合わせで選択肢を押し込まない。**（オーナー報告 2026-09-15
   * 「単語復習すると注音が潰れて見える」）
   *
   * `grid-rows-4` で残りの高さを4等分していたので、答え合わせの面が出て
   * 札が縮むと、1行が2行（語＋注音）より小さくなり**注音が語に重なる**。
   * 声調記号は台湾華語でいちばん間違えやすい所なので、実害。
   */
  it("復習の選択肢は、高さで押し込まない（注音が潰れる）", () => {
    const rv = codeOnly(read("routes/_authenticated/review.tsx"));
    // 等分に押し込む古い形が残っていないこと。
    expect(rv).not.toMatch(/grid-rows-4/);
    /**
     * **4つが必ず画面に収まる。**（オーナー報告 2026-09-16
     * 「復習の4択スクロールしないと4択が全て見れないようになってる」）
     *
     * 前は写真が `clamp(5rem, 24vh, 14rem)` の固定の高さを先に取り、
     * 選択肢が残りを等分していた。**画面が低いと写真が場所を取り切って
     * 4つ目が外へ出る**（実測: 写真のある札は 800px 未満で必ず溢れ、
     * 568px では1つしか見えなかった）。
     *
     * 順番を逆にする。選ぶ物が先に取り（1つ 3〜4.25rem）、写真は
     * **残った分だけ**もらう（`flex-1` ＋ `min-h-0`）。実測で 568px
     * （iPhone SE）から上は写真の有無にかかわらず 4/4 が収まる。
     */
    expect(rv).toMatch(/minmax\(3rem, 4\.25rem\)/);
    expect(rv).toMatch(/grid min-h-0 gap-1\.5 overflow-y-auto/);
    // 写真は余りを受け取る側（先に高さを取らない）。
    expect(rv).toMatch(/quiz-photo mb-1\.5 min-h-0 w-full flex-1/);
    expect(rv).not.toMatch(/clamp\(5rem,24vh,14rem\)/);
    /**
     * 低い画面では写真を出さない。余りを受け取る形だと、画面が低いほど
     * 写真は薄く潰れる（実測 667px で 32px ＝ 上端の帯だけ）。意味を
     * 持てない高さしか渡せないなら出さないほうが正直。
     */
    const css = read("styles.css");
    expect(css).toMatch(/@media \(max-height: 700px\)/);
    const q = css.slice(css.indexOf("@media (max-height: 700px)"));
    expect(q.slice(0, 120)).toMatch(/\.quiz-photo/);
    expect(q.slice(0, 160)).toMatch(/display: none/);
  });

  it("解説が無い語でも、答え合わせを空にしない", () => {
    // 仕組みは在って呼ばれてもいたのに、`explain` も `top_chunk` も無い語で
    // `null` を返していたので「語 ＋ 読み ＋ 次へ」だけになっていた。
    const rv = codeOnly(read("routes/_authenticated/review.tsx"));
    const fn = rv.slice(rv.indexOf("export function AnswerExplain"));
    const fallback = fn.slice(0, fn.indexOf('return (\n    <div className="mb-1 max-h-'));
    expect(fallback).toMatch(/card\.meaning_ja/);
    expect(fallback).toMatch(/card\.example_sentence/);
  });

  it("**台紙の高さは中身から決まる**（縦は幅で測るので、伸びても札は動かない）", () => {
    // **この門は台紙（`ScrapbookAlbum`）の話**なので、ファイル全体では
    // なくその関数だけを見る。同じファイルに在る時刻の道順
    // （`DayTimeline`）は写真の比を `aspectRatio` で持つのが正しく、
    // ファイル全体で禁じると、関係のない所を直せなくなる。
    const album = albumOnly();
    expect(album).toMatch(/const boardH = useMemo\(\(\) => boardHeight\(items\)/);
    expect(album).toMatch(/height: board\.w \? `\$\{board\.w \* boardH\}px`/);
    // 決め打ちの形に戻っていないこと。
    expect(album).not.toMatch(/aspectRatio:/);
    expect(album).toMatch(/ResizeObserver/);
  });
});

describe("小さいボタンの当たり判定", () => {
  it("**広げる理由は大きさ。見た目の種類に紐付けない**", () => {
    const src = codeOnly(read("components/PronounceButton.tsx"));
    // 前は `tone === "quiet"` の中に書かれていて、理由は大きさなのに
    // 見た目の種類に付いていた。だから `tone="hero" size="sm"`(復習の発音)が
    // 36px のまま素通りし、絵の検査で
    // `タップ領域 36x36 < 44 — "雨傘的發音"` として出た。
    // 整形で改行が入るので、行をまたいで見る。
    expect(src).toMatch(/const reach =[\s\S]{0,40}size === "sm"/);
    expect(src).toMatch(/\$\{reach\}/);
    // 広げの指定が tone の分岐に戻っていないこと。
    const skin = src.slice(src.indexOf("const skin ="), src.indexOf("const icon ="));
    expect(skin).not.toMatch(/before:/);
  });

  it("図鑑の表示切替は、隙間が当たり判定と噛み合っている", () => {
    const dex = codeOnly(read("routes/_authenticated/dex.tsx"));
    // **`gap-` の手前から切る。** 一度 `rounded-full bg-secondary p-1` を
    // 目印にしたら、その位置は `gap-2` より後ろなので、探している物が
    // 窓の中に一度も入らず落ちた（門が広さではなく位置を間違えていた）。
    // **終わりは開始位置から先を探す。** `indexOf("</button>")` を素で
    // 呼んだら、ファイルのもっと手前に在る別のボタンに当たって、
    // 開始より小さい位置が返り、窓が空になった（空文字は何にも一致しない
    // ので、門は「壊れている」ではなく「落ちる」形で嘘をつく）。
    const from = dex.indexOf("flex shrink-0 gap-");
    const head = dex.slice(from, dex.indexOf("</button>", from));
    // 36px の丸 + 8px の隙間 = 44px ちょうど。隙間が 4px に戻ると、
    // 隣の当たり判定と 2px ずつ重なって端を押したとき隣が反応する。
    expect(head).toMatch(/gap-2 rounded-full bg-secondary/);
    expect(head).toMatch(/before:-inset-1 before:content-\[''\]/);
  });
});

describe("キャッチの報酬演出", () => {
  // 以下3つは `v5_physics.ts` への門。**この版はいま動く経路に繋がっていない**
  // (2026-09-13 の合流で Lovable の `v5_reward` を採った)。それでも門は残す —
  // 繋ぎ直す日に、この性質が崩れていないことを確かめられる。
  it("**演出はばねで動かす**（CSS transition では速度が幕ごとに0に戻る）", () => {
    const v5 = codeOnly(read("components/effects/catch-landing/v5_physics.ts"));
    expect(v5).toMatch(/createSpring/);
    // **飛行の部分だけを見る。** 最初はファイル全体を見ていて、隣のセルを
    // 90ms 小突く transition に当たって落ちた。あれは飛行ではないので、
    // 落とすべきではなかった（門が広すぎると、正しいコードを直させる）。
    const flight = v5.slice(0, v5.indexOf("export function rippleNeighbors"));
    expect(flight).not.toMatch(/style\.transition\s*=\s*["`]transform/);
  });

  /**
   * **押した画面をそのまま残す**（オーナー指示 2026-09-13 / 直した日 同日）。
   *
   * > 「該当の画面のなかの**画像だけ**が動き出し」
   *
   * 前は `setStep("saving")` でカードの画面が丸ごと黒い覆いに差し替わり、
   * そこに置かれた**別の大きさの写真のコピー**(`w-64`)から飛んでいた。
   * 画面が変わってから別の絵が動くので、同じ物が動いたようには見えない。
   *
   * **文字で入れた語だけは例外。** 飛ぶ写真が無いので待つ面を出す。
   * だから「`setStep("saving")` を使わない」ではなく
   * 「**写真が無いときにしか使わない**」が守るべき形。
   */
  it("写真が在るときは画面を差し替えない（その場の写真から飛ばす）", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    const fn = cap.slice(cap.indexOf("async function handleSave()"));
    const body = fn.slice(0, fn.indexOf("\n  }\n"));
    // 飛ぶ枠は、いま画面に出ているカードの写真。
    expect(cap).toMatch(/heroBoxRef=\{heroBoxRef\}/);
    // 差し替えは**写真が無い経路の中だけ**。
    expect(body).toMatch(/if \(!hero\) \{[\s\S]{0,200}?setStep\("saving"\)/);
    expect(body.match(/setStep\("saving"\)/g) ?? []).toHaveLength(1);
  });

  /**
   * **保存の通信と演出が並走する**（同上）。
   *
   * 前は保存を `await` してから演出を始めていたので、押してから絵が動き
   * 出すまでに回線しだいで1〜3秒の無音があった。いまは押した瞬間に
   * 演出が始まり、**見せ場の1秒が通信を待つ関所**を兼ねる。
   */
  it("保存を待たずに演出を始め、見せ場の1秒が通信を待つ", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/const savePromise = doSave\(/);
    // **飲み込んで渡さない。** 転んだら演出側が受け渡しへ進まず畳む。
    expect(cap).toMatch(/gate: savePromise,/);
    const reward = codeOnly(read("components/effects/catch-landing/v5_reward.ts"));
    expect(reward).toMatch(/await gate;/);
  });

  it("**飛び立つ寸法は枠ではなく絵そのもの**（枠で測ると離陸の瞬間に跳ねる）", () => {
    // カードの箱には `p-6` の余白と縁が付いている。箱で測ると
    // `object-contain` が写真を箱いっぱいに広げ、16% ほど大きくなる。
    const reward = codeOnly(read("components/effects/catch-landing/v5_reward.ts"));
    expect(reward).toMatch(/startEl\.querySelector\("img"\) \?\? startEl/);
  });

  it("**札の id は後から読む**（飛び始めた時点ではまだ決まっていない）", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/getDestinationId: \(\) => savedId/);
    const reward = codeOnly(read("components/effects/catch-landing/v5_reward.ts"));
    // 冒頭で分解した値を持ち回ると、後から届いた id が永久に見えない。
    expect(reward).toMatch(/getDestinationId\?\.\(\) \?\? destinationId/);
  });

  it("**音と単語は拡大率のフレーム判定で出す**（時間で待つと回ごとにずれる）", () => {
    const v5 = codeOnly(read("components/effects/catch-landing/v5_physics.ts"));
    expect(v5).toMatch(/shouldSpeak\(s, target\.scale\)/);
  });

  it("図鑑に追加のボタンが**画像のすぐ下**に在る（解説カードより前）", () => {
    // オーナー指示①(2026-09-13)。前は解説カードと一言の欄の下、画面の底に
    // あったので、いちばんやる操作のために毎回スクロールさせていた。
    const cap = read("routes/_authenticated/capture.tsx");
    const panel = cap.slice(cap.indexOf("export function CaptureCardPanel"));
    const cta = panel.indexOf('t("capture.addToDex")');
    const wordCard = panel.indexOf("<WordCard");
    expect(cta).toBeGreaterThan(0);
    expect(wordCard).toBeGreaterThan(0);
    expect(cta).toBeLessThan(wordCard); // 解説カードより前 = 画像側に在る
  });

  it("動きを減らす人にも**単語と読みは出す**（移動を省くのは動きだけ）", () => {
    const v5 = codeOnly(read("components/effects/catch-landing/v5_physics.ts"));
    const branch = v5.slice(v5.indexOf("reducedMotion ||"), v5.indexOf("const vw ="));
    expect(branch).toMatch(/speakLine/);
    expect(branch).toMatch(/opacity = "1"/);
  });

  /**
   * ここから下は**いま動いている** `v5_reward.ts` への門。
   *
   * 上の3つが見ている `v5_physics.ts` は経路に繋がっていないので、
   * あちらが全部緑でも実機は守られない。動く側にも門を置く。
   *
   * ## 何を止めるか
   * この演出は、図鑑へ渡すあいだだけ3つの物を**借りる**:
   *   `handoff`(body に直接足した複製) / `<html data-reward-flight>` /
   *   図鑑のセルの `visibility:hidden`。
   * どれも React の管理外なので、返さずに抜けると**再読み込みまで
   * 直らない**。いちばん重いのは3つ目 —
   * **いま捕まえた語だけが図鑑で見えない**。
   *
   * 絵では絶対に分からない壊れ方なので、構造で止める。
   */
  it("**借りた物は、どの経路で抜けても返す**（借りた直後から try で包む）", () => {
    const v5 = codeOnly(read("components/effects/catch-landing/v5_reward.ts"));

    const borrow = v5.indexOf("document.body.appendChild(handoff)");
    expect(borrow).toBeGreaterThan(0);

    // 借りた直後に try が来ること。あいだに `await` が挟まると、
    // その `await` で落ちた回だけ借りたまま抜ける。
    const tryAt = v5.indexOf("try {", borrow);
    expect(tryAt).toBeGreaterThan(borrow);
    expect(v5.slice(borrow, tryAt)).not.toMatch(/\bawait\b/);

    // 後始末は最後の finally の中だけ。
    const finallyAt = v5.lastIndexOf("} finally {");
    expect(finallyAt).toBeGreaterThan(tryAt);
    for (const line of [
      'hiddenCell.style.visibility = ""',
      "handoff.remove()",
      "delete document.documentElement.dataset.rewardFlight",
    ]) {
      expect(v5.indexOf(line)).toBeGreaterThan(finallyAt);
    }
  });

  /**
   * 復習4択の答え合わせの面が、**画面**に貼り付いていること。
   *
   * ## 何が起きていたか
   * この面は `SwipeCard` の中に在り、`SwipeCard` は指で運ぶために
   * `will-change: transform` を立てている。CSS では `transform` と同じく
   * `will-change: transform` も **`position: fixed` の基準をビューポートから
   * その要素へ移す**。だから「画面の下端から 4.5rem」のつもりの面が
   * 「**カードの下端**から 4.5rem」に降り、4つ目の選択肢を覆っていた。
   *
   * 実測(画面 844px):
   *   直す前 … 面の下端 660 / 4つ目 436〜507 → 59px 潜る
   *   直した後 … 面の下端 772(画面基準) / 4つ目との間に 53px
   *
   * ## なぜ絵で見つからなかったか
   * `SwipeCard` の `enabled` は `!!picked`。**答えた瞬間に基準が変わる**ので、
   * 押す前の絵は正しく、押した後だけ狂う。roadmap で2回「直した」ことに
   * なっているのに直っていなかったのはこれで、逃げ場(`panelH`)の計算は
   * 最初から合っていた — 違ったのは基準。
   *
   * 絵の検査(`ui:audit`)も8場面で見つけたが、そちらは10分かかる。
   * 秒で落ちる側にも置く。
   */
  it("答え合わせの面は**画面**に貼り付く（運ぶカードの中では fixed が効かない）", () => {
    const rv = codeOnly(read("routes/_authenticated/review.tsx"));
    const panel = rv.indexOf("bottom-[calc(4.5rem+env(safe-area-inset-bottom))]");
    expect(panel).toBeGreaterThan(0);
    // 面より前に `createPortal(` が在ること = 画面直下へ出している。
    const portal = rv.lastIndexOf("createPortal(", panel);
    expect(portal).toBeGreaterThan(0);
    // あいだに `</` が無い = 同じ塊。間に別の要素が挟まると門が嘘になる。
    expect(rv.slice(portal, panel)).not.toMatch(/<\//);
    expect(rv).toMatch(/document\.body,/);
  });

  /**
   * テーマは**最初の1枚**から正しい色で描く。
   *
   * `.dark` は `ThemeProvider` の `useEffect` でしか付いていなかった。
   * 効くのは水和が終わってからなので、それまでの絵は明るい地のまま描かれる。
   * 既定は dark なので、ほぼ全員が読み込みのたびに「白く光ってから暗くなる」
   * を見ていた(実測: 開発サーバで最初の描画 55ms 〜 1531ms のあいだずっと
   * 明るいまま)。本番は水和が速いぶん短くなるだけで、**効く時刻が水和に
   * 結びついている限り、間に合わない絵は必ず出る**。
   *
   * `<head>` の描画前スクリプトで同期的に当てるのが昔から決まった直し方。
   * 消されたら気づけるように門を置く。
   */
  it("テーマを**描画前**に当てている（`useEffect` だけだと最初の1枚が明るい）", () => {
    const root = codeOnly(read("routes/__root.tsx"));
    const scripts = root.indexOf("scripts: [");
    expect(scripts).toBeGreaterThan(0);
    // `<head>` の中で `classList.toggle("dark", …)` を同期的に呼んでいること。
    expect(root.slice(scripts)).toMatch(/documentElement\.classList\.toggle\("dark"/);
    // 鍵と既定は `theme-provider.tsx` から埋め込む。**手で書くとずれる** —
    // ずれた瞬間、最初の1枚だけ色が違う画面に戻る。
    expect(root).toMatch(/THEME_STORAGE_KEY/);
    expect(root).toMatch(/DEFAULT_THEME/);
  });

  it("サーバ側の既定と、実際の既定が一致している", () => {
    // `resolve()` の `typeof window === "undefined"` の枝が "light" 固定
    // だった。既定が dark なのに、サーバが描く最初の絵は明るい —
    // 食い違いを自分で作っていた。
    const tp = codeOnly(read("components/theme-provider.tsx"));
    expect(tp).toMatch(/export const DEFAULT_THEME/);
    const serverBranch = tp.slice(tp.indexOf('typeof window === "undefined"'));
    expect(serverBranch.slice(0, 120)).toMatch(/resolve\(DEFAULT_THEME\)/);
  });

  /**
   * 動きの曲線と、その出所。
   *
   * ## なぜ門にするか
   * Web Animations API は easing に CSS 変数を取れないので、`v5_reward.ts` は
   * `--ease-ios` と**同じ値を二重に書いている**。二重に書いた値は必ずずれる。
   * ずれても絵は出るので、気づくのは「同じ動きなのに場所によって曲線が違う」
   * と誰かが感じたときになる — それは数の側でしか止められない。
   */
  it("`.animate()` に easing が必ず指定されている（linear は等速＝物理的にありえない）", () => {
    const v5 = codeOnly(read("components/effects/catch-landing/v5_reward.ts"));
    // `.animate(` の数だけ、options に easing が要る。以前は9本中3本が
    // 未指定で、既定の linear で動いていた(下へ 14px 逃げる一言も含む)。
    const calls = v5.match(/\.animate\(/g) ?? [];
    const easings = v5.match(/easing:/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(easings.length).toBeGreaterThanOrEqual(calls.length);
  });

  it("WAAPI 側の曲線が `--ease-ios` と同じ値（二重に書いた値はずれる）", () => {
    const v5 = codeOnly(read("components/effects/catch-landing/v5_reward.ts"));
    const css = read("styles.css");
    const inTs = v5.match(/const EASE_IOS = "([^"]+)"/);
    expect(inTs).not.toBeNull();
    const inCss = css.match(/--ease-ios:\s*([^;]+);/);
    expect(inCss).not.toBeNull();
    // 空白の入れ方だけ違うことがあるので、空白を潰して比べる。
    const norm = (v: string) => v.replace(/\s+/g, "");
    expect(norm(inTs![1])).toBe(norm(inCss![1]));
  });

  it("`--font-word` のような**未定義の変数を使っていない**", () => {
    // `.reward-catch__word` が `var(--font-word)` を参照していたが、
    // 定義はアプリ全体に0件だった。この画面でいちばん大きい字——捕まえた
    // 語そのもの——が無指定の継承フォントに落ちていた。
    const css = read("styles.css");
    const used = new Set([...css.matchAll(/var\((--font-[a-z-]+)/g)].map((m) => m[1]));
    for (const name of used) {
      expect([name, new RegExp(`${name}:`).test(css)]).toEqual([name, true]);
    }
  });

  /**
   * 覆っている面は、指で下へ払って閉じられる。
   *
   * ## なぜ門にするか
   * この app の「シート」4本はどれも `fixed inset-0` の全画面の面で、
   * **掴む余地が無かった** — ドラッグで閉じる・つまみ・引いたときの抵抗、
   * どれも 0。iOS で覆いが出たとき人がまずやるのは「下へ払う」ことなので、
   * そこに何も起きないと、その面は貼り付いているように感じる。
   *
   * 絵の検査ではここを見られない。`sheet` の場面は**シートの外枠を手で
   * 複製している**ので(本物の `StickerSheet` を描いていない)、本物を直しても
   * あの絵は変わらない。動きなので、そもそも静止画には映らない。
   */
  const SHEETS = [
    "components/ScanDetailSheet.tsx",
    "components/InputCatchSheet.tsx",
    "components/StickerSheet.tsx",
    "components/ScanCatchSheet.tsx",
  ];

  it("**4本すべてが**下へ引いて閉じられる（掴む余地がある）", () => {
    for (const f of SHEETS) {
      const src = codeOnly(read(f));
      expect([f, /useDragDismiss\(/.test(src)]).toEqual([f, true]);
      // 面そのものに付いていること。内側の箱に付けると、面は動かない。
      expect([f, /\{\.\.\.dragProps\}/.test(src)]).toEqual([f, true]);
      // つまみが出ること。機能があっても、見えなければ発見されない。
      expect([f, /\{grabber &&/.test(src)]).toEqual([f, true]);
    }
  });

  it("動きを減らす設定の人には**掴ませない**（掴めるが動かない、が一番分かりにくい）", () => {
    for (const f of SHEETS) {
      const src = codeOnly(read(f));
      expect([f, /enabled: !reducedMotionForDrag/.test(src)]).toEqual([f, true]);
    }
  });

  /**
   * `material-in` は 100% の keyframe を持ち続けてはいけない。
   *
   * `both` は `forwards` を含むので、終わったあとも keyframe が `transform` を
   * 握り続ける。CSS アニメーションはインライン style より強いので、
   * **この class が付いた面は二度と transform を動かせなくなる** —
   * 指で引いても値は書けているのに画面は動かない、という形で出る
   * (実際そうなり、`getComputedStyle` が単位行列を返して初めて分かった)。
   */
  it("`material-in` が終わったあと transform を手放す（`forwards` にしない）", () => {
    // **`animation:` の行だけを見る。** 規則の塊ごと見ると、この決定の
    // 経緯を書いた注釈に出てくる "both" / "forwards" の字を拾って落ちる
    // (実際落ちた)。`codeOnly` は行頭が `*` `//` `/*` の行しか落とさないので、
    // 和文で字下げした継続行は残る — CSS 側の注釈には効かない。
    const css = read("styles.css");
    const rule = css.slice(css.indexOf(".material-in {"));
    const decl = rule.slice(0, rule.indexOf("}"));
    const line = decl.split("\n").find((l) => /^\s*animation:/.test(l));
    expect(line).toBeDefined();
    expect(line!).toMatch(/material-in/);
    // `both` は `forwards` を含む。どちらも 100% の keyframe を持ち続ける。
    expect(line!).not.toMatch(/\b(both|forwards)\b/);
  });

  /**
   * すりガラスの接頭辞は**つき が先、標準が後**。
   *
   * 逆に書くと、ミニファイア(Lightning CSS)が標準側を落として `-webkit-` だけを
   * 残す。ビルド後のCSSを読んで初めて分かる類の壊れ方で、**ソースを見ている
   * 限り正しく見える**。
   *
   * 実害があった: 透明度を下げる設定のときにガラスを消す規則が
   * `-webkit-backdrop-filter` だけになっていて、標準側を読む Chrome /
   * Android / Safari 18+ では**一度も効いていなかった**。
   * (ブラウザで測ると、直す前は設定を入れてもガラス 2面が残り、
   *  直した後は 0面になる。)
   */
  it("`backdrop-filter` は接頭辞つきを先に書く（逆だと標準側が消える）", () => {
    for (const file of ["styles.css", "pack-styles.css"]) {
      const css = read(file);
      const lines = css.split("\n");
      const wrong: string[] = [];
      for (let i = 0; i < lines.length - 1; i++) {
        // 標準 → 接頭辞つき の並びが出たら、その規則は畳まれる側。
        if (
          /^\s*backdrop-filter\s*:/.test(lines[i]) &&
          /^\s*-webkit-backdrop-filter\s*:/.test(lines[i + 1])
        ) {
          wrong.push(`${file}:${i + 1}`);
        }
      }
      expect([file, wrong]).toEqual([file, []]);
    }
  });

  /**
   * すりガラスは**段のクラスだけ**が持つ。
   *
   * 直す前は blur の強さが 10 種類・地の不透明度が 13 種類に散っていて、
   * 同じ役割のシートでも 80% / 95% / 97% が混ざっていた。さらに
   * `backdrop-saturate` が付いていたのは **33 箇所中 1 箇所だけ** —
   * Apple の material は blur と saturate が対で、上げ直さないと後ろの色が
   * 灰色に濁る。
   *
   * 地が `--background` / `--card` の面(= 手前の chrome)は段に寄せた。
   * 写真の上の黒い暗幕(`bg-black/NN`)は別物なので、ここでは見ない。
   */
  it("地が背景色のガラスは、段のクラスで持つ（値を散らさない）", () => {
    const files = [
      "components/AppShell.tsx",
      "components/ScanDetailSheet.tsx",
      "components/InputCatchSheet.tsx",
      "components/StickerSheet.tsx",
      "components/DexShelf.tsx",
      "components/SectionsPanel.tsx",
      "routes/_authenticated/scan.tsx",
      "routes/_authenticated/feed.tsx",
      "routes/_authenticated/post.$postId.tsx",
    ];
    const stray: string[] = [];
    for (const f of files) {
      for (const line of codeOnly(read(f)).split("\n")) {
        if (!/backdrop-blur/.test(line)) continue;
        if (/bg-(background|card)\//.test(line)) stray.push(`${f}: ${line.trim().slice(0, 70)}`);
      }
    }
    expect(stray).toEqual([]);
  });

  /**
   * 下のタブの印は、**伸びて遅れて追いつく**。
   *
   * オーナーが参照として渡した動き(MovinDesign / @MiruDaws の
   * "gooey liquid glass tab bar, the icons stretching and merging")を、
   * 録画をコマ送りにして読み取ったもの:
   *   ・選んだタブに明るいカプセルが乗る(バーの内側。浮いた別物ではない)
   *   ・切り替えると伸びて両方を跨ぎ、**先端が先に着いて後端が遅れて追う**
   *   ・大きく動くのは約 200ms
   *
   * ## 幅を時間で膨らませていないこと
   * **伸びは左端と右端の2本のばねの速さの差から出す。** 時間で書いた
   * 振り付けだと、途中で別のタブを押したときに飛ぶし、指でスワイプして
   * いる間の 1:1 追従もできない。ここが崩れると「それっぽいが、掴めない」
   * 動きに戻るので、本数と向きの入れ替えを門にする。
   *
   * ブラウザ実測では 174ms 時点で **1.59倍**まで伸び、正しい位置で 1.00倍に
   * 収束する。
   */
  it("タブの印は**左右別々のばね**で動く（伸びを時間で書かない）", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    // 端ごとに1本ずつ、2本。
    expect((src.match(/createSpring\(/g) ?? []).length).toBe(2);
    // 進む側と残る側で速さを変える。ここが同じだと伸びない。
    expect(src).toMatch(/const fast = \{[^}]*response: lead/);
    expect(src).toMatch(/const slow = \{[^}]*response: trail/);
    // 向きで入れ替える。入れ替えないと、片方向にしか伸びない。
    expect(src).toMatch(/goingRight \? fast : slow/);
    expect(src).toMatch(/goingRight \? slow : fast/);
  });

  it("タブの印は**跳ねない**（押した所と違う所に居る一瞬を作らない）", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    // 先に着く側は damping 1（行き過ぎ無し）。伸びは2本の差でもう出ている。
    const fast = src.slice(src.indexOf("const fast ="));
    expect(fast.slice(0, 80)).toMatch(/damping: 1\b/);
  });

  it("動きを減らす設定では、伸びも移動も出さない", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    const branch = src.slice(src.indexOf("if (reduced)"));
    expect(branch.slice(0, 160)).toMatch(/L\.set\(/);
    expect(branch.slice(0, 160)).toMatch(/R\.set\(/);
  });

  /**
   * **画面の幅が変わったら、ばねの値を入れ直す。**（Codex 指摘 2026-09-14）
   *
   * ばねが持っているのは px の位置で、`cursor × 1タブぶんの幅`。横向きに
   * すると1タブぶんの幅が変わるので、描き直すだけでは**古い幅で出した位置**
   * を指したままになる。しかも `cursor` は変わらないので、下の effect も
   * 走らない = **次にタブを押すまで直らない**。
   */
  it("横向きにしても、印が正しい所を指す（幅が変わったら値を入れ直す）", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    const onResize = src.slice(
      src.indexOf("const onResize"),
      src.indexOf("window.addEventListener"),
    );
    // 描き直すだけでは足りない。値そのものを入れ直していること。
    expect(onResize).toMatch(/leftRef\.current\?\.set\(/);
    expect(onResize).toMatch(/rightRef\.current\?\.set\(/);
    // 入れ直す値は、いまの位置と**いまの**寸法から出すこと。
    expect(onResize).toMatch(/indexRef\.current/);
    expect(onResize).toMatch(/edgesAt\(/);
  });

  /**
   * **位置は本物の兄弟を測って決める。**（オーナー指摘 2026-09-15
   * 「アイコンが中心に来てない。バランスが悪い」）
   *
   * 親に内側の余白があると `clientWidth` はそれを含む一方、中の物は余白の
   * 内側から始まる。割り算で出した位置は左にずれ、1つぶんの幅も広すぎる。
   * 下のタブでは5番目で**約 21px のずれ**になっていた（実測 0px に）。
   */
  it("**印の位置は割り算で出さない**（アイコンの中心からずれる）", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    expect(src).toMatch(/getBoundingClientRect\(\)/);
    expect(src).not.toMatch(/clientWidth \/ Math\.max\(count/);
  });

  /**
   * **同じ印を、全部の切り替えに使う。**（オーナー指示 2026-09-15
   * 「全ての切り替え機能の切り替えのボタンを押した時、必ず…残像感、
   * 滑らか感を出して。例えば設定の変更のボタン」）
   */
  it("設定の丸い選択肢も、下のタブと**同じ印**で滑る", () => {
    const st = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(st).toMatch(/<SlidingIndicator/);
    // 丸いボタンなので真円のカプセル。
    expect(st).toMatch(/radiusRatio=\{0\.5\}/);
    // 印が滑ってくるので、選ばれたボタンが自分で地を塗ると滑って見えない。
    const cls = st.slice(st.indexOf("value === o.value"), st.indexOf("value === o.value") + 200);
    expect(cls).not.toMatch(/bg-primary\b/);
  });
});

/**
 * 指の物理。**測って直した2件を、黙って戻らないように留める。**
 */
/**
 * **動きの答えは1つだけ。**（オーナー報告 2026-09-15）
 *
 * 「スマホだとアニメーションが全部消える」の原因は端末の
 * `prefers-reduced-motion: reduce`。アプリ側で選べるようにした以上、
 * **端末の設定を直に見る所が1つでも残っていると、そこだけ止まったまま**に
 * なる。同じ画面で効く動きと効かない動きが混ざるのが、いちばん説明の
 * 付かない見え方なので、直に見る所が残っていないことを門にする。
 */
/**
 * 復習の「準備中…」。**出さなくていい所で出さない。**（オーナー報告 2026-09-15）
 *
 * > 「他のページやアプリを一旦閉じたりすると毎回準備中と表示されストレスです」
 *
 * 原因は2つで、片方だけ直しても消えない:
 *   ① 束がメモリの上にしか無く、アプリを閉じると消える
 *   ② 裏で読み直している間も「準備中」に差し替えていた
 */
describe("復習の束は、アプリを閉じても残る", () => {
  const view = () => codeOnly(read("routes/_authenticated/review.tsx"));

  it("**書き留めた束を最初の描画から出す**（`initialData` に渡している）", () => {
    const s = view();
    expect(s).toMatch(/initialData:\s*\(\)\s*=>\s*cachedBatch\?\.cards/);
    // 年齢も渡す。渡さないと React Query が「たった今取った」と見なし、
    // 4時間前の束を新しい物として扱ってしまう。
    expect(s).toMatch(/initialDataUpdatedAt:\s*cachedBatch\?\.at/);
  });

  it("届いた束を書き留めている（書かなければ次に開いたとき何も無い）", () => {
    expect(view()).toMatch(/packBatch\(/);
    expect(view()).toMatch(/localStorage\.setItem\(REVIEW_CACHE_KEY/);
  });

  it("**名指しの1枚で来た回は書き留めない**（その場限りの並びなので）", () => {
    // `wantedSticker` があるときは早く帰る形になっていること。
    expect(view()).toMatch(/if \(!cards\?\.length \|\| wantedSticker\) return;/);
  });

  it("**裏で読み直している間は「準備中」に戻さない**", () => {
    // `isFetching` だけを見ていると、裏の読み直しのたびに画面が消える。
    // 束を入れ替えるつもりのときだけ待たせる。
    expect(view()).toMatch(/replacing\.current && isFetching \? \(/);
    expect(view()).not.toMatch(/\) : isFetching \? \(/);
  });

  it("解いている最中には束を入れ替えない（1枚目へ戻されるのはラグより悪い）", () => {
    const s = view();
    const guard = s.slice(s.indexOf("const revalidated"), s.indexOf("const revalidated") + 420);
    expect(guard).toMatch(/idx !== 0 \|\| tally\.answered !== 0/);
  });
});

describe("動きを見せるかの答えは、`<html data-motion>` ひとつ", () => {
  /** ソースの中で、端末の設定を直に聞いてよい場所。 */
  const ALLOWED = [
    // 描画前スクリプト。**最初の1枚**のために、ここだけは自分で端末に聞く
    // （水和を待つと、動きを減らしている人が一瞬だけ動く絵を見る）。
    "routes/__root.tsx",
    // 端末の返事を聞いて本人の選択と混ぜ、属性に書く。開いている間の担当。
    "components/motion-provider.tsx",
  ];

  it("**端末の設定を直に見る所が、決めた2箇所しか無い**", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) {
          // 注のなかで**理由として言及している**だけの所は数えない。
          if (codeOnly(read(rel)).includes("prefers-reduced-motion")) hits.push(rel);
        }
      }
    };
    walk("");
    expect(hits.sort()).toEqual([...ALLOWED].sort());
  });

  it("CSS の「動きを減らす」も、端末直結の `@media` では書かない", () => {
    for (const css of ["styles.css", "pack-styles.css"]) {
      // 注のなかの引用は数えない（`@custom-variant` の説明で、Tailwind の
      // 既定がどう展開されるかを書いてある）。規則として書かれた物だけ見る。
      const s = read(css)
        .split("\n")
        .filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l))
        .join("\n");
      const blocks = s.match(/@media \(prefers-reduced-motion: reduce\)\s*\{/g) ?? [];
      expect([css, blocks.length]).toEqual([css, 0]);
      expect(s).toContain('html[data-motion="reduce"]');
    }
  });

  it("Tailwind の `motion-reduce:` も同じ答えへ繋ぎ直してある", () => {
    // 繋ぎ直さないと、この語が付いた箇所だけ端末の設定に従い続ける。
    expect(read("styles.css")).toMatch(/@custom-variant motion-reduce \([^)]*data-motion="reduce"/);
  });

  it("描画前スクリプトが**最初の1枚から**属性を入れている", () => {
    // 水和を待つと、動きを減らしている人が一瞬だけ動く絵を見る。
    const root = codeOnly(read("routes/__root.tsx"));
    expect(root).toMatch(/document\.documentElement\.dataset\.\$\{MOTION_ATTR\}/);
    expect(root).toMatch(/prefers-reduced-motion: reduce/);
  });
});

describe("指の手応え（外からの指摘で直した所）", () => {
  /**
   * **指を置いた所を履歴の1点目に置く。**（Codex 指摘 2026-09-14）
   *
   * 置かないと、速く短く払った回は `pointermove` が1回しか来ず、履歴が
   * 1点だけになる。`velocityFrom` は2点無いと 0 を返すので、**この改良が
   * いちばん効くはずの操作でだけ速度が 0 になる** — 直したつもりの物が
   * 直っていない、いちばん質の悪い形。
   */
  it("スワイプは**指を置いた瞬間から**位置を控える（1点では速度が出ない）", () => {
    const src = codeOnly(read("hooks/use-tab-swipe.ts"));
    // 空で始めていないこと。`useTabSwipe` と `useSwipeBack` の2箇所。
    expect(src).not.toMatch(/history\s*=\s*\[\]\s*;[\s\S]{0,80}?sx\s*=/);
    const seeds =
      src.match(/history\s*=\s*\[\{\s*t:\s*performance\.now\(\)\s*,\s*x:\s*0\s*\}\]/g) ?? [];
    expect(seeds.length).toBe(2);
    // 「1点では速度が 0」という前提そのものは `swipe-physics.test.ts` 側で見る。
  });

  /**
   * **掴んで閉じる面は `touch-action: none`。**（Codex 指摘 2026-09-14）
   *
   * `pan-y` は「縦に引く操作はブラウザのスクロールに使う」という宣言で、
   * この面が欲しいのはまさにその操作。Chromium で測ると `pan-y` では
   * `pointermove` 2回で `pointercancel` が飛び、**つまみを掴んでも死ぬ**。
   * `none` にしても中の縦スクロールは壊れない（スクロールする要素自身が
   * 受け取るので、上に居るこの面の `none` は参照されない）。
   *
   * `SwipeCard` の `pan-y` は正しい — あちらは**横**に引く物で、縦を
   * ブラウザに渡すのが目的。向きが逆なので、ここでは見張らない。
   */
  it("掴んで閉じる面は `touch-action: none`（`pan-y` だと指が取り上げられる）", () => {
    const src = codeOnly(read("hooks/use-drag-dismiss.tsx"));
    expect(src).toMatch(/touchAction:\s*"none"/);
    expect(src).not.toMatch(/touchAction:\s*"pan-y"/);
  });

  it("運ぶカードが `will-change` を立てている（上の門が要る理由そのもの）", () => {
    // ここが消えたら、上の `createPortal` は要らなくなるかもしれない。
    // **その時に気づけるように**、理由の側にも門を置く。消すのではなく、
    // 「なぜ portal なのか」を読み直してから決めること。
    const sw = codeOnly(read("components/SwipeCard.tsx"));
    expect(sw).toMatch(/willChange:\s*"transform"/);
  });

  it("後始末を**散らさない**（同じ片付けを2箇所に書くと、片方だけ直る）", () => {
    const v5 = codeOnly(read("components/effects/catch-landing/v5_reward.ts"));
    // 以前は「着弾先が見つからない」枝と最後の finally の2箇所に同じ
    // 片付けが書いてあり、枝の側には `visibility` を戻す行が無かった。
    for (const line of [
      "handoff.remove()",
      "delete document.documentElement.dataset.rewardFlight",
    ]) {
      expect(v5.split(line).length - 1).toBe(1);
    }
  });
});

/**
 * **下のタブ帯と、札を開く動き**（オーナー指示 2026-09-15）。
 *
 * ここに置く門は全部、実際に測って原因が分かったものだけ。
 * 「そう書いたから」ではなく「こう書かないとこう壊れた」を書き留める。
 */
describe("N. 下のタブ帯と、札を開く動き", () => {
  /**
   * **画面をまたいでも、印は前に居た所から動き出す。**
   *
   * このアプリは16画面が各自 `<AppShell>` を描いているので、タブを押すと
   * 帯ごと作り直される。作り直されると印のばねも生まれ直し、移動先の位置で
   * 初期化される — つまり**押したときだけ尾が出ない**
   * （オーナー指摘「下のアイコンをタップして違うページに移った時の
   * 残像感滑らか感が実装されてない」）。位置を持ち越して繋ぐ。
   */
  it("印は画面をまたいで位置を憶える（押して移っても尾が出る）", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    // 部品の外（＝作り直されない所）に控える。
    expect(src).toMatch(/^const lastIndex = new Map<string, Carry>\(\);$/m);
    // 生まれるとき、前に居た所から始める。
    expect(src).toMatch(/lastIndex\.get\(persistKey\)/);
    expect(src).toMatch(/start = \{ l: carry\.l \* k, r: carry\.r \* k \}/);
    /**
     * **控えるのは「行き先の番号」ではなく「いま画面に出ている px」。**
     * 番号だけだと、画面の入れ替わりで2回作り直されたとき
     * 「前＝行き先」になって動く距離が消える = 滑りが途中で切れる
     * （オーナー指摘「途中でスライドのアニメーションが消える」）。
     */
    const paint = src.slice(src.indexOf("const paint = ()"), src.indexOf("const now ="));
    expect(paint).toMatch(/lastIndex\.set\(persistKey, \{/);
    expect(paint).toMatch(/l,\s*r,/);
    expect(paint).toMatch(/trackW:/);
    // 下のタブは鍵を渡している（渡さないと何も憶えない）。
    expect(codeOnly(read("components/TabBar.tsx"))).toMatch(/persistKey="tabbar"/);
  });

  /**
   * **`ResizeObserver` の最初の1回で、種を上書きしない。**
   *
   * `observe()` した直後に必ず1回呼ばれる（仕様どおり）。素通しにすると、
   * 生まれた直後のこの1回が「前に居た所から始める」種を移動先へ
   * 書き換える。実測では印が 29.2px → 294.5px へ**1フレームで飛んで**いた。
   */
  it("幅が変わっていない `ResizeObserver` の呼び出しでは値を入れ直さない", () => {
    const src = codeOnly(read("components/SlidingIndicator.tsx"));
    const body = src.slice(src.indexOf("const onResize"), src.indexOf("window.addEventListener"));
    expect(body).toMatch(/if \(w === seenW\) return;/);
    // 入れ直す前に控えを更新していること（さもないと毎回素通しになる）。
    expect(body.indexOf("seenW = w")).toBeLessThan(body.indexOf("leftRef.current?.set("));
  });

  /**
   * **帯は画面いっぱいではなく、浮くカプセル。**
   * 参照(App Store)を実測した割合は `components/TabBar.tsx` の表。
   */
  it("下のタブ帯は、角が完全に丸い浮いたカプセル", () => {
    const css = read("styles.css");
    const bar = css.slice(css.indexOf(".tabbar {"), css.indexOf(".tabbar__row"));
    expect(bar).toMatch(/border-radius: 9999px;/);
    /**
     * **画面幅に対する割合で持ち、いっぱいには広げない。**
     *
     * ここは一度 `87.6%`（App Store の実測）を直に書いていたが、幅は
     * オーナーの好みで動く数（2026-09-15「もう横に大きく広げてほしい」で
     * 94% にした）。**動く数を門にすると、指示どおり直すたびに落ちる**門に
     * なる。守りたいのは数ではなく「浮いている＝画面いっぱいではない」こと。
     */
    const pct = bar.match(/width: (\d+(?:\.\d+)?)%;/);
    expect([!!pct, pct && Number(pct[1]) < 100]).toEqual([true, true]);
    // 枠は素通し。帯の左右の余白ごしに後ろへ指が届くこと。
    const dock = css.slice(css.indexOf(".tabbar-dock {"), css.indexOf(".tabbar {"));
    expect(dock).toMatch(/pointer-events: none;/);
    expect(css.slice(css.indexOf(".tabbar {"))).toMatch(/pointer-events: auto;/);
  });

  /**
   * **カメラの升目には印を乗せない**（オーナー指示「青いバブルで囲うのでは
   * なく、カメラのアイコンの中の色を変えてほしい」）。
   *
   * 出す/消すの2値にしない — 指で払っている最中はカメラの上を通過するので、
   * 2値だと真ん中で印がぱっと消えてぱっと戻る。
   */
  it("カメラの升目に近づくと印が薄れる（2値で消さない）", () => {
    const shell = codeOnly(read("components/AppShell.tsx"));
    expect(shell).toMatch(/const cameraIndex = items\.findIndex\(\(i\) => i\.to === "\/capture"\)/);
    expect(shell).toMatch(/Math\.abs\(cursor - cameraIndex\)/);
    expect(shell).toMatch(/indicatorOpacity=\{indicatorOpacity\}/);
    // 印の側も濃さを受け取れること。
    expect(codeOnly(read("components/SlidingIndicator.tsx"))).toMatch(/opacity = 1,/);
  });

  /**
   * **カメラに居ることは、丸の「中の色」で示す。**
   *
   * 前は白の濃淡（70% → 100%）だけだった。同じ色の濃淡は「色が変わった」と
   * 読まれない。地と字を入れ替える。
   */
  /**
   * **カメラの機械の中では、丸をやめて帯ごと暗くする。**（オーナー指示
   * 2026-09-16「下のバーも撮影モードのときはこのような色にして」／参考画像）
   *
   * 丸はシャッターへ移ったので下には置かない。ただし**絵まで消さない** —
   * 前の版は丸ごと隠していて、カメラの升目だけ空白になっていた。参考画像
   * では主色の絵と字が出ている。どこに居るかは帯から読めないといけない。
   *
   * 白いカプセルのままだと、画面いっぱいの映像の上で**そこだけ紙を貼った
   * ように浮く**。帯は暗いガラスへ入れ替える。
   */
  it("カメラの機械の中では、丸をやめて帯ごと暗いガラスにする", () => {
    const shell = codeOnly(read("components/AppShell.tsx"));
    // 居ないときはこれまでどおり主色の丸。
    expect(shell).toMatch(/tabbar__lens bg-primary text-primary-foreground/);
    // 居るときは丸を出さず、ふつうの絵を主色で出す。
    expect(shell).toMatch(/\{isScan && !isCurrent \? \(/);
    expect(shell).toMatch(/isScan && isCurrent \? "text-primary" : ""/);
    // 帯そのものに印を渡す。
    expect(shell).toMatch(/onCamera=\{onCameraScreen\}/);
    expect(codeOnly(read("components/TabBar.tsx"))).toMatch(
      /data-camera=\{onCamera \|\| undefined\}/,
    );
    const css = read("styles.css");
    const at = css.indexOf(".tabbar[data-camera] {");
    expect(at).toBeGreaterThanOrEqual(0);
    const body = css.slice(at, css.indexOf("\n}", at));
    expect(body).toMatch(/backdrop-filter: blur/);
    expect(body).toMatch(/--cam-body/);
  });

  /**
   * **カメラの中では、横に払うのは撮り方の切り替え。**（オーナー指示
   * 2026-09-16「スライドしたら検索、スキャンに変更できる」）
   *
   * タブの横払いと同じ指の動きなので、両方が取ると**撮り方を変えたつもりで
   * 復習の画面へ飛ぶ**。カメラの中ではタブ側を止める。
   */
  it("カメラの中では、タブの横払いを止める", () => {
    const shell = codeOnly(read("components/AppShell.tsx"));
    expect(shell).toMatch(/enabled: !onCameraScreen,/);
    expect(shell).toMatch(/const onCameraScreen = atPath\("\/capture"\) \|\| atPath\("\/scan"\);/);
  });

  /**
   * **札を開いたら、もう手元にある物をすぐ出す。**
   * （オーナー指摘「くるくるとロード中が回って…ロードがストレス」）
   */
  it("札の詳細は、一覧が持っている中身を種にして待たせない", () => {
    for (const f of ["components/StickerSheet.tsx", "routes/_authenticated/dex.$stickerId.tsx"]) {
      const src = codeOnly(read(f));
      expect([f, /seedStickerFromList\(/.test(src)]).toEqual([f, true]);
      expect([f, /initialData: seed/.test(src)]).toEqual([f, true]);
      // **古い物として置く**こと。置きっぱなしにすると、詳細にしか無い
      // 中身（一言の動画・語の枝・復習した回数）が永久に届かない。
      expect([f, /initialDataUpdatedAt: seed \? SEED_UPDATED_AT : undefined/.test(src)]).toEqual([
        f,
        true,
      ]);
    }
  });

  /**
   * **広がるのは本物の見出し。写しは作らない。**（オーナー報告 4回目
   * 2026-09-16「いまだにアニメーションが変。一からやり直して」）
   *
   * 前は写しを1枚飛ばし、`[data-sheet-hero]` を探して着地させていた。
   * 雛形で実物の道を通して測ったら、こう出た:
   *
   * | 時刻 | 面の濃さ | 入場クラス | 飛んでいる写し |
   * |---|---|---|---|
   * | 0ms | 0.00 | – | 有り |
   * | 99ms | **1.00** | – | **有り** ← 面と写しが同時＝二重 |
   * | 297ms | **0.00** | **material-in** | 無し ← **演出が頭からやり直す** |
   *
   * 写しをやめると、この2つは**構造として**起きなくなる — 絵は1枚しか
   * 無く、動かしている物が行き先そのものなので「見つからない」が無い。
   */
  it("札から詳細への動きは、写しを作らず本物の見出しを広げる", () => {
    const src = codeOnly(read("components/use-hero-reveal.ts"));
    // 動かすのは渡された箱そのもの。
    expect(src).toMatch(/const ref = useRef<HTMLDivElement \| null>\(null\)/);
    expect(src).toMatch(/el\.getBoundingClientRect\(\)/);
    // 写しを作る道が無いこと。
    expect(src).not.toMatch(/createElement\(/);
    expect(src).not.toMatch(/createPortal/);
    expect(src).not.toMatch(/querySelector/);
    // 写しを飛ばす部品そのものが消えていること。
    expect(() => read("components/HeroFlight.tsx")).toThrow();
    expect(codeOnly(read("components/StickerSheet.tsx"))).not.toMatch(/HeroFlight/);
  });

  /**
   * **ばねは px で回す。0〜1 の倍率では回さない。**
   *
   * `spring.ts` の収束判定は「0.05px / 0.5px/s」で、画面の値を動かす前提の数。
   * 倍率(0.66→1.0)に使うと 1 の手前で打ち切られ、跳ねが丸ごと消える。
   */
  it("広がる動きは、幅と高さを px で回す（倍率では回さない）", () => {
    const src = codeOnly(read("components/use-hero-reveal.ts"));
    // 位置2本・大きさ2本・角の丸み1本。
    expect((src.match(/createSpring\(/g) ?? []).length).toBe(5);
    // 幅・高さは px の値から始めて px の値へ。
    expect(src).toMatch(/const pw = createSpring\(w0, paint, POP\)/);
    expect(src).toMatch(/pw\.to\(last\.width\)/);
    // 倍率はそこから割り算で出す（ばねには入れない）。
    expect(src).toMatch(/pw\.value\(\) \/ last\.width/);
    // 大きさだけ跳ね、居場所は跳ねない。
    expect(src).toMatch(/const POP = \{ damping: 0\.54/);
    expect(src).toMatch(/const GLIDE = \{ damping: 1/);
  });

  /**
   * **入場の仕方は開いた時に一度だけ決める。**
   *
   * 前は「いま飛んでいるか」で決めていたので、着いた瞬間に `material-in`
   * が付いて、ふつうのフェードが頭からやり直していた（上の表の 297ms）。
   */
  it("札を開く面の入場クラスは、動きの途中で切り替わらない", () => {
    const src = codeOnly(read("components/StickerSheet.tsx"));
    expect(src).toMatch(/\$\{reveal \? "" : "material-in"\}/);
    // 開いた時の値をそのまま持ち回る（着地で変わる値を見ない）。
    expect(src).toMatch(/const reveal = flightRef\.current\.origin;/);
    expect(src).not.toMatch(/landed/);
    /**
     * **まわりには何も掛けない。**（オーナー報告 2026-09-16
     * 「上の単語の設定の項目の順番が勝手に開いて画像が見れない」）
     *
     * 子を名指ししない規則（`> *` に `animation: … both`）を置いたら、
     * 自分で出入りを決める覆い（`SectionsPanel`）まで `opacity: 1` に
     * 固定され、閉じているはずの物が写真の上に居座った。CSS アニメーション
     * は class より強く、`both` は終わったあとも効き続ける。
     */
    expect(read("styles.css")).not.toMatch(/\.sheet-around-in > \*/);
    expect(src).not.toMatch(/sheet-around-in/);
  });

  /**
   * **閉じたら、走らせた印を捨てる。**
   *
   * 残したままだと「同じ札をもう一度開く」が素通りする（閉じても札の id は
   * 同じなので）。雛形で 1回目 0.92→1.033倍、2回目**まったく動かない**と出た。
   */
  it("同じ札を開き直しても、毎回ちゃんと広がる", () => {
    const src = codeOnly(read("components/use-hero-reveal.ts"));
    const guard = src.slice(src.indexOf("if (!el || !origin || !key)"));
    expect(guard.slice(0, 120)).toMatch(/ranFor\.current = null;/);
  });

  /**
   * **転がして選ぶ輪**（オーナー指示 2026-09-15「設定のレベルや言語を選ぶ、
   * 縦に選択肢が並んでるもの。タップではなく Apple のスクロールして選択
   * するような美しいものに変更して」）。
   *
   * 素の `<select>` は iOS でだけ OS の輪が開き、Android とブラウザでは
   * ただの一覧が落ちてくる。同じアプリが端末で別物になっていた。
   */
  it("設定の言語とレベルは、押すと開く行で選ぶ（素の `<select>` ではない）", () => {
    const st = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect((st.match(/<PickerRow/g) ?? []).length).toBe(4);
    expect(st).not.toMatch(/<SelectRow/);
  });

  /**
   * **iOS の「設定」の行に倣う**（オーナー指示 2026-09-15「設定の縦のスクロール
   * 元のあれに戻して、その元の設定をタップしたら選択肢がスクロールできるように
   * 2段階にしたい。Apple の公式のデザイン調べて同じもの再現して」）。
   *
   * 輪を4つ並べていた版は、**設定を眺めたいだけの人にも輪が居座る**ので
   * 画面がどこまでも縦に伸びた。畳んでおけば、いま何が選ばれているかは
   * 1行で読める。
   */
  it("畳んでいる行でも「いま選んでいる値」が読める", () => {
    const src = codeOnly(read("components/PickerRow.tsx"));
    // main（2026-09-19）で、その場で開く2段階から**前に出る輪**へ変わった。
    // 形は変わってよいが、**押す前にいまの値が1行で読める**ことは変わらない。
    expect(src).toMatch(/options\.find\(\(o\) => o\.value === value\)\?\.label/);
    expect(src).toMatch(/<ChevronDown/);
    // 押す物には名前が要る（中身は値だけなので、項目名は `aria-label`）。
    expect(src).toMatch(/aria-label=\{label\}/);
    // 開く輪にも名前が要る（`DialogTitle` を `aria-labelledby` で指す）。
    expect(src).toMatch(/aria-labelledby=\{`\$\{id\}-sheet-label`\}/);
    // 指の下限。**`.picker-row__head` はもう誰も使っていない**ので、
    // 生きている方（trigger の `min-h-14` = 56px）を見る。
    expect(src).toMatch(/className="mt-2 flex min-h-14 w-full/);
  });

  /**
   * **輪は畳んでいる間も置いたままにする。**
   * 開いた瞬間に作ると、高さ 0 の箱の中で位置を合わせることになり、
   * 選んでいる行が真ん中に来ない（実測 0px に）。
   */
  it("行を開け閉めしても輪は作り直さない", () => {
    const src = codeOnly(read("components/PickerRow.tsx"));
    // 開いている時だけ描く、になっていないこと。
    expect(src).not.toMatch(/\{open && <WheelPicker/);
    expect(src).toMatch(/<WheelPicker/);
    // 高さは 0fr ↔ 1fr で動かす（`max-height` の当てずっぽうにしない）。
    const css = read("styles.css");
    expect(css).toMatch(/\.picker-row__body \{[^}]*grid-template-rows: 0fr;/);
    expect(css).toMatch(/\.picker-row__body\[data-open\] \{\s*grid-template-rows: 1fr;/);
  });

  /**
   * **慣性と端の返りは自分で書かない。**
   *
   * 指の速さ・惰性・端でのゴムの返りを自前で実装すると、必ずどこかが
   * 本物と違う手触りになる。縦スクロールをそのまま使い、`scroll-snap` で
   * 1行に吸わせれば、OS の物がそのまま出る。
   */
  it("輪はブラウザの巻き取りに任せる（慣性を自前で書かない）", () => {
    const css = read("styles.css");
    const w = css.slice(css.indexOf(".wheel__scroll {"), css.indexOf(".wheel__item {"));
    expect(w).toMatch(/scroll-snap-type: y mandatory;/);
    const src = codeOnly(read("components/WheelPicker.tsx"));
    expect(src).toMatch(/scroll-snap-align: center|scrollTo\(/);
    // ばねや慣性の式をここに書いていないこと。
    expect(src).not.toMatch(/createSpring|projectMomentum|requestAnimationFrame\(function/);
  });

  /**
   * **見た目は輪、中身は一覧。** 読み上げと鍵盤でたどれること。
   * 見た目だけ作り替えて操作の道を塞ぐと、選べない人が出る。
   */
  it("輪は読み上げと鍵盤でも選べる", () => {
    const src = codeOnly(read("components/WheelPicker.tsx"));
    expect(src).toMatch(/role="listbox"/);
    expect(src).toMatch(/role="option"/);
    expect(src).toMatch(/aria-activedescendant=/);
    expect(src).toMatch(/aria-selected=/);
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect([key, src.includes(`"${key}"`)]).toEqual([key, true]);
    }
  });

  /**
   * **選択肢が2つの輪に、5行ぶんの窓を開けない。**
   * 上下が空の箱になり、何も無い所を転がしているように見える。
   */
  it("輪の窓は選択肢の数に合わせる（必ず奇数）", () => {
    const src = codeOnly(read("components/WheelPicker.tsx"));
    expect(src).toMatch(/function visibleRows\(count: number\): number/);
    expect(src).toMatch(/count % 2 === 1 \? count : count \+ 1/);
    expect(src).toMatch(/Math\.max\(3, Math\.min\(MAX_VISIBLE, odd\)\)/);
  });

  /**
   * **カメラの演出は React の外に出す。**（オーナー指摘 2026-09-15
   * 「アニメーションが表示されるのが最初だけで2回目とか押すと表示されなく
   * なる」）
   *
   * 画面ごとに `AppShell` を描いているので、押した瞬間に殻ごと作り直される。
   * 覆いを状態で持つと、演出が始まる前に持ち主が消える。
   */
  /**
   * **「いまその行き先に居るか」の判定を、1箇所にまとめる。**
   * （オーナー報告 2026-09-15「2回目カメラボタン押した時にすでに表示されて
   * いるのにもう1回重ねてカメラのアニメーションが表示されてる」）
   *
   * 末尾に `/` が付くことがある（`/capture` と `/capture/` の両方が来る）。
   * 並びの番号を出す所だけがそれを見ていて、押した時の判定とカメラの丸の色は
   * 素の `===` のままだった。だから**カメラの画面に居るのに「居ない」**と
   * 判断され、押すたびに演出が走っていた。
   */
  it("行き先に居るかの判定は1箇所で、末尾の `/` も見る", () => {
    const shell = codeOnly(read("components/AppShell.tsx"));
    expect(shell).toMatch(
      /const atPath = \(to: string\) =>\s*pathname === to \|\| pathname === `\$\{to\}\/`/,
    );
    // 3箇所とも同じ物を使っていること。
    expect(shell).toMatch(/items\.findIndex\(\(i\) => atPath\(i\.to\)\)/);
    /**
     * **カメラの丸を下から消すのは「カメラの機械に居る間」。**（オーナー指示
     * 2026-09-16「スキャンのとき、検索のときも下のバーのカメラあいこん
     * ひょうじしなくていい。カメラのとき同じように」）
     *
     * 撮る・調べる・読み取るは同じ一台の3つのモードで、`/scan` だけ行き先が
     * 別。行き先で判定すると読み取り中だけ丸が下に戻り、**シャッターと下の丸が
     * 同時に在る**ことになる。調べるは `/capture?mode=search` なので、道が
     * 同じここで一緒に片付く。
     */
    expect(shell).toMatch(/const isCurrent = isScan \? onCameraScreen : atPath\(to\)/);
    // 並びの番号と指で払う順は**5つの行き先のまま**。`/scan` を混ぜない。
    expect(shell).not.toMatch(
      /items\.findIndex\(\(i\) => atPath\(i\.to\) \|\| atPath\("\/scan"\)\)/,
    );
    /**
     * **入れ替えの頃合いは演出側が決める。**（オーナー報告 2026-09-16
     * 「カメラの黒い画面に移行し、その上から同じ画面のアニメーションが
     *  出て2重になってる」）
     * 押した瞬間に移ると、まだ小さい板の後ろに行き先の黒い面が出る。
     */
    expect(shell).toMatch(/playCameraLaunch\(\(\) => void navigate\(\{ to \}\)\)/);
    expect(shell).toMatch(/event\.preventDefault\(\)/);
    // 素の比較が残っていないこと。
    expect(shell).not.toMatch(/pathname === "\/capture"/);
    expect(shell).not.toMatch(/pathname !== "\/capture"/);
  });

  /**
   * **走っている間の押下は黙って捨てる。**
   * 「消してから出し直す」にすると、連打で同じ絵が頭から何度も始まり、
   * 見ている側には「もう1回重ねて出た」と映る。
   */
  it("開く演出は1回の操作に1つ（連打で出し直さない）", () => {
    const lib = codeOnly(read("lib/camera-launch.ts"));
    expect(lib).toMatch(/if \(live\) \{/);
  });

  /**
   * **撮る画面を、暇なうちに取っておく。**（オーナー報告 2026-09-15
   * 「カメラを開いた時に、実際にカメラが開くまで5秒ぐらいラグがある」）
   *
   * 録画を1コマずつ見ると、押した直後に下のタブの選択だけが変わり、
   * **中身はホームのまま5秒**続いていた。待っているのはカメラではなく、
   * 撮る画面そのものの到着。
   */
  it("撮る画面は、開いた後の暇な時間に先に取っておく", () => {
    expect(codeOnly(read("router.tsx"))).toMatch(/defaultPreload: "intent"/);
    const warm = codeOnly(read("hooks/use-warm-camera.ts"));
    expect(warm).toMatch(/preloadRoute\(\{ to: "\/capture" \}\)/);
    // 1回だけ（殻は画面ごとに描き直される）。
    expect(warm).toMatch(/^let warmed = false;$/m);
    // いま見ている画面より先に取りに行かない。
    expect(warm).toMatch(/requestIdleCallback/);
    expect(codeOnly(read("components/AppShell.tsx"))).toMatch(/useWarmCamera\(\)/);
  });

  /**
   * **切り抜きの模型を、画面が出るより先に取りに行かない。**
   * ONNX の実行時は測って 762KB（`ort.bundle` と `ort.webgpu.bundle` で
   * 381KB ずつ）。開いた瞬間のいちばん細い回線を、カメラの映像と奪い合う。
   */
  it("切り抜きの模型は、暇になってから温める", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    const at = cap.indexOf("preloadCutout()");
    expect(at).toBeGreaterThan(0);
    // 素の `useEffect(() => { preloadCutout(); }, [])` に戻っていないこと。
    expect(cap).not.toMatch(/useEffect\(\(\) => \{\s*preloadCutout\(\);\s*\}, \[\]\)/);
    expect(cap).toMatch(/requestIdleCallback/);
  });

  /**
   * **ホームのアルバムは、上からポンと貼られる。**（オーナー指示 2026-09-15
   * 「壁紙ではなくアルバムが上からポンと貼られるようなアニメーションに」）
   */
  it("アルバムの登場は「めくる」ではなく「貼る」", () => {
    const css = read("styles.css");
    expect(css).toMatch(/@keyframes album-stamp \{/);
    expect(css).toMatch(/\.album-open \{[^}]*animation: album-stamp/);
    // 本を開く動き（綴じ目を軸に回す）が残っていないこと。
    const open = css.slice(css.indexOf(".album-open {"), css.indexOf(".album-open {") + 200);
    expect(open).not.toMatch(/rotateY/);
    expect(open).not.toMatch(/transform-origin: left center/);
  });

  /**
   * **面は最初から濃い。薄く重ねない。**（オーナー報告 2026-09-15
   * 「画像が同じものが二重になって表示されてる」）
   *
   * 写しをやめた今、面を伏せる理由がそもそも無い — 動いているのは面の中の
   * 写真1枚だけで、その下にアルバムが透ける瞬間が存在しない。
   * 伏せる仕掛け(`panelShown` / `sheet-hero-hidden`)を残すと、出す合図を
   * 取りこぼしたときに**面が永久に消える**ので、道ごと消しておく。
   */
  it("札の面は伏せない（薄く重ねる仕掛けを残さない）", () => {
    const src = codeOnly(read("components/StickerSheet.tsx"));
    expect(src).not.toMatch(/panelShown/);
    expect(src).not.toMatch(/heroHidden/);
    expect(src).not.toMatch(/sheet-hero-hidden/);
    expect(src).not.toMatch(/sheet-fade-in/);
    const css = read("styles.css");
    expect(css).not.toMatch(/\.sheet-hero-hidden /);
    expect(css).not.toMatch(/\.sheet-fade-in \{/);
  });

  it("カメラの演出は画面の入れ替わりで消えない（状態に持たない）", () => {
    const shell = codeOnly(read("components/AppShell.tsx"));
    expect(shell).toMatch(/playCameraLaunch\(/);
    // 状態も覆いの描画も殻から外れていること。
    expect(shell).not.toMatch(/cameraOpening/);
    expect(shell).not.toMatch(/className="camera-launch"/);
    const lib = codeOnly(read("lib/camera-launch.ts"));
    expect(lib).toMatch(/document\.body\.appendChild\(el\)/);
    // 連打しても1枚。出しっぱなしにしない。
    expect(lib).toMatch(/el\.remove\(\)/);
  });

  /**
   * **検査の帯は、本物の `TabBar` を描く。**
   *
   * 以前ここは `AppShell` の `<nav>` を手で写していた。写しは必ずずれる —
   * 実際、帯を浮くカプセルに作り替えたとき、この場面だけ古い帯のままだった。
   */
  it("ハーネスのタブ帯は本物の部品を読み込む（写しを作らない）", () => {
    const scene = fs.readFileSync(
      path.join(root, "../scripts/ui-harness/scenes/tabbar.tsx"),
      "utf8",
    );
    expect(codeOnly(scene)).toMatch(/import \{ TabBar \} from "@\/components\/TabBar"/);
    // 帯の枠を場面の側で書き直していないこと。
    expect(codeOnly(scene)).not.toMatch(/<nav/);
  });

  /**
   * **出ているかどうかは、出ている画面が名乗る。**（オーナー報告 3回目
   * 2026-09-15「すでにカメラの画面が表示されてるのに、そこから上に上書きで
   * アニメーションが表示される」）
   *
   * 道の名前で当てにいくと、末尾の `/`・移動の途中の値・道が増えたとき、で
   * 抜け道が毎回増える。カメラを出している画面 2つ（撮る・スキャン）に
   * 名乗らせれば、道が何であれ上に重ねることはあり得なくなる。
   */
  it("撮る画面・スキャン画面が出ている間は、開く演出を出さない", () => {
    const lib = codeOnly(read("lib/camera-launch.ts"));
    expect(lib).toMatch(/export function setCameraScreenOpen\(open: boolean\): void/);
    // 出ていたら何もせず返る。走っている最中の押下も捨てる。
    const play = lib.slice(lib.indexOf("export function playCameraLaunch"));
    expect(play).toMatch(/if \(cameraScreenOpen\) \{/);
    expect(play).toMatch(/if \(live\) \{/);
    // カメラを出す画面はどちらも名乗ること（片方だけだと、そこだけ重なる）。
    for (const f of ["routes/_authenticated/capture.tsx", "routes/_authenticated/scan.tsx"]) {
      const src = codeOnly(read(f));
      expect(src).toMatch(/setCameraScreenOpen\(true\)/);
      expect(src).toMatch(/return \(\) => setCameraScreenOpen\(false\)/);
    }
  });

  /**
   * **保存できなかった項目を、黙って「保存しました」で覆わない。**
   * （オーナー報告 2026-09-15「復習の数を無制限にしたら復習ができない」）
   *
   * `updateProfile` は列が無い等で落ちた項目を `skipped` で返す。画面は
   * それを見ずに必ず成功を出していたので、**上限が保存されていないのに
   * 保存されたと見える**。設定と実際の食い違いは、ここでしか気づけない。
   */
  it("設定は、保存できなかった項目を名指しで言う", () => {
    const src = codeOnly(read("routes/_authenticated/settings.tsx"));
    expect(src).toMatch(/skipped/);
    expect(src).toMatch(/toast\.warning\(t\("settings\.savedPartly"/);
    const ok = src.indexOf('toast.success(t("settings.saved")');
    const warn = src.indexOf('toast.warning(t("settings.savedPartly"');
    expect(ok).toBeGreaterThanOrEqual(0);
    expect(warn).toBeGreaterThanOrEqual(0);
    // 成功は「落ちた項目が無いとき」だけ。
    expect(src).toMatch(/skipped\.length > 0/);
  });

  /**
   * **読めなかったことを、上限 20 と取り違えない。**
   *
   * `getReviewPrefs` は読み取りが落ちても既定の 20 を返していた。上限なし
   * （0）にしている人は、通信が一瞬ころんだだけで 20 枚で打ち切られ、
   * しかも画面は「今日の分は終わりです」と言う。**読めなかったなら、
   * 上限を掛けない**方が実害が小さい。
   */
  it("復習の上限は、読み取りに失敗したら掛けない", () => {
    const src = codeOnly(read("lib/reviews.functions.ts"));
    const at = src.indexOf("async function getReviewPrefs");
    expect(at).toBeGreaterThanOrEqual(0);
    const fn = src.slice(at, at + 3000);
    expect(fn).toMatch(/if \(error\) return \{ limit: 0/);
    // 行が無い（まだ設定していない）ときだけ既定に落ちる。
    expect(fn).toMatch(/if \(!data\) return fallback;/);
  });

  /**
   * **かたまりの右は、日本語の訳だけ。**（オーナー指示 2026-09-15）
   * 音の釦と原文の繰り返しを並べると、読む所が3つになって訳が沈む。
   */
  it("単語の詳細のかたまり行は、右に訳だけを出す", () => {
    const src = codeOnly(read("components/WordCard.tsx"));
    const at = src.indexOf("function ChunkRow");
    expect(at).toBeGreaterThanOrEqual(0);
    const row = src.slice(at, at + 2000);
    expect(row).toMatch(/usage-chunk-row__meaning/);
    expect(row).not.toMatch(/PronounceButton/);
  });

  /** 「AIが分析中」の下の小さな文は消す（オーナー指示 2026-09-15）。 */
  it("分析中の画面に、添え書きを置かない", () => {
    for (const f of [
      "components/effects/scan-analyzing/v0_cutout.tsx",
      "components/effects/scan-analyzing/v6_minimal.tsx",
    ]) {
      expect(codeOnly(read(f))).not.toMatch(/scan\.justAMoment/);
    }
  });

  /**
   * **設定の見出しは、灰色の箱の外。**（オーナー指示 2026-09-15
   * 「左側のタイトルは前のバージョンに戻して」）
   *
   * 見出しを箱の中に入れると、箱は「選ばれている値」を出す所なのに、
   * 中に2つの文字列が並んで、どちらが値なのか分からなくなる。
   */
  it("設定の選び行は、見出しを箱の外に置く", () => {
    const src = codeOnly(read("components/PickerRow.tsx"));
    const label = src.indexOf("{label}</span>");
    const box = src.indexOf("<DialogTrigger");
    expect(label).toBeGreaterThanOrEqual(0);
    expect(box).toBeGreaterThanOrEqual(0);
    // 見出しが先（＝押す箱の外）にあること。
    expect(label).toBeLessThan(box);
  });

  it("設定の選び行に**固定の白を置かない**（暗い面でここだけ光る）", () => {
    // main 2026-09-19 の作り直しで `bg-white` / `text-slate-900` /
    // `border-slate-200` が入り、`.picker-sheet` の輪も `white` 直書きに
    // なっていた。この app はテーマを明暗2つ持つので、暗い面では設定の
    // 行と輪だけが白い板になる。
    const src = codeOnly(read("components/PickerRow.tsx"));
    expect(src).not.toMatch(/className="[^"]*\b(bg-white|text-slate-\d+|border-slate-\d+)\b/);
    const css = read("styles.css");
    const sheet = css.slice(
      css.indexOf(".picker-sheet .wheel {"),
      css.indexOf(".settings-page select,"),
    );
    expect(sheet.length).toBeGreaterThan(0);
    expect(sheet).not.toMatch(/background: white|linear-gradient\(white|#[0-9a-f]{3,6}/i);
  });

  /**
   * **カメラの上に載る操作は、1箇所にしか無い。**（オーナー指示 2026-09-15
   * 「撮る画面とスキャン画面を1つにして。スキャンのデザインは無くして、
   *  撮る画面のデザインを使って」）
   *
   * 倍率も前後の切替も、スキャン画面にだけ・別々に育っていた。同じ事を
   * 2箇所で書いている限り**片方だけ直る**ので、部品にして両方から読む。
   */
  it("倍率と前後の切替は、共通の部品からしか来ない", () => {
    for (const f of ["routes/_authenticated/capture.tsx", "routes/_authenticated/scan.tsx"]) {
      const src = codeOnly(read(f));
      expect(src).toMatch(/from "@\/components\/CameraChrome"/);
      // 画面ごとの作り置きが残っていないこと。縦のスライダーは捨てた。
      expect(src).not.toMatch(/type="range"/);
      expect(src).not.toMatch(/writingMode: "vertical-lr"/);
    }
  });

  /**
   * **撮り方は横に3つ。左から 検索 → 撮影 → スキャン。**（オーナー指示
   * 2026-09-16「真ん中に撮影、右にスキャン、左に検索にして」）
   *
   * 既定の撮影が**真ん中**なので、どちらへ払っても1回で隣に着く。左端に
   * 置いていたときは、スキャンへ行くのに2回ぶん払う人が出ていた。
   *
   * 印は**このアプリの他の切り替えと同じ滑って伸びるバブル**（オーナー指示
   * 2026-09-16「青い点ではなく、設定のスライドと同じように残像感のある
   * バブルを採用して」）。下のタブでも設定の選択肢でも使っている
   * `SlidingIndicator` をそのまま置く — 同じ切り替えの見え方を画面ごとに
   * 作り分けない。
   */
  it("撮り方は 検索・撮影・スキャン の順で、印は滑るバブル", () => {
    const src = codeOnly(read("components/CameraChrome.tsx"));
    expect(src).toMatch(
      /export const CAMERA_MODES: CameraMode\[\] = \["search", "photo", "scan"\];/,
    );
    expect(src).toMatch(/export function CameraModeStrip\(/);
    // 印は他の切り替えと同じ部品。自前の点を描き足さない。
    expect(src).toMatch(/<SlidingIndicator/);
    expect(src).toMatch(/persistKey="camera-modes"/);
    expect(src).not.toMatch(/camera-modes__dot/);
    expect(read("styles.css")).not.toMatch(/\.camera-modes__dot \{/);
    /**
     * `SlidingIndicator` は**自分以外の兄弟を実測**して位置を決めるので、
     * 箱の**最初の子**でなければならない。後ろに置くと、測る対象に自分より
     * 前の物しか入らず、位置がずれる。
     */
    const strip = src.slice(src.indexOf('role="tablist"'));
    expect(strip.indexOf("<SlidingIndicator")).toBeLessThan(strip.indexOf("CAMERA_MODES.map"));
    // シャッターの絵は撮り方ごと（オーナー指示「アイコン変更して」）。
    expect(src).toMatch(/export const SHUTTER_ICON: Record<CameraMode, typeof Camera>/);
    for (const icon of ["photo: Camera", "search: Search", "scan: ScanLine"]) {
      expect([icon, src.includes(icon)]).toEqual([icon, true]);
    }
    // ダイヤルは**消した**。同じ役目の部品を2つ残さない。
    expect(() => read("components/CameraDial.tsx")).toThrow();
    expect(read("styles.css")).not.toMatch(/\.camera-dial__arc \{/);
  });

  /**
   * **カメラの画面の物は、ひとつ残らずテーマに従わせない。**（絵の検査で
   * 出た赤／2026-09-16）
   *
   * 映像が来るまでの下地 `.capture-viewfinder__light` だけが `--foreground`
   * を地にしていた。明るいテーマでは黒い面になるが、**暗いテーマではそれが
   * 白に反転して、カメラの画面が真っ白になる**（実測: 上端 #c2d9fa、
   * 撮り方の帯の地 #f2f6f8 — 白い字が 1.12〜2.32 で完全に読めない）。
   *
   * 映像は明るいとも暗いとも決まっていないので、この画面はテーマの色を
   * 借りてはいけない。カメラ自前の固定色（`--cam-*`）だけで描く。
   */
  it("カメラの下地はテーマの色を借りない（暗いテーマで白く反転しない）", () => {
    const css = read("styles.css");
    for (const sel of [".capture-viewfinder__light {", ".capture-viewfinder__light::after {"]) {
      const at = css.indexOf(sel);
      expect([sel, at >= 0]).toEqual([sel, true]);
      const body = css.slice(at, css.indexOf("\n}", at));
      for (const token of ["--foreground", "--background", "--primary"]) {
        expect([sel, token, body.includes(token)]).toEqual([sel, token, false]);
      }
      expect([sel, /--cam-/.test(body)]).toEqual([sel, true]);
    }
  });

  /**
   * **枠の真ん中に青い点は置かない。**（オーナー指示 2026-09-16
   * 「カメラ向けた時の真ん中の青い点消して」）
   *
   * あれは「ここに合わせる」を示す息づく点だったが、**ピントを自分で
   * 合わせられるわけではない** — 動いているのに触れない物だった。
   * 四隅の枠だけで「この中へ」は伝わる。
   *
   * 動きの側も一緒に消す。使われない `@keyframes` を残すと、「動きを減らす」
   * の一覧（`scripts/ui-audit.mjs`）に幽霊の名前が並び続ける。
   */
  it("撮る枠は四隅だけ（真ん中の点と、その息づきは残さない）", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    const at = cap.indexOf('<div className="capture-focus"');
    expect(at).toBeGreaterThanOrEqual(0);
    const box = cap.slice(at, cap.indexOf("</div>", at));
    expect((box.match(/<span \/>/g) ?? []).length).toBe(4);
    expect(box).not.toMatch(/<i \/>/);
    const css = read("styles.css");
    expect(css).not.toMatch(/\.capture-focus i \{/);
    expect(css).not.toMatch(/capture-focus-breathe/);
  });

  /**
   * **「写真」はこのアプリで撮った写真を出す。**（オーナー指示 2026-09-16
   * 「写真はこのアプリを通じて過去に撮った写真を表示する。端末の写真から
   *  単語を捕まえるわけではない」）
   *
   * 絵柄は決め打ちの記号ではなく、**いちばん新しく捕まえた1枚**。押すと
   * ホーム（アルバム）へ。端末の写真フォルダは開かない。
   */
  it("「写真」はアプリの中の写真を出す（端末の写真は開かない）", () => {
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    // アプリの札から、写真を持っているいちばん新しい1枚を選ぶ。
    expect(cap).toMatch(/queryKey: \["stickers"\]/);
    expect(cap).toMatch(/const url = stickerPhotoUrl\(s, \{ thumb: true \}\);/);
    expect(cap).toMatch(/onOpenLibrary=\{\(\) => void navigate\(\{ to: "\/home" \}\)\}/);
    // 端末の写真を選ばせる道を、この釦に付けない。
    const at = cap.indexOf("<CameraLibraryButton");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(cap.slice(at, at + 300)).not.toMatch(/input|accept=|capture=/);
  });

  /**
   * **指で払っても変わる。**（オーナー指示 2026-09-16
   * 「スライドしたら検索、スキャンに変更できる」）
   *
   * 押して選ぶのを `onClick` だけに任せられない — 指を捕まえている
   * （`setPointerCapture`）ので、払った回の `click` も外側の箱に届く。
   * だから離した所で「押した」か「払った」かを距離で分ける。
   */
  it("撮り方の帯は、押しても指で払っても変わる", () => {
    const src = codeOnly(read("components/CameraChrome.tsx"));
    expect(src).toMatch(/setPointerCapture/);
    expect(src).toMatch(/const TAP_PX = 8;/);
    expect(src).toMatch(/const SWIPE_PX = 44;/);
    expect(src).toMatch(/if \(Math\.abs\(dx\) < SWIPE_PX\) return;/);
    expect(src).toMatch(/CAMERA_MODES\[index \+ \(dx < 0 \? 1 : -1\)\]/);
  });

  /**
   * **「検索」はこの画面のまま欄が開く。**（オーナー指示 2026-09-15
   * 「そのアイコンを押した時に検索欄が出てくる」）
   * 別の画面へ渡すのは「スキャン」だけ。
   */
  it("撮る画面の「検索」は、画面を移らずに欄を開く", () => {
    const src = codeOnly(read("routes/_authenticated/capture.tsx"));
    // main で自撮りの面が足され `!selfieMode &&` が前に付いた。
    // **画面を移らずに欄を開く**という筋は変わっていない。
    expect(src).toMatch(/const textOpen = (!selfieMode && )?mode === "search"/);
    // 輪から出るのはスキャンのときだけ。
    const at = src.indexOf("<CameraModeStrip");
    expect(at).toBeGreaterThanOrEqual(0);
    const strip = src.slice(at, at + 900);
    expect(strip).toMatch(/if \(m === "scan"\)/);
    expect(strip).toMatch(/onOpenScan\(\)/);
    // 「検索」に居るときのシャッターは、撮るのではなく調べる。
    expect(src).toMatch(/if \((!selfieMode && )?mode === "search"\) \{/);
  });

  /**
   * **カメラの形をした物が、下から上がって画面いっぱいに育つ。**
   * （オーナー指示 2026-09-16、参考 `Camera transitions @SwatchThisApp`）
   *
   * 直前は「丸が少し大きくなってシャッターの位置で止まる」だけで、
   * **画面がいつ変わったのかが動きに現れなかった**。育ち切った所が新しい
   * 画面になる形にして、押した物と着いた先を1つながりにする。
   *
   * ブラウザで実測して両端を合わせてある:
   *
   * | | 実測 |
   * |---|---|
   * | 0% の板 | 49×49・下から中心 56 ＝ 帯の丸（48px・56） |
   * | 100% の板 | 390×844 ＝ 画面いっぱい |
   * | 100% の中のシャッター | 76px・下端 **80px** ＝ 本物（76px・下端 **80px**） |
   */
  it("開く演出は、カメラの形が育って本物のシャッターに重なる", () => {
    const css = read("styles.css");
    const kf = css.slice(css.indexOf("@keyframes camera-lens-open {"));
    const body = kf.slice(0, kf.indexOf("\n}"));
    // 始まりは帯の丸と同じ 48px・同じ高さ。
    expect(body).toMatch(/width: 48px/);
    expect(body).toMatch(/bottom: calc\(2rem \+ env\(safe-area-inset-bottom, 0px\)\)/);
    // 傾いた所から起き上がる（参考動画の要）。
    expect(body).toMatch(/rotate: -8deg/);
    // 育ち切ったら画面いっぱい。
    expect(body).toMatch(/width: 100vw/);
    expect(body).toMatch(/height: 100dvh/);
    // 中身はカメラの縮図（覗き窓とシャッター）。
    const lib = codeOnly(read("lib/camera-launch.ts"));
    expect(lib).toMatch(/camera-launch__eye/);
    expect(lib).toMatch(/camera-launch__shutter/);
    // 中のシャッターの着地点は px で持つ（親の大きさが動くので割合にしない）。
    const sh = css.slice(css.indexOf(".camera-launch__shutter {"));
    const shBody = sh.slice(0, sh.indexOf("\n}"));
    expect(shBody).toMatch(/bottom: calc\(5rem \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(shBody).toMatch(/width: 76px/);
  });

  /**
   * **場所を決める側は1つ。**（この回で実際に踏んだ罠）
   *
   * `.capture-viewfinder` は `position: relative` を持っていた。この
   * ファイルは cascade layer に入れていないので、`@layer utilities` に
   * 入る Tailwind の `fixed` に**必ず勝つ** — JSX に `fixed inset-0` と
   * 書いても静かに効かず、実測で幅 358px・高さ 256px のまま普通の流れに
   * 並んでいた。位置は CSS 側だけで決める。
   */
  it("撮る画面の枠は、CSS 側だけで画面いっぱいにする", () => {
    const css = read("styles.css");
    const rule = css.slice(css.indexOf(".capture-viewfinder {"));
    const body = rule.slice(0, rule.indexOf("\n}"));
    expect(body).toMatch(/position: fixed/);
    expect(body).toMatch(/inset: 0/);
    // JSX 側で位置を上書きしようとしていないこと（効かないので混乱の元）。
    const jsx = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(jsx).not.toMatch(/capture-viewfinder fixed/);
  });

  /**
   * **ステップ3の見出しは右端、決めるのは検索の釦。**（オーナー指示
   * 2026-09-15「違う単語を入力するのは一番右の。これにするは検索ボタンに」）
   */
  it("語を選ぶ面の「違う単語」は、右寄せ・検索の釦で決める", () => {
    const src = codeOnly(read("routes/_authenticated/capture.tsx"));
    const at = src.indexOf('htmlFor="manual"');
    expect(at).toBeGreaterThanOrEqual(0);
    const block = src.slice(at - 200, at + 900);
    expect(block).toMatch(/text-end/);
    expect(block).toMatch(/<Search className/);
    // Enter でも出せる（釦を押しにいかせない）。
    expect(block).toMatch(/enterKeyHint="search"/);
  });

  /**
   * **枠を被せない場面の一覧は、2箇所で同じでなければならない。**
   *
   * 雛形（`scripts/ui-harness/main.tsx` の `BARE`）と検査
   * （`scripts/ui-audit.mjs` の `BARE_SCENES`）が別々に持っている。
   * 片方だけに足すと:
   *  ・雛形だけ … 検査が「上のバーが無い(ハーネスが実物と違う)」と言う
   *    （この回、撮る画面を画面いっぱいにしたときに 7件出た）
   *  ・検査だけ … 実物に無いバーを被せたまま測り続ける
   * どちらも静かに間違うので、ここで突き合わせる。
   */
  it("枠を被せない場面の一覧が、雛形と検査で揃っている", () => {
    const pick = (src: string, name: string) => {
      const at = src.indexOf(name);
      expect(at).toBeGreaterThanOrEqual(0);
      const body = src.slice(at, src.indexOf("]", at));
      return [...body.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
    };
    const harness = fs.readFileSync(path.join(root, "../scripts/ui-harness/main.tsx"), "utf8");
    const audit = fs.readFileSync(path.join(root, "../scripts/ui-audit.mjs"), "utf8");
    const a = pick(harness, "const BARE = new Set([");
    const b = pick(audit, "const BARE_SCENES = new Set([");
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  /**
   * **カメラの画面は上の帯も出さない。**（オーナー指示 2026-09-16
   * 「カメラのとき、上の集めるの余白いらない。すべてカメラ画面でいい」）
   *
   * カメラは世界を覗く画面なので、上に半透明の帯が乗るとその高さぶん映像が
   * 削られる。しかも帯に出る名前は、下の撮り方の輪がすでに言っている。
   */
  it("撮る画面とスキャン画面は、上の帯を出さない", () => {
    const shell = codeOnly(read("components/AppShell.tsx"));
    expect(shell).toMatch(/bare\?: boolean;/);
    expect(shell).toMatch(/\{!bare && \(/);
    expect(codeOnly(read("routes/_authenticated/capture.tsx"))).toMatch(
      // main で自撮りの面も全画面になったので `|| step === "selfie"` が付いた。
      /bare=\{step === "object"( \|\| step === "selfie")?\}/,
    );
    expect(codeOnly(read("routes/_authenticated/scan.tsx"))).toMatch(
      /<AppShell title=\{t\("nav\.camera"\)\} bare>/,
    );
  });

  /**
   * **スキャンのときは下の検索も調べる釦も出さない。**（オーナー指示
   * 2026-09-16「スキャンボタン押したら下の検索や調べるボタンはすべて要らない」）
   *
   * 打って調べるのは撮り方の「検索」が持っている。同じ役目の入口を2つ置くと、
   * どちらを使う場面なのかが画面から読めなくなる。
   */
  it("スキャンの画面に、打って調べる欄を置かない", () => {
    const src = codeOnly(read("routes/_authenticated/scan.tsx"));
    expect(src).not.toMatch(/manualQuery/);
    expect(src).not.toMatch(/scan\.searchPlaceholder/);
    expect(src).not.toMatch(/scan\.searchGo/);
  });

  /**
   * **欄を畳んでも、声で調べる道は消さない。**
   *
   * 聞き取りはスキャンの検索欄の中に直に書かれていたので、その欄を畳むと
   * **機能が1つ黙って無くなる**ところだった。部品にして撮り方の「検索」へ
   * 移した。欄を消しただけで機能が減るのは、直したい形ではない。
   */
  it("声で調べる道は、部品として残り「検索」から使える", () => {
    const hook = codeOnly(read("lib/use-voice-input.ts"));
    expect(hook).toMatch(/export function useVoiceInput/);
    // 使えない端末に、押しても何も起きない釦を置かないための問い合わせ。
    expect(hook).toMatch(/export function voiceInputAvailable/);
    // 画面を離れたら必ず止める（マイクが開いたままにならない）。
    expect(hook).toMatch(/useEffect\(\(\) => \(\) => recRef\.current\?\.stop\(\), \[\]\)/);
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    expect(cap).toMatch(/useVoiceInput\(\{/);
    expect(cap).toMatch(/voice\.available && \(/);
  });

  /**
   * **台紙は描かれる前に測る。**（オーナー報告 2026-09-16
   * 「ホームに移るたびに、アルバムの画像が高速で変な縮尺で移動する不具合」）
   *
   * 測る所が `useEffect` だと、**画面に描かれたあと**に走る。札の大きさも
   * 位置も `board.w` から出しているので、最初の1〜2枚は幅 0 のまま描かれ、
   * 直後に正しい寸法へ飛ぶ。ちょうど同時に貼り付く演出（`album-open`）が
   * 走るので、「高速で変な縮尺で移動する」ように見える。
   *
   * ブラウザで数えた（ホームを開いてから 1.2 秒、毎コマ札の幅を記録）:
   *
   * | 測り方 | 幅 0 で描かれたコマ |
   * |---|---|
   * | `useEffect` | **2**（最初のコマが `[0,0,0]`） |
   * | `useLayoutEffect` | **0** |
   */
  it("ホームの台紙は、描かれる前に寸法を測る", () => {
    const src = codeOnly(read("routes/_authenticated/home.tsx"));
    const at = src.indexOf("const boardRef = useRef<HTMLDivElement | null>(null);");
    expect(at).toBeGreaterThanOrEqual(0);
    const block = src.slice(at, at + 700);
    expect(block).toMatch(/useLayoutEffect\(\(\) => \{/);
    // 同じ所が `useEffect` に戻っていないこと。
    expect(block).not.toMatch(/useEffect\(\(\) => \{\s*const el = boardRef/);
  });

  /**
   * **カメラの色は、このアプリの青から取る。**（オーナー指示 2026-09-16
   * 「カメラの画面はこのアプリと同じ青い色をベースに…デザインし直して」）
   *
   * 下の帯の丸も、捕まえた時の光も、図鑑の見出しも青。カメラだけ茶色
   * （前の版は革＋真鍮だった）だと、押した瞬間に別のアプリへ移ったように
   * 見える。地は深い青の機体、輪と縁はアプリの青、シャッターは青みの白。
   *
   * **`var(--primary)` を参照しない。** 値としては同じだが、`--primary` は
   * 見た目パックで黄にも赤にも変わる。カメラは映像の上に載るので、どの
   * パックでも同じ見え方が要る。だから値を写して固定する。
   *
   * 生の `#fff` / `#000` / `#ffd60a` を直に書かない — 名前を付けておかないと、
   * 次に触る人が同じ色を別の値で書き足して、少しずつ散らばる。
   */
  it("カメラの色は名前の付いた札から取る（生の白黒を書かない）", () => {
    const css = read("styles.css");
    for (const token of [
      "--cam-body",
      "--cam-accent",
      "--cam-accent-deep",
      "--cam-paper",
      "--cam-ink",
    ]) {
      expect([token, css.includes(token)]).toEqual([token, true]);
    }
    // カメラの部分だけを見る（アプリ全体の他の色は対象外）。
    const from = css.indexOf("撮り方のダイヤル（`components/CameraDial.tsx`）");
    expect(from).toBeGreaterThanOrEqual(0);
    const to = css.indexOf(".tabbar__lens--gone {", from);
    expect(to).toBeGreaterThan(from);
    const cam = css.slice(from, to);
    expect(cam).not.toMatch(/#ffd60a/);
    expect(cam).not.toMatch(/background:\s*#fff\b/);
    expect(cam).not.toMatch(/background:\s*#000\b/);
    // 見た目パックに引きずられない（値を写して持つ）。
    expect(cam).not.toMatch(/--cam-accent: var\(--primary\)/);
    // 真鍮の名前が残っていないこと（名前と値が食い違うと次に触る人が迷う）。
    expect(css).not.toMatch(/--cam-brass/);
  });

  /**
   * **段と % は同じ1つの数から出す。**（オーナー報告 2026-09-16
   * 「SRSは長期記憶なのに、%が覚えたの状態より低いのが変。一番下に行けば
   *  行くほど、記憶の状態がより高く % も高くして」）
   *
   * 前の作りは、段と % が**別の軸**から出ていた:
   *   ・長期記憶 … 間隔30日以上 かつ 定着度80%以上
   *   ・覚えた   … 定着度85%以上 かつ 復習3回以上
   * 条件が重なっていたので「長期記憶 82%」が「覚えた 95%」より上に並んだ。
   *
   * いまは `memoryStrength`（定着度 × 熟し）という1本の数を6つに区切る。
   * **段が上がれば % も必ず上がる。**
   */
  it("記憶の段は「強さ」1つだけから決まる（条件を継ぎ足さない）", () => {
    const mem = codeOnly(read("lib/memory.ts"));
    // 段を決める関数が受けるのは数1つ。
    expect(mem).toMatch(/export function memoryLevel\(strength: number\): MemoryLevelInfo/);
    // 境目は重ならない（下から順に1本の物差し）。
    for (const line of [
      "if (strength < 30) return LEVELS[0];",
      "if (strength < 50) return LEVELS[1];",
      "if (strength < 70) return LEVELS[2];",
      "if (strength < 85) return LEVELS[3];",
      "if (strength < 95) return LEVELS[4];",
    ]) {
      expect([line, mem.includes(line)]).toEqual([line, true]);
    }
    // 間隔や復習回数を段の条件に**戻さない**（これが逆転の原因だった）。
    expect(mem).not.toMatch(/intervalDays >= 30 && retention >= 80/);
    expect(mem).not.toMatch(/repetitions >= 3/);
    // 並べ替えも同じ数だけを見る。
    expect(mem).toMatch(/const sa = memoryOf\(a\)\.strength;/);
    expect(mem).toMatch(/const sb = memoryOf\(b\)\.strength;/);
    // 画面は `retention` ではなく強さを出す（バーも数字も）。
    const rv = codeOnly(read("routes/_authenticated/review.tsx"));
    expect(rv).toMatch(/const \{ level: lv, strength \} = memoryOf\(w\);/);
    expect(rv).toMatch(/style=\{\{ width: `\$\{strength\}%` \}\}/);
    expect(rv).not.toMatch(/\{w\.retention\}%/);
  });

  /**
   * **記憶の一覧の行は、指の下限を割らない。**（絵の検査で見つけた）
   *
   * 実測 358×32。一覧は**この画面でいちばん押される所**（押すと忘却曲線が
   * 開く）なのに、44px を 12px 割っていた。雛形に一覧が無かったので、
   * 一度も測られていなかった — 見ていない所は壊れていても分からない。
   */
  it("記憶の一覧の行は 44px 以上", () => {
    const rv = codeOnly(read("routes/_authenticated/review.tsx"));
    const at = rv.indexOf("onClick={() => onOpenWord(w)}");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(rv.slice(at, at + 400)).toMatch(/className="flex min-h-11 w-full items-center/);
    // 雛形に一覧の面があること（無ければまた測られなくなる）。
    expect(read("../scripts/ui-harness/main.tsx")).toContain('"review-memory-list"');
  });

  /**
   * **出題日の狙いは 90%。**（オーナー指示 2026-09-16「アルゴリズムを
   * 最適化して」／`lib/srs.ts` の「ずれ ②」）
   *
   * 2026-09-16 までは `S = 間隔 × ease` だったので、出題日の定着度は 67%。
   * 一方、忘却曲線の画面は「85% 付近が最適」と言い、間隔30日の語では
   * **出題日より 18日も前**を最適だと表示していた。SuperMemo / Anki / FSRS
   * と同じ 90% に揃えて、出す日と画面の言う日を噛み合わせる。
   *
   * **式を写さない。** 安定度の計算は `lib/srs.ts` の1か所だけに置く —
   * 写した先が古い式のまま残ると、同じ語が画面ごとに違う段になる
   * （実際、復習画面と曲線の2か所に写されていた）。
   */
  it("安定度の式は1か所にあり、狙いは 90%", () => {
    const srs = codeOnly(read("lib/srs.ts"));
    expect(srs).toMatch(/export const TARGET_RETENTION = 0\.9;/);
    expect(srs).toMatch(
      /const STABILITY_K = 1 \/ \(BASE_EASE \* Math\.log\(1 \/ TARGET_RETENTION\)\);/,
    );
    expect(srs).toMatch(
      /Math\.max\(0\.5, Math\.max\(1, interval_days\) \* Math\.max\(1, ease\) \* STABILITY_K\)/,
    );
    // 写しが残っていないこと。
    for (const file of [
      "routes/_authenticated/review.tsx",
      "components/ForgettingCurveChart.tsx",
    ]) {
      const src = codeOnly(read(file));
      expect([file, /Math\.max\(0\.5,[^\n]*Math\.max\(1, ease\)/.test(src)]).toEqual([file, false]);
      expect([file, src.includes("stabilityOf(")]).toEqual([file, true]);
    }
  });

  /**
   * **下の余白と、演出の着地点は同じ数で動く。**
   *
   * 2026-09-16 に下の余白を 5.5rem → 4.25rem に詰めたとき、開く演出の
   * 中のシャッターの着地点を直し忘れて **22px ずれた**。片方だけ動かすと
   * 「演出が終わった所に釦が無い」になるので、両方を門で押さえる。
   *
   * 同じ日にダイヤルを横並びの帯へ作り替えた。下の行は操作のいちばん下
   * なので、`.capture-controls` の下の余白が**そのままシャッターの下端**に
   * なる。80px にしてあるのは、下のタブ帯（下端から 71px まで）を 9px 越える
   * ため — 68px だと帯の上端に 3px 潜る。
   */
  it("下の余白を詰めたら、開く演出の着地点も一緒に動いている", () => {
    const css = read("styles.css");
    // 撮る画面の下の余白は CSS 側（`.capture-controls`）が持つ。
    const ctrl = css.slice(css.indexOf(".capture-controls {"));
    expect(ctrl.slice(0, 700)).toMatch(
      /padding: 24px 20px calc\(5rem \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    // スキャン側の逃げ場も同じ数（2つの画面で下端が違うと揃って見えない）。
    expect(codeOnly(read("routes/_authenticated/scan.tsx"))).toMatch(
      /bottom-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
    const landing = css.slice(css.indexOf(".camera-launch__shutter {"));
    expect(landing.slice(0, 400)).toMatch(
      /bottom: calc\(5rem \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    // シャッターの大きさと、下の行の余白（上の計算の元になる2つ）。
    const sh = css.slice(css.indexOf(".camera-shutter {"), css.indexOf(".camera-shutter__core"));
    expect(sh).toMatch(/width: 76px/);
    expect(css.slice(css.indexOf(".capture-actions {"))).toMatch(/margin-top: 18px/);
    // 下の帯（下端から 71px）を越えていること。
    expect(80).toBeGreaterThan(71);
  });

  /**
   * **倍率の粒は、下の帯の裏に入らない。**（オーナー報告 2026-09-16
   * 「スキャンモードの時に一番下にある被ってるもの消して」）
   *
   * スキャンのカメラ面は `fixed inset-0` なので、その中の「下端から 16px」は
   * **画面の下端から 16px**。そこには下のタブ帯（下端から 8px・高さ 63px）が
   * 浮いていて、粒 54px のうち **47px が帯の裏**に入っていた（実測。
   * 帯の裏から暗いカプセルが少しだけ覗くのがオーナーの言う「被ってるもの」）。
   *
   * 撮る画面では倍率は映像の箱の下端＝操作の帯のすぐ上に付いていて重ならない。
   * スキャンでも操作シートの高さを測って、その上に置く。
   */
  it("スキャンの倍率の粒は、操作シートの上に置く（帯の裏に入らない）", () => {
    const src = codeOnly(read("routes/_authenticated/scan.tsx"));
    // 呼ぶ側が場所を渡す（部品が勝手に画面の下端に付かない）。
    expect(src).toMatch(/zoomBottom\?: string;/);
    expect(src).toMatch(
      /zoomBottom=\{`calc\(5rem \+ env\(safe-area-inset-bottom, 0px\) \+ \$\{sheetSize\.h\}px \+ 0\.5rem\)`\}/,
    );
    // 画面の下端に貼り付ける書き方が残っていないこと。
    expect(src).not.toMatch(/className="absolute inset-x-0 bottom-4 z-10 flex justify-center"/);
  });
});

/**
 * ホーム = 雑誌の1ページ（オーナー指示 2026-09-17）
 *
 * > 「ホーム画面が単調すぎる。女性受けしないとこのアプリはヒットしない。
 * >  からホームのデザインを雑誌やホームアルバム風にしたい。ただ写真を
 * >  並べるのではなく、毎日の出来事を雑誌やるるぶのようなガイドマップの
 * >  観光モデルコースのような撮った時刻のタイムラインで紹介する。
 * >  撮ったときに書いた1言も画像のように表示する。一番上には今日の日付を
 * >  書いて、下にずっとスクロールできるようにして。」
 */
describe("ホームは今日の足あと", () => {
  const trailOnly = () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const a = home.indexOf("export function DayTimeline(");
    expect(a).toBeGreaterThan(-1);
    return home.slice(a, home.indexOf("export function ScrapbookAlbum("));
  };
  const cssBlock = (from: string, to: string) => {
    const css = read("styles.css");
    const i = css.indexOf(from);
    expect(i).toBeGreaterThan(-1);
    const j = css.indexOf(to, i);
    expect(j).toBeGreaterThan(i);
    return css.slice(i, j);
  };

  it("**並びは撮った時刻の早い順**（表から来る新しい順をそのまま出さない）", () => {
    // 朝から夜へ辿れることがこの画面の中身。表の並び（新しい順）で出すと
    // 夜から朝へ遡ることになり、「今日を1枚で読む」にならない。
    const tl = trailOnly();
    expect(tl).toMatch(/takenAt\(a\)\.getTime\(\) - takenAt\(b\)\.getTime\(\)/);
    // 時刻は `taken_at`。無い/壊れている札は保存した時刻に落とす
    // （落とさないと `Invalid Date` が並びの先頭に固まる）。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const at = home.slice(home.indexOf("function takenAt("));
    expect(at.slice(0, 260)).toMatch(/s\.taken_at \?\? s\.created_at/);
    expect(at.slice(0, 260)).toMatch(/Number\.isNaN/);
  });

  it("**紙もマスキングテープも傾きも使わない**（オーナー指示 2026-09-18）", () => {
    // > 「やっぱり背景の紙なくして。マスキングテープもなしくて。」
    // 貼り物が増えるほど1枚あたりの場所を食い、同じ画面に入る枚数が減る。
    const css = read("styles.css");
    expect(css).not.toMatch(/\.app-paper/);
    expect(css).not.toMatch(/\.day-sheet/);
    expect(css).not.toMatch(/^\.washi \{/m);
    const tl = trailOnly();
    expect(tl).not.toMatch(/washi|day-sheet|photo-print|tapesFor/);
    expect(tl).not.toMatch(/rotate: `\$\{tilt\}deg`/);
    // 地はアプリの既定に戻す（`AppShell` に紙の面を持たせない）。
    const shell = codeOnly(read("../src/components/AppShell.tsx"));
    expect(shell).not.toMatch(/app-paper|surface/);
  });

  it("**手描きの線で繋がない**（オーナー指示 2026-09-17）", () => {
    // > 「時間は青い線で繋がなくていい。…時間を書くだけでいい。」
    // 停留所の間に引いていた手描きの矢印は消した。左に通る1本の道は
    // **見本の絵（2026-09-18「今日の足あと」）そのもの**なので別物。
    const tl = trailOnly();
    expect(tl).not.toMatch(/timeline__arrow|scrap__arrow|from-left|from-right/);
    const css = read("styles.css");
    expect(css).not.toMatch(/\.timeline__arrow|\.scrap__arrow/);
    // 道は直線1本（丸の中心を通す）。
    expect(cssBlock(".trail::before {", "\n}")).toMatch(/left: 5px/);
  });

  it("**一目で見えるように詰める**（写真の高さに上限を置く）", () => {
    // > 「画像と画像の間が広すぎて見づらい。一目でぱっと今日の撮ったものが
    // >  見れるように詰めて。」
    // 縦長の写真をそのまま幅いっぱいに出すと実測 470px（画面の半分以上）に
    // なり、1画面に2枚も入らなかった。**横長より縦長にはしない。**
    const tl = trailOnly();
    expect(tl).toMatch(/Math\.min\(photoRatio\[s\.id\] \?\? 0\.625, 0\.625\)/);
    expect(cssBlock(".trail__item {", ".trail__item:last-child")).toMatch(
      /padding-bottom: 1\.25rem/,
    );
  });

  it("**写真の角は丸みを帯びさせる**", () => {
    expect(cssBlock(".trail__photo {", "\n}")).toMatch(/border-radius: 14px/);
  });

  it("**アプリが書く字はゴシック、人が書いた字は手書き**", () => {
    // > 「画像のような手書き感とこのアプリのコンセプト融合させて」
    // 時刻・語・場所はアプリが持っている事実なのでゴシックで揃え、
    // **その日の一言**と**撮ったときに書いた1言**だけを和文の手書きにする。
    // 手書きが飾りではなく「ここから先はあなたの字」という合図になる。
    const tl = trailOnly();
    expect(tl).toMatch(/trail__note handwritten-ja/);
    expect(tl).not.toMatch(/trail__time[^"]*handwritten/);
    expect(tl).not.toMatch(/trail__head[^"]*handwritten/);
    expect(tl).not.toMatch(/trail__place[^"]*handwritten/);
    // その日の一言は表紙に置く（見本の絵と同じ右上）。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const mast = home.slice(
      home.indexOf("export function DayMasthead("),
      home.indexOf("function takenAt("),
    );
    expect(mast).toMatch(/day-masthead__tagline handwritten-ja/);
  });

  it("**撮った時刻を書く**（24時間表記・数字は揃える）", () => {
    const tl = trailOnly();
    expect(tl).toMatch(/toLocaleTimeString\(locale/);
    expect(tl).toMatch(/hour12: false/);
    // 桁が揃わないと、下へ読むときに時刻の列が波打つ。
    expect(cssBlock(".trail__time {", "\n}")).toMatch(/font-variant-numeric: tabular-nums/);
  });

  it("**撮ったときに書いた1言を出す**", () => {
    // `caption` は保存はされていたが、ホームには一度も出ていなかった列。
    expect(trailOnly()).toMatch(/\{s\.caption && /);
  });

  it("**和文の手書き書体を自前で配る**（外へ取りに行かない）", () => {
    // この app はフォントを外から取りに行かない（`styles.css` 冒頭の注）。
    // オフラインで崩れる・初回描画が遅れる・端末で見た目が変わるため。
    const css = read("styles.css");
    expect(css).toMatch(/font-family: "Zen Kurenaido"/);
    expect(css).toMatch(/url\(\/fonts\/zen-kurenaido\/zk-/);
    expect(css).not.toMatch(/https:\/\/fonts\.gstatic\.com/);
    expect(css).not.toMatch(/https:\/\/fonts\.googleapis\.com/);
    // **繁體中文の画面では当てない**（和文の字形が台湾の人の画面に出る）。
    expect(css).toMatch(/:lang\(zh\) \.handwritten-ja/);
  });

  it("**明朝の切り出しは、見出しに出る字を全部持っている**", () => {
    // 見出しの明朝は**その字だけ**に絞ってある（9KB）。文言を変えたのに
    // 絞り直しを忘れると、**足りない字だけ別の書体に落ちて1つの語で書体が
    // 割れる** — このアプリが一度直した不具合と同じ形。
    const script = read("../scripts/fetch-jp-fonts.mjs");
    const m = /const TITLE_TEXT = "([^"]+)"/.exec(script);
    expect(m).toBeTruthy();
    const covered = new Set(m![1]);
    const dict = read("lib/i18n.tsx");
    const line = /"home\.todayPage": \{([^}]+)\}/.exec(dict);
    expect(line).toBeTruthy();
    const missing = [...(line![1].match(/"([^"]*)"/g) ?? []).join("")].filter(
      (c) => c !== '"' && c !== ":" && c !== " " && !/[a-zA-Z-]/.test(c) && !covered.has(c),
    );
    expect(missing).toEqual([]);
  });

  it("**「今日の日記」の欄を出さない**（オーナー指示 2026-09-17）", () => {
    // 紙の下に青いボタンが1つ座っていると、そこで誌面が終わって**アプリの
    // 画面に戻る**。日記そのものは消していない（過去の日の紙の向かいには
    // 今までどおり出るし、書く画面も残っている）。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const page = home.slice(
      home.indexOf("function HomePage()"),
      home.indexOf("export function HomeLoading"),
    );
    expect(page).not.toMatch(/<JournalLink/);
    expect(page).not.toMatch(/<JournalWritingPage/);
    // 読む道は残っている。
    expect(home).toMatch(/export function JournalLink\(/);
    expect(home).toMatch(/<DayJournalPage/);
  });

  it("**写真の無い札も、押せる大きさ**（§11 の 44px）", () => {
    // 文字で調べた語にはそもそも写真が来ない。素の1行のまま並べると
    // 実測 26px で、その日の停留所なのに押しにくかった。
    expect(cssBlock(".trail__card {", "\n}")).toMatch(/min-height: 2\.75rem/);
  });

  it("**一番上は今日の日付**（曜日 → 日付 → 明朝の見出し）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    expect(home).toMatch(/<AppShell>\s*<DayMasthead date=\{today\}/);
    const mast = home.slice(
      home.indexOf("export function DayMasthead("),
      home.indexOf("function takenAt("),
    );
    // 「9月17日木曜日」と続けない。曜日が先で、区切りは CSS に置く。
    expect(mast).toMatch(/weekday: "long" \}/);
    expect(mast).toMatch(/month: "long", day: "numeric" \}/);
    expect(mast).toMatch(/day-masthead__sep/);
    expect(mast).toMatch(/font-serif-ja/);
    // **誌名をここに書かない。** 上の帯が 40px 上で同じ語を出している。
    expect(mast).not.toMatch(/day-masthead__brand/);
  });

  it("**手書きの一言は、手元に在る事実だけで書く**", () => {
    // その日いちばん多く出てくる場所の名前と、語の数。場所が1つも無い日は
    // 場所を言わない。天気や気分のような**持っていない情報を作らない**。
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const fn = home.slice(home.indexOf("export function dayTagline("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/s\.location_name/);
    expect(body).toMatch(/home\.taglineAt/);
    expect(body).toMatch(/home\.tagline/);
    // 長い場所の名前で1行を占領させない。
    expect(body).toMatch(/top\.length > 10/);
  });

  it("**過去の日も同じ足あと**（下へスクロールすると昨日へ続く）", () => {
    const home = codeOnly(read("routes/_authenticated/home.tsx"));
    const past = home.slice(
      home.indexOf("export function PastDays("),
      home.indexOf("export function BackgroundPicker("),
    );
    expect(past).toMatch(/<DayTimeline/);
    expect(past).not.toMatch(/<ScrapbookAlbum/);
    // 開く演出は今日の1日だけ（遡るたびに走らせない）。
    expect(past).not.toMatch(/opening/);
  });

  it("**字は階調の上に置く**（`--text-*` の7段しか使わない）", () => {
    // 段の外の大きさを1つ作るたびに、画面ごとに少しずつ違う字が増える
    // （`ui-audit` が「階調に無い大きさ」で捕まえる。実測 162件出ていた）。
    const css = read("styles.css");
    const home = css.slice(css.indexOf("ホーム = 今日の足あと（オーナー指示"));
    const off = [...home.matchAll(/font-size: ([\d.]+)rem/g)].map((m) => m[1]);
    expect(off).toEqual([]);
  });

  it("**同じ選択子を2つ置かない**（`.album-bg-paper` の再発防止）", () => {
    // かつて同じ `.album-bg-paper` が `!important` 付きでもう1つ在った。
    // 後ろが勝つので、**手前を直しても何も変わらない**状態が続いていた。
    const css = read("styles.css");
    expect((css.match(/^\.album-bg-paper \{/gm) ?? []).length).toBe(1);
  });

  it("**雛形は本物の `public/` を配る**（フォントが一度も本物で出ていなかった）", () => {
    // ここを書いていなかったので vite は既定の `<root>/public`（存在しない）を
    // 見ていた。つまり `/fonts/*` が1つも配られておらず、`.handwritten` は
    // 検査の絵の中で**一度も本物の字で出ていなかった**。
    const cfg = codeOnly(read("../scripts/ui-harness/vite.config.ts"));
    expect(cfg).toMatch(/publicDir: path\.resolve\(import\.meta\.dirname, "\.\.\/\.\.\/public"\)/);
  });

  it("**指で置く台紙は消していないので、検査からも外さない**", () => {
    // ホームからは呼んでいないが、指で動かす・つまんで大きさを変える・
    // 重ねた物を上に出すはオーナーの指示で作った機能。戻すかどうかは
    // オーナーが決める。呼ばれていないからと検査から外すと、次に戻したとき
    // 誰も見ていない状態で画面に出る。
    const scene = codeOnly(read("../scripts/ui-harness/scenes/home.tsx"));
    expect(scene).toMatch(/export function HomeAlbumScene\(/);
    const main = codeOnly(read("../scripts/ui-harness/main.tsx"));
    expect(main).toMatch(/"home-album": HomeAlbumScene/);
    const audit = read("../scripts/ui-audit.mjs");
    expect(audit).toMatch(/crossThemes\("home-album", \{ scene: "home-album" \}\)/);
  });

  it("**迎える面の言葉**（日常があなただけの単語帳に／撮って、集めて、覚えよう）", () => {
    const dict = read("lib/i18n.tsx");
    expect(dict).toMatch(/"auth\.heroA": \{ ja: "日常が"/);
    expect(dict).toMatch(/ja: "あなただけの単語帳に。"/);
    // 下の1行は**そのまま**（オーナー「撮って、集めて、覚えようはそのままでいい」）。
    expect(dict).toMatch(/ja: "撮って、集めて、覚えよう。"/);
    expect(dict).not.toMatch(/街で出会う言葉を、ステッカーに。/);
  });

  it("**迎える面は、角の丸い写真を傾けて重ねる**（ステッカーではない）", () => {
    const auth = codeOnly(read("routes/auth.tsx"));
    expect(auth).toMatch(/auth-photo auth-photo--/);
    expect(cssBlock(".auth-photo {", ".auth-photo img")).toMatch(/border-radius: 1\.125rem/);
    // 3枚とも違う傾き（揃えると貼った物に見えない）。
    const rot = [
      ...read("styles.css").matchAll(/\.auth-photo--[abc] \{[\s\S]*?rotate: (-?[\d.]+)deg/g),
    ].map((m) => m[1]);
    expect(new Set(rot).size).toBe(3);
  });

  it("**写真が無くても壊れない**（`public/welcome/` は任意）", () => {
    // 手元に写真を持っていないので、**無い物を描かない**。読めなければ
    // その1枚を隠して、淡い地のまま出す。
    const auth = codeOnly(read("routes/auth.tsx"));
    expect(auth).toMatch(/onError=\{\(e\) => \{/);
    expect(auth).toMatch(/e\.currentTarget\.style\.display = "none"/);
  });

  it("**面と通信を分けてある**（雛形から迎える面を描ける）", () => {
    const auth = codeOnly(read("routes/auth.tsx"));
    expect(auth).toMatch(/export function AuthView\(/);
    const scene = codeOnly(read("../scripts/ui-harness/scenes/auth.tsx"));
    expect(scene).toMatch(/import \{ AuthView \} from "@\/routes\/auth"/);
    const main = codeOnly(read("../scripts/ui-harness/main.tsx"));
    expect(main).toMatch(/auth: AuthScene/);
    const audit = read("../scripts/ui-audit.mjs");
    expect(audit).toMatch(/crossThemes\("auth", \{ scene: "auth" \}\)/);
  });

  it("**見比べの帯は、いま直した画面を先頭に出す**", () => {
    // Netlify の Deploy Preview は**この雛形**を配っている（`netlify.toml`）。
    // `REVIEW_SCENES` を古いままにすると、開いた人は直していない画面を見て
    // 「昔のプレビューのままだ」と言うことになる（実際そう報告された）。
    const main = codeOnly(read("../scripts/ui-harness/main.tsx"));
    const list = main.slice(
      main.indexOf("const REVIEW_SCENES"),
      main.indexOf("const explicitScene"),
    );
    expect(list).toMatch(/\{ scene: "home"/);
    expect(list).toMatch(/\{ scene: "auth"/);
    // 先頭は何も打たずに開いた人が最初に見る面。
    expect(list.slice(0, list.indexOf("},"))).toMatch(/scene: "home"/);
  });
});

/**
 * 実際に描いて測って見つけた不具合（2026-09-22）。
 * 「機能不具合、デザインの不具合、ユーザーが不自然に感じる箇所」を
 * 探す指示で、絵を出して **指で押せる大きさ・横のはみ出し・声の案内**
 * を測った結果いくつ出たものだけを、ここに固定する。
 */
describe("狭い画面と指と声", () => {
  it("**使う場面の計器に rem の下限を置かない**（1枠が card 全体を押し広げる）", () => {
    // 320px でも、文字を 125% にしても、`minmax(7.5rem, …) minmax(10rem, …)`
    // の 17.5rem + 余白が譲らないので、grid の1本の列が最小幅を決める仕組みで
    // **単語カードの全部の段**が横にはみ出していた（実測 8px / 54px）。
    const css = read("styles.css");
    const block = css.slice(
      css.indexOf("\n.usage-context__metrics {"),
      css.indexOf("\n.usage-metric,"),
    );
    expect(block).toMatch(/grid-template-columns: minmax\(0, [\d.]+fr\) minmax\(0, [\d.]+fr\)/);
    expect(block).not.toMatch(/minmax\([\d.]+rem/);
    // 狭いときは縦に積む。幅の条件も rem なので、文字を大きくした人にも効く。
    expect(css).toMatch(/@media \(max-width: [\d.]+rem\) \{\n\s*\.usage-context__metrics \{/);
  });

  it("**記憶の帯は指の下限(44px)を満たす**", () => {
    // 帯そのものは 28px しかない。見た目を変えずに、当たり判定だけを
    // 上下に広げる（この作業場で前から使っている見えない `::before`）。
    const rv = codeOnly(read("routes/_authenticated/review.tsx"));
    const head = rv.slice(rv.indexOf("aria-expanded={memListOpen}"));
    expect(head.slice(0, 200)).toContain(
      "relative w-full text-left before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
    );
    // 雛形が実物と違う形で包むと、検査は実物を映さなくなる。
    const scene = codeOnly(read("../scripts/ui-harness/scenes/review.tsx"));
    expect(scene).toMatch(/before:absolute before:inset-x-0 before:-inset-y-2/);
  });

  it("**記憶の帯は色だけで語らない**（畳んでいても字で読める）", () => {
    // 畳んでいる間、この帯の中に字は1つも無かった。包んでいるボタンの
    // 名前も空になり、声の案内は「ボタン」としか読まなかった。
    const rv = codeOnly(read("routes/_authenticated/review.tsx"));
    const sum = rv.slice(rv.indexOf("export function MemoryLevelSummary"));
    expect(sum).toMatch(/\{!expanded && \(\n\s*<span className="sr-only">/);
    expect(sum).toMatch(/t\("review\.memoryBreakdown"\)/);
    const i18n = read("lib/i18n.tsx");
    expect(i18n).toMatch(
      /"review\.memoryBreakdown": \{ ja: "[^"]+", en: "[^"]+", "zh-TW": "[^"]+" \}/,
    );
  });

  it("**押すためだけの隠し input は、指にも声にも渡さない**", () => {
    // シャッターが `.click()` で代わりに開く控えの口。`sr-only` のままだと
    // キーボードの順番にも声の案内にも「名前の無い欄」として現れていた。
    const cap = codeOnly(read("routes/_authenticated/capture.tsx"));
    const box = cap.slice(cap.indexOf("ref={cameraInputRef}"));
    expect(box.slice(0, 300)).toMatch(/tabIndex=\{-1\}/);
    expect(box.slice(0, 300)).toMatch(/aria-hidden="true"/);
  });

  it("**打つ欄の名前を placeholder 頼りにしない**", () => {
    // placeholder は打ち始めた瞬間に消える。消えた後も何の欄か分かるように。
    const sheet = codeOnly(read("components/InputCatchSheet.tsx"));
    expect(sheet).toMatch(/aria-label=\{t\("sheet\.inputPlaceholder"\)\}/);
    expect(sheet).toMatch(
      /aria-label=\{isPhrase \? t\("input\.scene"\) : t\("input\.sceneWord"\)\}/,
    );
  });
});
