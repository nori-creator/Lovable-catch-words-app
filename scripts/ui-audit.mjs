/**
 * 画面の見た目を、実機なしで見る・機械で採点する。
 *
 * ## なぜ要るか
 * 目視でしか詰められないように見えるものにも、目では気づけない不具合
 * (コントラスト未達・タップ領域不足・横はみ出し・焦点が見えない)が
 * 混ざる。先に機械で落としてから目で見る。
 *
 * ## **本物のコンポーネントを描く**
 * 以前この検査は棚のHTMLを手書きで複製していた。つまり
 * **コンポーネントを直しても画像は変わらない** — 検査が合格しても、
 * 実物が同じように描かれている保証がどこにも無かった(独立監査の指摘)。
 * 実際、空の棚の実レイアウトは一度も写っていなかった。
 *
 * いまは `scripts/ui-harness/` を Vite で組み、本物のコンポーネントと
 * 本物の `styles.css` を読み込んだページを Playwright で開く。
 * 場面はURLの検索文字列で切り替える。
 *
 * ## 何を見ていないか(**書いておく**)
 *
 * ここには一度「**ルート直書きのまま検査に入っていない画面は、もう無い**」と
 * 書いてあった。**嘘だった。** 復習・ホーム・設定を入れ終えた時に書いた
 * つもりの一文が、そのまま全体の話として残っていた。
 * 何を見ていないかを書き留める場所が「見ていない物は無い」と言っていたら、
 * この一覧そのものが役に立たない。数えた結果を置く。
 *
 * ### 場面が在る(本物のコンポーネントを描いている)
 *   home / review / settings / dex(棚・空・空振り) / dex.$stickerId(札の詳細)
 *   と、画面をまたぐ部品(取得の失敗・語のかたまり・忘却曲線・発音・
 *   スキャンの詳細・出会いの記録・色の土台)
 *
 * ### 場面がまだ無い
 *   ・**撮っている最中の面だけ**が `<video>` を持つ。偽の映像を流し込む
 *     仕掛けが先に要るのはそこだけ。
 *     「カメラ依存」で `capture`(1106行)と `scan`(1425行)を丸ごと未検査に
 *     していたのは大雑把すぎた — `capture` は**8段のうち6段**が、`scan` は
 *     `<video>` が**1箇所だけ**で、撮った後の面は静止画の上に描かれる。
 *     いま入っているのは語を選ぶ面・再会の面・圏外で預かった面・
 *     語の札(5通り)・結果の一覧・見つからなかった面。
 *     まだ入っていないのは、撮った枠に印が乗る面・カードの面・保存中。
 *   ・`journal` / `feed` / `discover` / `u.$userId` / `post.$postId` /
 *     `notifications` / `onboarding` — 人に見せる側の画面。どれも
 *     問い合わせを持つルート直書きなので、出すには切り出しが要る。
 *   ・`admin.metrics` / `admin.dictionary` — 管理者だけが見る。
 *   ・`auth` / `reset-password` / `terms` / `privacy` — 入口と法務。
 *
 * つまり**画面の数で言えば、見ているのは半分に満たない**。
 * 合格は「見た所に欠陥が無い」であって、「欠陥が無い」ではない。
 *
 * ### 見た目の方針として**わざと固定してある色**(直さない)
 * ・写真を載せる面は**テーマに関係なく白**。アルバムの印画紙も、
 *   撮った直後のカードの表(`from-sky-50 to-white`)も同じ考え。
 *   暗いテーマでは白い面が明るく浮くが、**それは欠陥ではなく決め事**。
 *   文字が乗らないので機械も落とさない。次の周で「暗い面で浮いている」と
 *   言いたくなったら、まずここを読むこと — 変えるならオーナーの判断。
 * ・撮った枠に乗る印(白・緑・琥珀)も固定。写真の上に置く光なので、
 *   テーマで色を変えると意味(はじめて/持っている/再会)が崩れる。
 *   **地が固定なら、その上に載せる字も固定にする**(そこを間違えて
 *   暗い面で白い印の上の白い字になっていた)。
 *
 * ### 検査機のフォント都合で、絵が実機と違う所
 * ・**この容器には CJK の太字が1つも無い**(`WenQuanYi Zen Hei Regular` だけ)。
 *   `font-semibold` の付いた和文は Chrome が太さを合成するが、**幅は細字の
 *   ままで組む**ので、太った字が隣にはみ出して重なって写る
 *   (入れて最初に見る画面の「瞬間的に」で確認)。
 *   **実機の話ではない** — iOS の PingFang / Hiragino には実物の太字が
 *   在るので、幅も正しく出る。ここを app の欠陥として直してはいけない。
 *   絵で字の重なりを見たら、まず `fc-match "sans-serif:lang=ja:weight=bold"` を見る。
 *
 * ### 見えているが、絵が実物と同じ意味ではない所
 * ・`WordCard` の `SECTION_THEME`(節ごとの淡い色の表、36箇所)は
 *   **明るい面の前提で固定**されている。暗いテーマに追従しないことは
 *   分かっているが、直すには「暗い面で節をどう見せるか」を決める必要が
 *   あるので、色の付け替えだけを先にやらない。ここに場面を足してから直す。
 * ・**`word-card` の場面は、実物では畳まれている面を開いた状態で撮っている。**
 *   語の詳細(`dex.$stickerId`)の既定の見え方は
 *     戻る → 写真(表裏) → 見出し語・意味・品詞 → 語の木 →
 *     出会った記録 → `<details>`「すべて見る」(**閉じている**) → 記憶の曲線
 *   で、`WordCard` はその `<details>` の中。独立監査3体はこの場面を
 *   「一番長く見られる画面」として採点したが、**既定では開いていない**。
 *   指摘そのもの(節の重さが揃っている等)は開いた状態の話として有効だが、
 *   重み付けは実物と違う。**詳細画面そのものの場面はまだ無い** —
 *   ルートが問い合わせを持つので、出すには切り出しが要る。
 *
 * ## 測り方の原則
 * **数字は自分で作らない。ブラウザに測らせる。**
 *  ・色は canvas に塗らせて読み返す(oklch も color-mix も正しく出る)
 *  ・板や輪郭は**撮った絵の画素**で比べる(グラデーションや影は計算値に無い)
 *  ・新しい門は、わざと壊した入力で落ちることを見るまで信用しない
 *
 * ## 使い方
 *   node scripts/ui-audit.mjs            判定だけ
 *   UI_VERBOSE=1 node scripts/ui-audit.mjs   実測値も出す
 *   → /tmp/ui-audit/ui-*.png と、判定結果(終了コード)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";

const OUT = process.env.UI_OUT || "/tmp/ui-audit";
const HARNESS_DIR = path.resolve("scripts/ui-harness");
const HARNESS_OUT = path.resolve(".ui-harness");

// **毎回組み直す。** 古い成果物を使うと、また「直したのに画像が変わらない」
// に戻る(それを潰すための作り替えなので、ここで手を抜くと意味がない)。
try {
  execFileSync("npx", ["vite", "build", "--config", path.join(HARNESS_DIR, "vite.config.ts")], {
    // 失敗した理由をそのまま出す。`pipe` で握り潰していたので、
    // 組み立てが壊れても `Command failed` としか出ず、下の親切な
    // メッセージにも到達していなかった。
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch {
  console.error("ハーネスを組めなかった(上の vite の出力を見る)。");
  process.exit(1);
}
if (!fs.existsSync(path.join(HARNESS_OUT, "index.html"))) {
  console.error("ハーネスを組めなかった。");
  process.exit(1);
}
// **file:// ではなく http で出す。**
// file:// で連続して開くと、5枚目あたりから CSS が付かないまま描かれて
// トークンが空になった(--shelf-shadow が空文字で返る)。原因を追うより、
// 本物と同じ経路(http)で出すほうが確実で、実物にも近い。
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path.join(HARNESS_OUT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(HARNESS_OUT) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const type = file.endsWith(".css")
    ? "text/css"
    : file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".html")
        ? "text/html"
        : "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

/**
 * ハーネスの場面をURLの検索文字列で表す。
 *
 * `click` だけは URL に載せない — 開いたあとに押す指示なので、
 * ハーネスではなく検査の側の都合。
 */
const sceneUrl = (base, { scene = "shelf", click: _click, ...rest } = {}) => {
  const q = new URLSearchParams({ scene, ...rest });
  return `${base}?${q}`;
};

/**
 * 見る面の一覧: [名前, `<html>` に付ける属性, 高コントラストか]。
 *
 * `.dark` だけを見ていたのが穴だった。**暗い data-ui-theme は `.dark` を
 * 付けない** — `--background` を暗くするだけなので、`.dark` 前提で書いた
 * 上書きはこの5テーマに一切届かない。同じ取りこぼしを2回踏んでいる
 * (縁が白く光る件、高コントラストで棚板が濃くならない件)ので、
 * 代表として darkroom を明るい面・暗い面と同格で並べる。
 */
/**
 * 同じ場面を4通りで見る: 明るい面 / 暗い面 / 高コントラスト明 / 高コントラスト暗。
 *
 * **暗い側の高コントラストを外していたのが穴だった。** 棚の一覧には
 * `contrast-dark` が入っているのに、ここだけ明るい側しか作っていなかったので、
 * 「高コントラストを頼んだ暗い面のユーザーにだけ届かない」種類の不具合が
 * 構造的に通り抜けていた(実際、暗い高コントラストの `text-primary` は
 * 通常のテーマより悪くなっていた)。
 */
const crossThemes = (name, scene) => [
  [name, "", false, scene],
  [`${name}-dark`, 'class="dark"', false, scene],
  [`${name}-contrast`, "", true, scene],
  [`${name}-contrast-dark`, 'class="dark"', true, scene],
];

const MODES = [
  ["light", "", false, {}],
  ["dark", 'class="dark"', false, {}],
  ["darkroom", 'data-ui-theme="darkroom"', false, {}],
  ["contrast", "", true, {}],
  ["contrast-dark", 'class="dark"', true, {}],
  ["contrast-darkroom", 'data-ui-theme="darkroom"', true, {}],
  // 見え方は**1つだけ**になった(素材と背表紙をやめた)。
  // 掛け合わせが無いので、ここに変種を並べる必要も無い。
  // **AI が作った「その人だけの棚」が混ざった図鑑。**
  // 新しい棚は既定の棚の後ろに、新しい部屋(祈る)は既定の8部屋の後ろに
  // 生える。既にある棚の位置が動いていないことは、並べて見るしかない。
  ["custom-shelves", "", false, { custom: "1" }],
  ["custom-shelves-dark", 'class="dark"', false, { custom: "1" }],
  // 棚に1件も無いとき、**空の棚を並べない**ことの見張り。
  // 昔ここを撮っていなかったせいで「54棚が全部空で数画面ぶん流れる」に
  // 気づけなかった。
  //
  // **これは「空の図鑑」の絵ではない。** ルートは `captured.length === 0` を
  // 手前で分岐するので、`DexShelf` に0件が渡ることは実物では起きない。
  // 始めたばかりの人が実際に見る面は下の `dex-empty`。
  // (独立監査が「図鑑の空が真っ白」と指摘した — 指摘そのものは実物では
  //  外れていたが、**本物の空の面を一度も撮っていなかった**のは当たり。)
  ["shelf-zero-light", "", false, { count: 0 }],
  ["shelf-zero-dark", 'class="dark"', false, { count: 0 }],

  // ── 棚以外。**棚しか見ていなかった**のがこれまでの穴。
  //
  // 明るい面・暗い面・高コントラストの3面ずつ見る。ここに入れているのは
  // **描かれる markup が本物と同じもの**だけ。ルートに直書きされていた画面は、
  // ルート側に `export` を足してハーネスから本物を描くようにしてから入れる
  // (復習・ホーム・設定はそうした)。似たHTMLを書き写すことはしない —
  // それをやると、棚で潰したはずの「実物と違うものを見る検査」に戻る。
  // 何を見て何を見ていないかは README ではなく、ここの一覧が事実として示す。
  ...crossThemes("tokens", { scene: "tokens" }),
  ...crossThemes("failed", { scene: "load-failed" }),
  // 再試行中は**見出しも文言もボタン名も**変わる。以前はアイコンが回るだけで、
  // 押せたのかどうか分からなかった(独立監査の指摘)。
  ["failed-retrying", "", false, { scene: "load-failed", variant: "retrying" }],
  // 何を読み込めなかったかを名指しした面。
  ["failed-named", "", false, { scene: "load-failed", variant: "named" }],
  ...crossThemes("chunks", { scene: "chunks" }),
  ...crossThemes("curve", { scene: "curve" }),
  ...crossThemes("pron", { scene: "pronunciation" }),
  ...crossThemes("detail-ai", { scene: "scan-detail" }),
  ...crossThemes("detail-verified", { scene: "scan-detail", variant: "verified" }),
  // **出来上がった側**。今まで骨組みしか撮っていなかったので、
  // このシートの中身(解説そのもの)は一度も機械の目に映っていなかった。
  ...crossThemes("detail-ready", { scene: "scan-detail", variant: "ready" }),
  // 生成に失敗した面。
  ["detail-failed", "", false, { scene: "scan-detail", variant: "failed" }],
  ["detail-failed-dark", 'class="dark"', false, { scene: "scan-detail", variant: "failed" }],
  // 復習 — **アプリの中心なのに、中身がルートに直書きで一度も見ていなかった**。
  ...crossThemes("review-memory", { scene: "review-memory" }),
  // 見出し(「3 / 12」の進捗と進捗バー、出題の型の切替)も一緒に描く。
  // 以前は札だけだったので、独立監査が「クイズに進捗が無い」と誤指摘した
  // — 実物には最初からある。**部品だけを切り出した絵は、その画面の絵ではない。**
  ...crossThemes("review-choice", { scene: "review-choice" }),
  ...crossThemes("review-explain", { scene: "review-explain" }),
  // 押したあとの面。正解と不正解でそれぞれ色が変わる。
  ...crossThemes("review-right", { scene: "review-choice", click: "ul li:nth-child(1) button" }),
  ...crossThemes("review-wrong", { scene: "review-choice", click: "ul li:nth-child(2) button" }),
  // 記憶の段階で形が変わる所(要望 #32)。**3つの形が全部出ることを見る** —
  // ★の段を確率で切って3段しか使っていなかったのと同じ取りこぼしを避ける。
  ...crossThemes("review-say", { scene: "review-say" }),
  ...crossThemes("review-say-ok", { scene: "review-say-result" }),
  ...crossThemes("review-say-ng", { scene: "review-say-result", variant: "ng" }),
  ...crossThemes("review-mode-tabs", { scene: "review-mode-tabs" }),
  ...crossThemes("retake-suggestion", { scene: "retake-suggestion" }),
  ...crossThemes("tocfl-ladder", { scene: "tocfl-ladder" }),
  ["review-mode-speaking", "", false, { scene: "review-mode-tabs", variant: "speaking" }],
  ["review-mode-choice", "", false, { scene: "review-mode-tabs", variant: "choice" }],
  ...crossThemes("review-empty", { scene: "review-end" }),
  ...crossThemes("review-done", { scene: "review-end", variant: "done" }),
  // 数えていない回(完了だけ)。「0問中0問正解」を出さないことの見張り。
  ["review-done-nocount", "", false, { scene: "review-end", variant: "done-nocount" }],
  // ホーム — **起動して最初に見る面**。これも直書きだったので未検査だった。
  ...crossThemes("home", { scene: "home" }),
  // **入れて最初に見る画面。** 上のバーも下タブも無い全画面なので、
  // 雛形の枠を外して撮る(`BARE`)。
  ...crossThemes("onboarding", { scene: "onboarding" }),
  ["onboarding-starting", "", false, { scene: "onboarding", variant: "starting" }],
  ...crossThemes("home-empty", { scene: "home-empty" }),
  // 読み込み中の面。**起動するたびに必ず通る**のに一度も撮っていなかった。
  ...crossThemes("home-loading", { scene: "home-loading" }),
  ...crossThemes("review-loading", { scene: "review-loading" }),
  ...crossThemes("home-past", { scene: "home-past" }),
  ["home-past-week", "", false, { scene: "home-past", span: "week" }],
  ["home-past-month", "", false, { scene: "home-past", span: "month" }],
  ...crossThemes("home-writing", { scene: "home-writing" }),
  // ホームの本棚と見開き(オーナー指摘 2026-08-21 ⑬⑭)。
  // **束ね方を3通りとも撮る** — 週と月は「小さく・多く」が注文なので、
  // 実際にそうなっているかは絵でしか分からない。
  ...crossThemes("home-shelf", { scene: "home-shelf" }),
  ["home-spread", "", false, { scene: "home-spread" }],
  ["home-spread-dark", 'class="dark"', false, { scene: "home-spread" }],
  ["home-spread-week", "", false, { scene: "home-spread", span: "week" }],
  ["home-spread-month", "", false, { scene: "home-spread", span: "month" }],
  // 1枚選んだ形(左に絵・右に日記)。
  ["home-spread-picked", "", false, { scene: "home-spread", click: ".album-tile" }],
  ...crossThemes("wordbook-shelf", { scene: "wordbook-shelf" }),
  // 冊数が増えたときの棚。**横にあふれないか・題が読めるか**は絵で見る。
  ["wordbook-shelf-many", "", false, { scene: "wordbook-shelf", many: "1" }],
  ["wordbook-shelf-many-dark", 'class="dark"', false, { scene: "wordbook-shelf", many: "1" }],
  ...crossThemes("wordbook-quiz", { scene: "wordbook-quiz" }),
  // 答え合わせのあと(正解を押した / 間違いを押した)。色の付き方を見る。
  ...crossThemes("wordbook-quiz-right", {
    scene: "wordbook-quiz",
    click: "ul li:nth-child(2) button",
  }),
  ...crossThemes("wordbook-quiz-wrong", {
    scene: "wordbook-quiz",
    click: "ul li:nth-child(1) button",
  }),
  ["wordbook-quiz-nomeaning", "", false, { scene: "wordbook-quiz-nomeaning" }],
  // 台紙は4種類ある。選べるようにしたものは全部見る — 紙以外の3種は
  // 見出し語(濃い墨色の直書き)を載せる面なので、暗い側も含めて見る。
  ["home-frame", "", false, { scene: "home", bg: "frame" }],
  ["home-notebook", "", false, { scene: "home", bg: "notebook" }],
  ["home-cork", "", false, { scene: "home", bg: "cork" }],
  ["home-cork-dark", 'class="dark"', false, { scene: "home", bg: "cork" }],
  // 圏外で撮って預かっている写真の帯。**オフラインでしか出ない**ので、
  // 目で見る機会が構造的に無い。
  ...crossThemes("home-pending", { scene: "home-pending" }),
  ["home-pending-confirm", "", false, { scene: "home-pending", variant: "confirm" }],
  // 設定 — **切替・選択・取り消せない操作**が集まる画面。これで
  // ルート直書きのまま未検査の画面がゼロになる。
  ...crossThemes("settings-choices", { scene: "settings-choices" }),
  ...crossThemes("settings-selects", { scene: "settings-selects" }),
  ...crossThemes("settings-toggles", { scene: "settings-toggles" }),
  ...crossThemes("settings-danger", { scene: "settings-danger" }),
  // 単語カード — 節ごとの淡い色が13種類。**明るい面の前提で固定**されている
  // ことは分かっていたが、直す前にまず見えるようにする。
  // **語の詳細の既定の見え方。** 写真(表裏)・いつどこで・見出し語と意味。
  // これまで撮っていたのは `WordCard` を裸で描いた絵だけで、実物では
  // それは `<details>` の中で閉じている。この画面は一度も撮っていなかった。
  // **語の詳細そのもの。** 実物の既定の並びを丸ごと描く
  // (「すべて見る」は**閉じたまま** — 開いた中身は `word-card` が受け持つ)。
  ...crossThemes("sticker-detail", { scene: "sticker-detail" }),
  // 上半分だけを大きく見る面。写真の裏表と「いつ・どこで」。
  ...crossThemes("sticker-hero", { scene: "sticker-hero" }),
  // **ホームで写真を押すと開く面。** この app でいちばん大きい未検査の
  // 画面だった(929行)。取り消せない操作(削除の2段目)まで撮る。
  ...crossThemes("sheet", { scene: "sticker-sheet" }),
  // 解説の**共有キャッシュ**が効いている側(2026-08-24)。
  // 既定の `sheet` はキャッシュに無い語 = 古い `words` の列に落ちる側。
  // **両方撮る** — 落ちる側が壊れていても、キャッシュが効いている環境では
  // 気づけない(移行が当たる前の全員がその側に居る)。
  ["sheet-cached", "", false, { scene: "sticker-sheet", cached: "1" }],
  ["sheet-cached-dark", 'class="dark"', false, { scene: "sticker-sheet", cached: "1" }],
  // 撮ったあとに語を選ぶ面と、同じものに再会した面。
  // **`capture.tsx` を丸ごと「カメラ依存」にして未検査にしていたが、
  // 8段のうち6段はカメラと関係が無かった。**
  ...crossThemes("cap-pick", { scene: "capture-pick" }),
  ...crossThemes("cap-reunion", { scene: "capture-reunion" }),
  ["cap-reunion-saving", "", false, { scene: "capture-reunion", variant: "saving" }],
  // 語の印を押したときの札。**scan でいちばん読む所**で、素の Tailwind の
  // 番号がいちばん密に残っている所でもある。
  ...crossThemes("chip-new", { scene: "scan-chip" }),
  ...crossThemes("chip-reunion", { scene: "scan-chip", variant: "reunion" }),
  ["chip-owned", "", false, { scene: "scan-chip", variant: "owned" }],
  ["chip-owned-dark", 'class="dark"', false, { scene: "scan-chip", variant: "owned" }],
  ["chip-candidates", "", false, { scene: "scan-chip", variant: "candidates" }],
  ["chip-candidates-dark", 'class="dark"', false, { scene: "scan-chip", variant: "candidates" }],
  ["chip-expanding", "", false, { scene: "scan-chip", variant: "expanding" }],
  // 見つかった語の一覧。**3通りの出会い方を1つずつ**入れてある。
  // ガラスのシートなので、下に写真を敷いて撮る(白地だと実際より読みやすく写る)。
  ...crossThemes("scan-found", { scene: "scan-found" }),
  // 撮ったのに何も見つからなかった面。**失敗ではなく結果**なので警告にしない。
  ...crossThemes("scan-nothing", { scene: "scan-nothing" }),
  // 撮った枠に印が乗る面。**scan の中心**で、素の番号がいちばん密な所。
  ...crossThemes("scan-dots", { scene: "scan-dots" }),
  // 圏外で撮って端末に預かった面。オフラインのときにしか出ない。
  ...crossThemes("cap-offline", { scene: "capture-offline" }),
  ["cap-offline-reason", "", false, { scene: "capture-offline", variant: "reason" }],
  // 生成が終わったカードの面。**撮るたびに必ず通る。** 表と裏の両方。
  ...crossThemes("cap-card", { scene: "capture-card" }),
  ...crossThemes("cap-card-back", { scene: "capture-card", variant: "back" }),
  ["cap-card-noselfie", "", false, { scene: "capture-card", variant: "noselfie" }],
  // 日記の添削の結果。**学習の中心機能のひとつ**なのに未検査だった。
  ...crossThemes("journal-result", { scene: "journal-result" }),
  // 書く前の足場(要望 #88)。**白紙を渡していないか**を絵で見る。
  ...crossThemes("journal-scaffold", { scene: "journal-scaffold" }),
  // 語を選ぶ札。**打ち込んだ語の側は場面が1つも無かった。**
  ...crossThemes("word-candidate", { scene: "word-candidate" }),
  // 打ち込みキャッチ。**2度「機能してない」と言われた画面**なのに、
  // ここまで場面が1つも無く、壊れた姿を機械が一度も見ていなかった。
  ...crossThemes("input-catch", { scene: "input-catch" }),
  ["input-catch-typed", "", false, { scene: "input-catch", variant: "typed" }],
  ["input-catch-loading", "", false, { scene: "input-catch", variant: "loading" }],
  ...crossThemes("input-catch-error", { scene: "input-catch", variant: "error" }),
  // 主役の写真を選ぶ面(要望 #17)。前は `window.confirm` の素の窓だった。
  ...crossThemes("hero-picker", { scene: "hero-picker" }),
  ["hero-picker-few", "", false, { scene: "hero-picker", variant: "few" }],
  ["hero-picker-picked", "", false, { scene: "hero-picker", variant: "picked" }],
  ...crossThemes("hero-picker-cutout", { scene: "hero-picker", variant: "cutout" }),
  ["journal-result-compact", "", false, { scene: "journal-result", variant: "compact" }],
  ["sheet-selfie", "", false, { scene: "sticker-sheet", variant: "selfie" }],
  ["sheet-armed", "", false, { scene: "sticker-sheet", variant: "armed" }],
  ["sheet-armed-dark", 'class="dark"', false, { scene: "sticker-sheet", variant: "armed" }],
  ["sheet-deleting", "", false, { scene: "sticker-sheet", variant: "deleting" }],
  ["sheet-failed", "", false, { scene: "sticker-sheet", variant: "failed" }],
  ["sheet-candidates", "", false, { scene: "sticker-sheet", variant: "candidates" }],
  ["sheet-pro", "", false, { scene: "sticker-sheet", variant: "pro" }],
  // 写真が1枚しか無いカード。**「撮った写真」の区画が出ないこと**が正しい姿
  // (上に同じ絵が大きく出ているので、小さく並べ直しても高さが増えるだけ)。
  ["sheet-onephoto", "", false, { scene: "sticker-sheet", variant: "onephoto" }],
  // ヘッダーのアイコンを押すと出る自分の記録。数字が届く前も撮る。
  ["user-panel", "", false, { scene: "user-panel" }],
  ["user-panel-dark", 'class="dark"', false, { scene: "user-panel" }],
  ["user-panel-loading", "", false, { scene: "user-panel", loading: "1" }],
  // 場所の知らせ。上から降りてくる帯。写真が無いカードの姿も見る。
  ["place-memory", "", false, { scene: "place-memory" }],
  ["place-memory-dark", 'class="dark"', false, { scene: "place-memory" }],
  ["place-memory-nophoto", "", false, { scene: "place-memory", nophoto: "1" }],
  // 口語⇄書面のメーター、5段すべて + 古いカード + 出さない場合。
  // 1段でも撮り漏らすと、その位置と言葉は一度も測られない。
  ["register-meter", "", false, { scene: "register-meter" }],
  ["register-meter-dark", 'class="dark"', false, { scene: "register-meter" }],
  // 出会う見込みとレア度。★1〜★5と出所3通りを1枚で見る。
  ["encounter", "", false, { scene: "encounter" }],
  ["encounter-dark", 'class="dark"', false, { scene: "encounter" }],
  // 保存中の暗転。**撮るたびに必ず通るのに一度も測っていなかった。**
  // 飛行が始まった後は空に見えるのが正しい姿(飛ぶ絵は別の層が描く)。
  ["capture-saving", "", false, { scene: "capture-saving" }],
  ["capture-saving-landing", "", false, { scene: "capture-saving", landing: "1" }],
  // 覗いている最中に映像の上へ載る操作。倍率を持たない端末の姿も見る。
  ["scan-camera", "", false, { scene: "scan-camera" }],
  ["scan-camera-nozoom", "", false, { scene: "scan-camera", nozoom: "1" }],
  ...crossThemes("word-card", { scene: "word-card" }),
  ...crossThemes("word-card-empty", { scene: "word-card-empty" }),
  // **本物の「図鑑が空」**と、検索が空振りした面。始めたばかりの人が
  // 最初に見る面なのに、ここまで一度も撮っていなかった。
  ...crossThemes("dex-empty", { scene: "dex-empty" }),
  ...crossThemes("dex-no-match", { scene: "dex-no-match" }),
  // 絞り込みのボタン(オーナー指摘 2026-08-21)。**開いた絵まで撮る** —
  // 閉じたボタンだけでは、選択肢が右端で切れていないか分からない。
  // 一言の自撮り動画(オーナー決定 2026-08-21 = B案)。撮る前と撮った後。
  ...crossThemes("voice-video", { scene: "voice-video" }),
  ["voice-video-done", "", false, { scene: "voice-video", done: "1" }],
  ["voice-video-done-dark", 'class="dark"', false, { scene: "voice-video", done: "1" }],
  ["dex-filter", "", false, { scene: "dex-filter" }],
  ["dex-filter-chosen", "", false, { scene: "dex-filter", day: "1" }],
  ["dex-filter-open", "", false, { scene: "dex-filter", click: "section [aria-haspopup]" }],
  // **右端のボタンも撮る。** 揃える側を測って決めているので、左端だけ見て
  // いると反対側の切れに気づけない(右揃えの決め打ちで一度切れた)。
  [
    "dex-filter-open-right",
    "",
    false,
    { scene: "dex-filter", click: "section [aria-haspopup] >> nth=1" },
  ],
  [
    "dex-filter-open-many",
    "",
    false,
    { scene: "dex-filter", many: "1", click: "section [aria-haspopup]" },
  ],
  [
    "dex-filter-open-dark",
    'class="dark"',
    false,
    { scene: "dex-filter", click: "section [aria-haspopup]" },
  ],
  // 同じものに何度も出会った記録(再会の写真が並ぶ区画)。
  ...crossThemes("photo-history", { scene: "photo-history" }),
  // 保存を押した直後。文字が「保存」から「保存中...」に伸びて押せなくなる。
  // 伸びた側を撮らないと、待っている間の面が未検査のままになる。
  ["settings-saving", "", false, { scene: "settings-danger", variant: "saving" }],
  // 記憶の帯を開いた側。印(山形)の向きが変わる。
  ["review-memory-open", "", false, { scene: "review-memory", variant: "open" }],
  // 確認語を入れて赤いボタンが効くようになった面。押さないと出ない。
  ["settings-danger-armed", "", false, { scene: "settings-danger", variant: "armed" }],
  [
    "settings-danger-armed-dark",
    'class="dark"',
    false,
    { scene: "settings-danger", variant: "armed" },
  ],
];

/** 高コントラストのときに棚板が到達していなければならない濃さ。 */
const CONTRAST_LINE_A = 0.65;

/**
 * 棚板が背景に対して確保すべきコントラスト比。
 *
 * 意味を持つUIの図形の下限(WCAG 1.4.11 / apple-design §2)。
 * ここを**濃さの数字(0.15以上)でしか見ていなかった**のが穴だった。
 * 0.22 は「0.15以上」を満たしているが、実測は 1.55:1 で、
 * 独立監査に「棚ではなく、キャプション付きの写真の羅列に見える」と
 * 言われるまで気づかなかった。**単位の無い数字ではなく、比で見る。**
 */
const LINE_MIN_RATIO = 3;

/**
 * 焦点の輪郭が、当てる前の絵に対して確保すべきコントラスト比。
 * 意味を持つUIの図形と同じ下限(WCAG 1.4.11 / 2.4.7)。
 */
const FOCUS_MIN_RATIO = 3;

/**
 * 枠(上のバー・下タブ)を被せずに撮る場面。**雛形の `BARE` と同じ一覧**。
 * こちらにも書くのは、バーが無いことを咎める段がここに在るため。
 * 片方だけ足すと、実物どおりに撮った場面が落ちる(実際そうなった)。
 */
const BARE_SCENES = new Set(["onboarding", "sticker-sheet", "capture-saving", "scan-camera"]);

/**
 * **字が1つも無いのが正しい面。**
 *
 * - `capture-saving-landing`: 飛行が始まった瞬間。元の絵も字も消して、
 *   上に載る層(`CatchLandingOverlay`)へ見た目を渡した状態。空が正解。
 * - `scan-camera-nozoom`: 倍率を持たない端末。残るのは前後の切替の記号だけ。
 *
 * ここに足すのは「そう設計したから字が無い」面だけ。
 * 「なぜか出ない」面を黙らせるために足さない。
 */
const WORDLESS_SCENES = new Set(["capture-saving-landing", "scan-camera-nozoom"]);

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const issues = [];

for (const [name, htmlAttrs, wantsContrast, scene] of MODES) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: htmlAttrs.includes("dark") ? "dark" : "light",
    forcedColors: "none",
    ...(wantsContrast ? { contrast: "more" } : {}),
  });
  await page.goto(sceneUrl(BASE, scene), { waitUntil: "load" });
  // `<html>` の属性(テーマ)は開いてから付ける。
  if (htmlAttrs) {
    await page.evaluate((attrs) => {
      const el = document.documentElement;
      const m = attrs.match(/(\w[\w-]*)="([^"]*)"/);
      if (m) el.setAttribute(m[1], m[2]);
    }, htmlAttrs);
  }
  // 押したあとの面も見る。**答え合わせの色は、押さないと一度も描かれない。**
  // 正解の緑・不正解の赤は素の Tailwind の番号で書かれている所が多く、
  // そこがいちばん暗いテーマに追従しない。押さない検査では永遠に見えない。
  if (scene.click) {
    const target = page.locator(scene.click).first();
    if (await target.count()) {
      await target.click({ timeout: 2000 }).catch(() => {});
    } else {
      issues.push(`[${name}] 押す対象が見つからない: ${scene.click}`);
    }
  }
  await page.waitForTimeout(400);

  /**
   * **登場の途中で測らない。**
   *
   * ここに穴が空いていた。400ms 待つだけだったので、遅れて始まる登場の
   * アニメーションは**まだ途中**だった。語の木の枝は 300ms 遅れて 700ms
   * かけて現れるので、撮った時点の不透明度は 3 割ほど。検査は文字を
   * 「薄い」と読み、**実際には 7.2:1 ある文字を 2.25:1 と報告していた**。
   * 数字が実測と合わないので追いかけて初めて分かった。
   *
   * 終わりのあるアニメーションだけを待つ。`animate-pulse` や `animate-spin`
   * は無限に続くので待つと止まらない — 回数が有限のものだけを対象にする。
   * 2秒で諦めるのは、待ち続けて検査ごと止まらないため。
   */
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming?.().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ),
      new Promise((r) => setTimeout(r, 2000)),
    ]),
  );

  // 場面がちゃんと立ち上がったか。**空のページは指摘0で緑になる**ので、
  // 「何も出ていない」を合格と取り違えないように、先にここで確かめる。
  const mounted = await page.evaluate(() => ({
    scene: document.documentElement.dataset.scene ?? "",
    text: (document.body.innerText ?? "").trim().length,
  }));
  if (!mounted.scene) {
    issues.push(`[${name}] 場面が立ち上がっていない(名前が一覧と合っていない)`);
    await page.close();
    continue;
  }
  // **字が無いのが正しい面もある。** ここは「組み上がったのに何も描けて
  // いない」を捕まえる網なので、はじめから字を持たない面だけを名指しで通す。
  // 名指しにする理由は、網そのものを緩めると次に本当に描けていない面が
  // 静かに緑になるから(以前それで真っ白なページを撮っていた)。
  if (mounted.text < 4 && !WORDLESS_SCENES.has(name)) {
    issues.push(`[${name}] 画面に文字が1つも出ていない(描けていない疑い)`);
  }

  const found = await page.evaluate(
    ({ wantsContrast, CONTRAST_LINE_A, LINE_MIN_RATIO }) => {
      const out = [];
      const lum = (r, g, b) => {
        const f = (c) => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      // ## 色は**ブラウザに解かせる**。自分で文字列を読まない。
      //
      // ここに長く穴が空いていた。以前は `rgba?(…)` の正規表現で読んでいたが、
      // このアプリの色は全部 oklch で書いてあり、Chrome は計算値も
      // `oklch(…)` のまま返す。つまり**一致するものが一つも無かった** —
      // 文字色は毎回 null で捨てられ(=文字のコントラスト検査は17面すべてで
      // 1つも見ていない)、背景は毎回「白」の代替値に落ちていた。
      // 全部が黒文字・白背景として 21:1 で通っていた。
      //
      // canvas に実際に塗らせて読み返せば、oklch でも color-mix でも
      // 色空間に関係なく正しい RGB が出る。白の上と黒の上に塗って
      // 差から不透明度も割り出す。
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const paint = (s, base) => {
        ctx.globalCompositeOperation = "copy";
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 1, 1);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data;
      };
      const parse = (s) => {
        if (!s) return null;
        const w = paint(s, "#fff");
        const b = paint(s, "#000");
        const a = 1 - (w[0] - b[0]) / 255;
        if (a <= 0.001) return { r: 0, g: 0, b: 0, a: 0 };
        return { r: b[0] / a, g: b[1] / a, b: b[2] / a, a };
      };
      const over = (top, bottom) => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      });
      // 半透明を**重ねて解く**。以前は「不透明度0.85以上のものが出るまで
      // 遡る」だったので、半透明の面(バーやシート)の上の文字は
      // その下の色で採点していた。
      const bgOf = (el) => {
        const stack = [];
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (!c || c.a <= 0.001) continue;
          stack.push(c);
          if (c.a >= 0.999) break;
        }
        let acc = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
        return acc;
      };

      // 1. 文字のコントラストは**この段では測らない**(下の別の段で画素から測る)。
      //    理由はそちらのコメントに書いた。
      // 2. タップ領域 44px
      //
      // **見た目の箱ではなく、指が当たる範囲を見る。** 44px を割るからといって
      // 見た目まで大きくしなければならないわけではない — `::before` を広げて
      // 当たり判定だけ伸ばすのは正しいやり方で、`getBoundingClientRect()` は
      // それを見ない。44px 四方の四隅と中心で `elementFromPoint` を撃って、
      // 実際にその要素(かその中身)に当たるかで判定する。
      // **祖先に当たったのを「当たった」と数えない。**
      //
      // 以前ここは `hit.contains(el)` も真としていた。つまり点が
      // **そのボタンを含んでいる箱のどこか**に落ちれば合格で、
      // 余白のある入れ物に入っている小さいボタンは何をしても通った
      // (わざと当たり判定を外して確かめたら、実際に通り続けた)。
      // 押して効くのはボタン自身(と `::before` で伸ばした範囲)だけなので、
      // 自分か自分の中身に当たったときだけ数える。
      const hitsSelf = (el, x, y) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit));
      };
      // **画面の外に居るものは、先に画面の中へ運んでから撃つ。**
      //
      // `elementFromPoint` は表示領域の中しか答えない。以前はここで
      // 画面外の点を捨てていて、残りが0個になると「押せる範囲を確かめられた」
      // 側の分岐に入れず、**折り返しより下にある小さいボタンは全部
      // 未達として出ていた**(実際、当たり判定を 44px に広げても数字が
      // 1つも動かず、広げ方が悪いのだと2回作り直した。広げ方は正しくて、
      // 検査が下を見ていなかった)。
      const scrollBack = window.scrollY;
      /**
       * **見えていない物を採点しない。**
       *
       * 閉じた `<details>` の中身は `content-visibility: hidden` になるが、
       * **子孫は矩形を返し続ける**。だから「すべて見る」を閉じたまま撮った
       * 語の詳細で、開かないと出てこないボタン3つが「押せる大きさが足りない」
       * として上がっていた — 押すどころか見えない物を測っていた。
       *
       * `checkVisibility` は `content-visibility` も `visibility` も
       * `opacity:0` も見てくれる。自分で `display` を辿るより確実。
       */
      const isShown = (el) =>
        // `inert` の中は**そもそも押せない**(鍵盤も指も届かない)。
        // 裏を向いたカードの面のように、見えているのに触れない所を
        // 「押せる大きさが足りない」と数えても直しようがない。
        !el.closest("[inert]") &&
        (!el.checkVisibility ||
          el.checkVisibility({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true,
          }));
      for (const el of document.querySelectorAll("button, a[href], [role='button']")) {
        if (!isShown(el)) continue;
        let r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.width >= 44 && r.height >= 44) continue;
        if (r.top < 24 || r.bottom > window.innerHeight - 24) {
          el.scrollIntoView({ block: "center" });
          r = el.getBoundingClientRect();
        }
        // **指は丸い。** 四角の四隅で撃つと、44px の丸ボタンが落ちる —
        // 隅は円の外なので、当たるのは後ろの箱になる(実際、ちょうど 44px の
        // 「閉じる」が未達として出た。指で押せば当たる)。
        // 直径 44px の円を置き、中心と周囲8点で撃つ。四角いボタンにも
        // そのまま使える(円は箱に収まる)。
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const rad = 21;
        const pts = [[cx, cy]];
        for (let a = 0; a < 8; a++) {
          const th = (a * Math.PI) / 4;
          pts.push([cx + rad * Math.cos(th), cy + rad * Math.sin(th)]);
        }
        const inView = pts.filter(
          ([x, y]) => x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight,
        );
        // 運んでもなお全部は撃てない = そもそも画面に収まらない大きさ。
        if (inView.length === pts.length && pts.every(([x, y]) => hitsSelf(el, x, y))) continue;
        const label = (el.getAttribute("aria-label") || el.title || el.textContent || "")
          .trim()
          .slice(0, 14);
        out.push(`タップ領域 ${Math.round(r.width)}x${Math.round(r.height)} < 44 — "${label}"`);
      }
      // 2b. **押せるものが、何かの下敷きになったままでないこと**
      //
      // 画面下端に貼り付く面(答え合わせのパネルなど)は、後ろの中身を覆う。
      // 覆うこと自体は普通だが、**送り切っても出てこない**なら、その中身は
      // 事実上存在しない。逃げ場の高さを決め打ちにしていると必ずこれになる
      // (実際、復習の4つ目の選択肢が最後まで隠れていた。見比べて覚える
      //  場面で、外れの選択肢が読めない)。
      //
      // 大きさに関係なく全部見る。上の 44px の検査は小さいものしか見ない。
      for (const el of document.querySelectorAll("button, a[href], [role='button']")) {
        if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") continue;
        // `inert` の中は覆われていて当たり前(裏を向いたカードの面など)。
        // **押せないと決めてある物**を「下敷きだ」と言っても直しようがない。
        // 上の押せる大きさの段と同じ物差しで外す。
        if (!isShown(el)) continue;
        const r0 = el.getBoundingClientRect();
        if (r0.width < 4 || r0.height < 4) continue;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) continue;
        if (hitsSelf(el, cx, cy)) continue;
        const over = document.elementFromPoint(cx, cy);
        const label = (el.getAttribute("aria-label") || el.title || el.textContent || "")
          .trim()
          .slice(0, 14);
        out.push(
          `送り切っても下敷きのまま: "${label}" ← <${over ? over.tagName.toLowerCase() : "?"}>`,
        );
      }
      // 撮る面が変わらないように戻す。
      window.scrollTo(0, scrollBack);
      // 3. 横のはみ出し
      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        out.push(`横にはみ出し ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
      }
      // 4. 段の高さは中身に依らないこと(画像が届いても下がずれない)。
      //    以前ここは「下端が揃っているか」を見ていたが、align-items:end が
      //    定義上それを保証するので、どんな入力でも通る検査になっていた。
      const heights = [...document.querySelectorAll(".shelf-item")].map((e) =>
        Math.round(e.getBoundingClientRect().height),
      );
      if (new Set(heights).size > 1) {
        out.push(
          `枠の高さが揃っていない(画像待ちで下がずれる): ${[...new Set(heights)].join(",")}`,
        );
      }
      // 5〜6. 棚板の濃さと、影が黒側であること。
      //
      // 棚板そのもののコントラストは**撮った絵の画素で測る**(下の別の段)。
      // 板は繰り返しグラデーションで描いてあるので、計算値の色を読んでも
      // 出てこない。ここに残すのはトークンで言えることだけ。
      const root = getComputedStyle(document.documentElement);
      const lineA = parseFloat(root.getPropertyValue("--shelf-line-a"));
      // 高コントラストを頼んだのに濃くならない面が無いこと。
      // `:root, .dark` にだけ書いた上書きは `:root[data-ui-theme="…"]` に
      // 詳細度で負ける = 頼んだ人にだけ届かない、という形で落ちる。
      if (wantsContrast && !(lineA >= CONTRAST_LINE_A)) {
        out.push(`高コントラストが効いていない: --shelf-line-a=${lineA} (要 ${CONTRAST_LINE_A})`);
      }
      const lipA = parseFloat(root.getPropertyValue("--shelf-lip-a"));
      const bodyBg = bgOf(document.body);
      const bodyLum = lum(bodyBg.r, bodyBg.g, bodyBg.b);
      if (bodyLum < 0.2 && lipA > 0.2) {
        out.push(`暗い面なのに縁が明るすぎる(白く光る): --shelf-lip-a=${lipA}`);
      }
      const shadow = root.getPropertyValue("--shelf-shadow").trim();
      if (!/^0\s+0%/.test(shadow)) {
        out.push(`接地影が黒軸ではない: --shelf-shadow=${shadow}`);
      }
      for (const rule of document.querySelectorAll(".shelf-rule")) {
        if (rule.getBoundingClientRect().height < 1) out.push("棚板の高さが0");
      }
      return out;
    },
    { wantsContrast, CONTRAST_LINE_A, LINE_MIN_RATIO },
  );

  found.forEach((f) => issues.push(`[${name}] ${f}`));

  // ## 文字の下地は**塗られた画素から取る**
  //
  // ここに穴が空いていた。下地は祖先を遡って `background-color` を混ぜて
  // 求めていたが、**`background-image`(グラデーション・模様)は
  // `background-color` に現れない**。だから台紙も印画紙も棚板も、計算値の上では
  // 「透明」で、遡りはそれらを素通りして `body` の色まで落ちていた。
  //
  // 実際、ホームを検査に入れた最初の実行で「暗いテーマの見出し語が 1.14:1」と
  // 出た。だが印画紙は**テーマに関係なく白**なので、目に入る比は 17:1 ある。
  // 検査が下地を1枚も見ずに body の黒を下地と呼んでいた。逆向きの穴も同じで、
  // コルクの台紙(#c89a5b 固定)に薄い文字を載せても、以前の検査は白い body を
  // 下地として 21:1 で通していた。**見逃しと空騒ぎの両方**が出る。
  //
  // 直し方: 文字だけを透明にして一度撮り、**その絵の画素**を下地として使う。
  // グラデーションでも模様でも画像でも合成でも、目に入るものがそのまま出る。
  // (文字の**上**に半透明の膜が乗る場合だけは近似のままだが、以前の
  //  「下地を一枚も見ない」よりは実物に近い。)
  const { spots, centered, spaced, counterOnDash, brandFills, offScale, scale } =
    await page.evaluate(() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const paint = (s, base) => {
        ctx.globalCompositeOperation = "copy";
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 1, 1);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data;
      };
      // 色はブラウザに解かせる。このアプリの色は全部 oklch で、Chrome は
      // 計算値も `oklch(…)` のまま返すので、文字列を自分で読むと何も取れない。
      //
      // ただし `fillStyle` は**読めない文字列を黙って無視する**(前の値が
      // 残る)。`none` や空文字を渡すと、直前に測った色を「その要素の色」と
      // して返してしまうので、先に受け付けられたかどうかを確かめる。
      const accepts = (s) => {
        ctx.fillStyle = "#000000";
        ctx.fillStyle = s;
        const onBlack = ctx.fillStyle;
        ctx.fillStyle = "#ffffff";
        ctx.fillStyle = s;
        return onBlack === ctx.fillStyle;
      };
      const parse = (s) => {
        if (!s || !accepts(s)) return null;
        const w = paint(s, "#fff");
        const b = paint(s, "#000");
        const a = 1 - (w[0] - b[0]) / 255;
        if (a <= 0.001) return { r: 0, g: 0, b: 0, a: 0 };
        return { r: b[0] / a, g: b[1] / a, b: b[2] / a, a };
      };
      // **文字を持っている要素を全部見る。** 以前は `span, p, h3` に絞った上に
      // 「子要素があれば飛ばす」としていたので、注音のように span を入れ子に
      // して組んだ文字は一度も見ていなかった(飛ばした側にこそ、小さくて
      // 薄い文字が集まっている)。自分の直下に文字を持つ要素を対象にする。
      const out = [];
      const centered = [];
      const spaced = [];
      const counterOnDash = [];
      // ## ブランドの塗りの上だけは 3:1 で見る
      //
      // 白い文字を 4.5:1 に乗せるために**塗りの青を暗くした**ことがあり、
      // 数字は通ったがブランドの青がどす黒くなった(オーナー指摘で差し戻し)。
      // 順序が逆だった — 色は色のまま置き、文字のほうを選ぶ。
      // ただし鮮やかな青(iOS の systemBlue 相当)に白を置くと物理的に
      // 3.6:1 が上限で、4.5:1 は**色を捨てないと届かない**。
      // Apple も systemBlue + 白をそのまま出荷している。ここはオーナーが
      // 「色を優先する」と決めたので、**塗りの上に限って** 1.4.11 と同じ
      // 3:1 を下限にする。地の上の文字は 4.5:1 のまま — 逃げ道を広げない。
      const brandFills = ["--primary", "--destructive", "--ok", "--warn", "--bad"]
        .map((n) => parse(getComputedStyle(document.documentElement).getPropertyValue(n).trim()))
        .filter(Boolean)
        .map((c) => [c.r, c.g, c.b]);
      const offScale = [];
      // 階調は CSS の変数から読む。**検査の側に数字を書き写さない** —
      // 書き写した瞬間に、片方だけ直されて静かにずれる。
      const rootCs = getComputedStyle(document.documentElement);
      const SCALE = new Set(
        ["caption", "footnote", "body", "headline", "title", "hero"]
          .map((n) => parseFloat(rootCs.getPropertyValue(`--text-${n}`)) * 16)
          .filter((v) => v > 0)
          .map((v) => Math.round(v * 100) / 100),
      );
      for (const el of document.querySelectorAll("body *")) {
        const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
        if (!texts.length) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.1) {
          continue;
        }
        // 閉じた `<details>` の中身も外す。`content-visibility: hidden` は
        // `display`/`visibility` には現れないのに、子孫は矩形を返し続ける
        // (押せる大きさの段で同じ穴に落ちた)。
        if (
          el.checkVisibility &&
          !el.checkVisibility({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true,
          })
        ) {
          continue;
        }
        // **絵文字は `color` で塗られない。** 自前の色を持った図形なので、
        // 継いだ文字色と下地を比べても何も言っていない(実際、丸い印の中の
        // 絵文字が13件「未達」として出た。目には普通に見えている)。
        // 文字が絵文字と記号だけなら、この検査の対象から外す。
        // ただし**絵文字を含む文**は外さない — 混ざっている場合、文字のほうは
        // ちゃんと `color` で塗られるので測れる。
        const own = texts
          .map((n) => n.textContent)
          .join("")
          .trim();
        if (!/[\p{L}\p{N}]/u.test(own)) continue;
        // **SVG の文字は `color` では塗られない。** グラフの目盛りや注記は
        // `<text fill="…">` で描かれるので、`color` を読むと親から継いだ
        // 別の色を測ることになる(実際、忘却曲線の目盛りは無関係な色で
        // 採点されていた)。SVG の中では `fill` を見る。
        const isSvg = el.namespaceURI === "http://www.w3.org/2000/svg";
        const fg = parse(isSvg ? cs.fill : cs.color);
        if (!fg) continue;
        // 標本の範囲は**その要素が自分で持っている文字の箱**。
        //
        // 最初 `selectNodeContents(el)` で要素まるごとを範囲にしたが、これは
        // 子のアイコンや画像の箱まで拾う。実際、記憶バッジ「定着中」では
        // 先頭に来る 6×6 の印を文字だと思って測り、**そこは印そのものの色**
        // なので比が 1.00 になっていた(存在しない不具合を6面ぶん報告した)。
        // 自分の直下の文字ノードだけを範囲にして、**いちばん大きい行**を使う。
        let line = null;
        // **行数は「箱の数」ではなく「段の数」。**
        // 文字ノードが2つあると1行でも矩形は2つ返るので、数えると
        // 1行の見出しが「3行」になった(実際そう出た)。上端が同じものは
        // 同じ行なので、上端の種類を数える。
        const lineTops = new Set();
        for (const node of texts) {
          const rng = document.createRange();
          rng.selectNodeContents(node);
          for (const r of rng.getClientRects()) {
            if (r.width < 2 || r.height < 2) continue;
            lineTops.add(Math.round(r.top));
            if (!line || r.width * r.height > line.width * line.height) line = r;
          }
        }
        if (!line) continue;
        const lineCount = lineTops.size;
        const px = parseFloat(cs.fontSize);
        // **階調の外の大きさを使わない。**
        //
        // 実測したら描かれている大きさが12種類あり、17と16、14と13、12と11の
        // ように**1px しか違わない段**が並んでいた。1px 差は目には区別できない
        // ので段として働かず、書くときの選択肢だけが増える。
        // `styles.css` の `--text-*` に6段へ畳んだので、そこに無い大きさは落とす。
        // 表を増やすなら、増やす理由を先に書くこと。
        if (!SCALE.has(Math.round(px * 100) / 100)) {
          offScale.push(`階調に無い大きさ ${px}px — "${own.slice(0, 16)}"`);
        }
        // **中央揃えの本文が何行も続かないこと。**
        //
        // 中央揃えは行頭が毎行ずれるので、目が次の行の頭を探し直す。
        // 1行なら気にならない。**折り返した瞬間**からその手間が始まる。
        //
        // 線を「3行以上」に置いたら、わざと全部の節を中央揃えにしても
        // 1件も出なかった — この画面の本文はどれも2行までなので、
        // **落ちようのない門**だった。折り返した本文(17px 未満)を線にする。
        // 見出し・キャッチ(17px 以上)は2行までなら普通の作法なので外す。
        //
        // 抜け道は `text-wrap: balance` を当てたときだけにする。空の画面の
        // 案内文のように「中央に2行で置くと決めた」ものは実際にあるが、
        // それは**決めた印**を残してほしい。`text-balance` は行の長さを
        // 揃える指定なので、印であると同時に実際に読みやすくなる。
        // 一括で除外せず、1箇所ずつ意思表示させる。
        //
        // 短い語は**モノに付いた名札**で、中央に置くのが正しい(棚に立って
        // いる「腳踏車」が2行になるのは、中央揃えのせいではなく幅のせい)。
        // 見ているのは**文章**なので、12文字以上に限る。
        const cs2 = getComputedStyle(el);
        if (
          cs2.textAlign === "center" &&
          lineCount >= 2 &&
          px < 17 &&
          own.length >= 12 &&
          cs2.textWrap !== "balance" &&
          cs2.textWrapStyle !== "balance"
        ) {
          centered.push(`中央揃えのまま ${lineCount} 行に折り返している — "${own.slice(0, 16)}"`);
        }
        // **和文に字間を広げていないこと。**
        //
        // 字間を広げて小さく組むのは**ラテン文字の作法**(小見出しの
        // スモールキャップス)。和文の字はもともと正方形の枠に収まって
        // いるので、そこへ字間を足すと「直 し た 文」と一字ずつ離れて、
        // 語のかたまりが見えなくなる。
        //
        // この app では一度ホームの曜日で直している(「土 曜 日」と割れて
        // 見えた → 字間を広げるのは英語のときだけ)。だが**同じ形が他の
        // 画面に残っていた** — 日記の見出しが `tracking-[0.25em]` のまま。
        // 手で洗うと必ず取りこぼすので、規則そのものを門にする。
        //
        // 詰める側(負の値)は見出しの普通の作法なので見ない。
        // 0.06em は「見て分かるほど開いている」の下限として実測で決めた。
        if (/[ぁ-んァ-ヶ一-龥]/u.test(own)) {
          const ls = parseFloat(cs.letterSpacing);
          if (Number.isFinite(ls) && ls > px * 0.06) {
            spaced.push(
              `和文の字間が広い ${(ls / px).toFixed(2)}em — "${own.slice(0, 14)}" ${px}px`,
            );
          }
        }
        // **数字の代わりの記号に助数詞を付けていないこと。**
        //
        // 読み込み中の欄を `—` で埋め、それを `{n}日` のような雛形に
        // 差し込むと `—日` になる。和文ではダッシュ・長音符と漢数字の一が
        // 見分けられないので、**「一日」と読める**。待っていることを表す
        // 記号が、意味のある値として読まれてしまう(2026-08-19、自分の記録の
        // 欄で実際に出した)。
        //
        // これは**組み上がった後**にしか現れないので、i18n の文言を見る
        // 検査では捕まらない。描かれた字を見るここでしか捕まえられない。
        const fake = own.match(/[—–\-ー−]\s*[枚回件語日個人分秒歳冊本匹]/u);
        if (fake) {
          counterOnDash.push(`数字の代わりの記号に助数詞が付いている — "${own.slice(0, 16)}"`);
        }
        // **`opacity` を掛ける。** 掛けていなかったので、`opacity-60` を
        // 当てた 9px の品詞ラベルが 8:1 として通っていた(実際は 3.1:1)。
        // 祖先の `opacity` も効くので、根まで掛け合わせる。
        let alpha = fg.a * (isSvg ? parseFloat(cs.fillOpacity) || 1 : 1);
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          alpha *= parseFloat(getComputedStyle(n).opacity);
        }
        out.push({
          x: line.x + window.scrollX,
          y: line.y + window.scrollY,
          w: line.width,
          h: line.height,
          r: fg.r,
          g: fg.g,
          b: fg.b,
          a: Math.max(0, Math.min(1, alpha)),
          px,
          big: px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700),
          label: own.slice(0, 12),
        });
      }
      return {
        spots: out,
        centered,
        spaced,
        counterOnDash,
        brandFills,
        offScale: [...new Set(offScale)],
        scale: [...SCALE],
      };
    });
  centered.forEach((f) => issues.push(`[${name}] ${f}`));
  spaced.forEach((f) => issues.push(`[${name}] ${f}`));
  counterOnDash.forEach((f) => issues.push(`[${name}] ${f}`));
  if (!scale.length) issues.push(`[${name}] 書体の階調(--text-*)が読めない`);
  offScale.forEach((f) => issues.push(`[${name}] ${f}`));
  if (spots.length) {
    const hide = await page.addStyleTag({
      // `-webkit-text-fill-color` まで消す。`color` だけだと、それを当てている
      // 所(グラデーション文字など)が残って下地に混ざる。
      //
      // **SVG の文字は `color` では消えない。** グラフの目盛りは `fill` で
      // 塗られているので、これを足すまで**字そのものを下地として測って**
      // いた(比が 1〜2 になり、存在しない不具合が19件出た)。
      // 消すのは `text`/`tspan` だけ。`*` に `fill:transparent` を当てると
      // 折れ線や面まで消えて、今度は**本当の下地より易しい面**を測る。
      content: `*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}text,tspan{fill:transparent!important}`,
    });
    const backdrop = await page.screenshot({ fullPage: true });
    await hide.evaluate((n) => n.remove());
    const bad = await page.evaluate(
      ({ dataUrl, spots, fills, dpr }) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const x = c.getContext("2d", { willReadFrequently: true });
            x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            const lum = (r, g, b) => {
              const f = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
              };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const out = [];
            for (const s of spots) {
              // 1点だけ読むと、縁の1画素や字間の隙間に当たったときに
              // 全体の判断が振られる。文字の行の中に格子を張って、
              // **明るさの中央値**を代表の下地とする。
              const samples = [];
              for (let gy = 1; gy <= 3; gy++) {
                for (let gx = 1; gx <= 5; gx++) {
                  const px = Math.round((s.x + (s.w * gx) / 6) * dpr);
                  const py = Math.round((s.y + (s.h * gy) / 4) * dpr);
                  if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
                  const i = (py * c.width + px) * 4;
                  samples.push({ r: d[i], g: d[i + 1], b: d[i + 2] });
                }
              }
              if (!samples.length) continue;
              samples.sort((a, b) => lum(a.r, a.g, a.b) - lum(b.r, b.g, b.b));
              const bg = samples[Math.floor(samples.length / 2)];
              const shown = {
                r: s.r * s.a + bg.r * (1 - s.a),
                g: s.g * s.a + bg.g * (1 - s.a),
                b: s.b * s.a + bg.b * (1 - s.a),
              };
              const L1 = lum(shown.r, shown.g, shown.b);
              const L2 = lum(bg.r, bg.g, bg.b);
              const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
              // 下地がブランドの塗りそのものなら 3:1(理由は収集側に書いた)。
              const onBrand = fills.some(
                ([r, g, b]) => Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b) <= 30,
              );
              const need = onBrand ? 3 : s.big ? 3 : 4.5;
              if (ratio < need) {
                // **測った物をそのまま出す。** 比だけを出していたので、
                // 「実測は 8:1 なのに検査は 1.64 と言う」ときに、どちらが
                // 間違っているのかを追う手掛かりが何も無かった。
                // 文字色・下地・座標を添えれば、その場で突き合わせられる。
                const hex = (c) =>
                  "#" +
                  [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
                out.push(
                  `コントラスト ${ratio.toFixed(2)} < ${need} — "${s.label}" ${s.px}px` +
                    ` [字 ${hex(s)} / 地 ${hex(bg)} @${Math.round(s.x)},${Math.round(s.y)}]` +
                    (onBrand ? "(ブランドの塗りの上)" : ""),
                );
              }
            }
            resolve(out);
          };
          img.src = dataUrl;
        }),
      {
        dataUrl: "data:image/png;base64," + backdrop.toString("base64"),
        spots,
        fills: brandFills,
        dpr: 2, // deviceScaleFactor
      },
    );
    bad.forEach((f) => issues.push(`[${name}] ${f}`));
  }

  // ## 棚板の濃さは**撮った絵の画素で測る**
  //
  // 板は `repeating-linear-gradient` と `color-mix` で描いてあり、影と
  // 内側の縁も乗る。計算値の色をいくら読んでも、**目に入る色はそこに無い**。
  // 以前ここは `--shelf-line-a` を背景に手で混ぜて比を出していた —
  // つまり CSS が実際にどう描いたかを一度も見ずに、自分の暗算を検査していた。
  // 板の少し上(背景)と板そのものを細長く撮って、画素の明るさで比を出す。
  // 比べる相手(背景)は**画素ではなく DOM から**取る。板の上には
  // たいてい品物が立っていて、板のすぐ上の画素は「背景」ではなく写真だから。
  // 知りたいのは「板が地の面から浮き上がって見えるか」なので、
  // 板の実際の色(画素)と、地の面の色(計算値)を比べるのが正しい。
  const strip = await page.evaluate(() => {
    const vis = [...document.querySelectorAll(".shelf-rule")].filter((r) => {
      const b = r.getBoundingClientRect();
      return b.width > 60 && b.top > 90 && b.bottom < window.innerHeight - 20;
    });
    if (!vis.length) return null;
    const el = vis[Math.floor(vis.length / 2)];
    const b = el.getBoundingClientRect();
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const paint = (s, base) => {
      ctx.globalCompositeOperation = "copy";
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    };
    let bg = [255, 255, 255];
    for (let n = el.parentElement; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const w = paint(c, "#fff");
      const k = paint(c, "#000");
      if (1 - (w[0] - k[0]) / 255 >= 0.999) {
        bg = [w[0], w[1], w[2]];
        break;
      }
    }
    return {
      clip: {
        x: Math.round(b.x + b.width / 2) - 2,
        y: Math.round(b.y),
        width: 4,
        height: Math.max(2, Math.round(b.height)),
      },
      bg,
    };
  });
  // 何も集めていない図鑑には棚板が1本も無い(全部畳まれている)ので、
  // 「測れなかった」ではなく「測るものが無い」。DOM に在るのに測れない
  // ときだけ落とす。
  if (!strip) {
    if (await page.evaluate(() => document.querySelector(".shelf-rule") !== null)) {
      issues.push(`[${name}] 棚板が画面の中に1本も無い(測れていない)`);
    }
  } else {
    const shot = await page.screenshot({ clip: strip.clip });
    const lineRatio = await page.evaluate(
      ({ dataUrl, bg }) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const x = c.getContext("2d", { willReadFrequently: true });
            x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            const lumOf = (r, g, b) => {
              const f = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
              };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const bgLum = lumOf(bg[0], bg[1], bg[2]);
            // 板の中で**地の面からいちばん離れた行**を代表とする。
            // 板は上下にグラデーションが掛かっているので、上端だけ・
            // 平均だけを見ると「濃いところがある」ことを取りこぼす。
            let best = bgLum;
            for (let y = 0; y < c.height; y++) {
              let r = 0,
                g = 0,
                b = 0;
              for (let px = 0; px < c.width; px++) {
                const i = (y * c.width + px) * 4;
                r += d[i];
                g += d[i + 1];
                b += d[i + 2];
              }
              const l = lumOf(r / c.width, g / c.width, b / c.width);
              if (Math.abs(l - bgLum) > Math.abs(best - bgLum)) best = l;
            }
            resolve((Math.max(bgLum, best) + 0.05) / (Math.min(bgLum, best) + 0.05));
          };
          img.src = dataUrl;
        }),
      { dataUrl: "data:image/png;base64," + shot.toString("base64"), bg: strip.bg },
    );
    // 調整するときは数字が要る。`SHELF_VERBOSE=1` で全部出す。
    if (process.env.SHELF_VERBOSE) console.log(`  ${name}: 棚板 ${lineRatio.toFixed(2)}:1`);
    if (lineRatio < LINE_MIN_RATIO) {
      issues.push(
        `[${name}] 棚板のコントラストが実測 ${lineRatio.toFixed(2)}:1 < ${LINE_MIN_RATIO}`,
      );
    }
  }

  // ## スイッチは、入っているか消えているかが**図形で**分かること
  //
  // スイッチの意味は全部この図形が運ぶ(文字では言っていない)。
  // それなのに、つまみは入・切とも白で、消えているときは白い溝の上だった —
  // **どちらの端に寄っているか見えない**。文字の検査は文字しか見ないので、
  // ここは永遠に通る。WCAG 1.4.11(意味を持つ図形は 3:1)で測る。
  //
  // 溝の左半分と右半分をそれぞれ撮り、**つまみの居る側と居ない側**の
  // 明るさを比べる。計算値では取れない(影も縁も乗るし、つまみは
  // `translate` で動く)。
  const switches = await page.evaluate(() =>
    [...document.querySelectorAll('[role="switch"]')]
      .map((el) => {
        // 溝はボタンの中の実際に色が付いている箱。当たり判定のために
        // ボタン自体は 44px に広げてあるので、ボタンの箱では測れない。
        const track = el.querySelector("span");
        if (!track) return null;
        const b = track.getBoundingClientRect();
        if (b.width < 8 || b.height < 8 || b.top < 0 || b.bottom > window.innerHeight) return null;
        return {
          on: el.getAttribute("aria-checked") === "true",
          label: (el.getAttribute("aria-label") || "").slice(0, 14),
          clip: {
            x: Math.round(b.x),
            y: Math.round(b.y),
            width: Math.round(b.width),
            height: Math.round(b.height),
          },
        };
      })
      .filter(Boolean),
  );
  for (const sw of switches) {
    const shot = await page.screenshot({ clip: sw.clip });
    const ratio = await page.evaluate(
      (dataUrl) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const x = c.getContext("2d", { willReadFrequently: true });
            x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            const lumOf = (r, g, b) => {
              const f = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
              };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            // 中央の帯だけを見る(上下の縁は角丸で背景が混ざる)。
            const y0 = Math.floor(c.height * 0.4);
            const y1 = Math.ceil(c.height * 0.6);
            const side = (from, to) => {
              let r = 0,
                g = 0,
                b = 0,
                n = 0;
              for (let y = y0; y < y1; y++) {
                for (let px = from; px < to; px++) {
                  const i = (y * c.width + px) * 4;
                  r += d[i];
                  g += d[i + 1];
                  b += d[i + 2];
                  n++;
                }
              }
              return lumOf(r / n, g / n, b / n);
            };
            const q = Math.floor(c.width / 4);
            const left = side(2, q);
            const right = side(c.width - q, c.width - 2);
            resolve((Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05));
          };
          img.src = dataUrl;
        }),
      "data:image/png;base64," + shot.toString("base64"),
    );
    if (process.env.UI_VERBOSE) {
      console.log(`  ${name}: スイッチ "${sw.label}" ${sw.on ? "入" : "切"} ${ratio.toFixed(2)}:1`);
    }
    if (ratio < 3) {
      issues.push(
        `[${name}] スイッチの入/切が図形で見えない: "${sw.label}" ` +
          `(${sw.on ? "入" : "切"}) 実測 ${ratio.toFixed(2)}:1 < 3`,
      );
    }
  }

  // ## 部屋見出しの止まる位置
  //
  // 見出しは `top: var(--app-header-h)` の sticky。**上のバーの高さと
  // ここが食い違うと、静かに壊れる**:
  //   ・高すぎる → まだ流れの中にいる見出しが下にずれ、自分の中身に重なる
  //     (実際に起きた。一番上の「空いている棚」が見出しの下敷きで消えた)
  //   ・低すぎる → 止まった見出しが半透明のバーの裏に潜り、上端がぼやける
  //     (実際に起きた。3.25rem 決め打ちで、バーは 3.5rem だった)
  // どちらも画像を見ても「なんとなく変」で終わる。数字で見る。
  const stick = await page.evaluate(
    async (bare) => {
      const out = [];
      const bar = document.querySelector("header");
      // 全画面の面(入れて最初に見る画面など)には実物にもバーが無い。
      // **無いことを咎めると、実物どおりに撮った場面が落ちる。**
      if (!bar) return bare ? [] : ["上のバーが無い(ハーネスが実物と違う)"];
      // バーが本当に貼り付いているか。ここが relative だと、下の
      // 「止まる位置」の話が全部意味を失う(実際そうなっていた)。
      if (getComputedStyle(bar).position !== "sticky") {
        out.push(`上のバーが sticky ではない(${getComputedStyle(bar).position})`);
      }
      const barH = bar.getBoundingClientRect().height;
      const measure = () => {
        for (const head of document.querySelectorAll(".room-head")) {
          const stickyTop = parseFloat(getComputedStyle(head).top);
          if (Math.abs(stickyTop - barH) > 0.5) {
            out.push(`部屋見出しの止まる位置 ${stickyTop}px がバーの高さ ${barH}px と違う`);
          }
          const h = head.getBoundingClientRect();
          const sec = head.parentElement.getBoundingClientRect();
          // sticky の3つの局面をまとめて1つの式で言う:
          //   ① まだ流れの中 → 部屋の上端にいる
          //   ② 止まっている → バーの下端にいる
          //   ③ 部屋が出ていく → 部屋の下端に押し上げられる
          // どれでもない位置にいるなら、中身に重なっているか裏に潜っている。
          // ③ は**マージン箱**で押し上がるので、下マージンぶん引く。
          const mb = parseFloat(getComputedStyle(head).marginBottom) || 0;
          const want = Math.min(Math.max(sec.top, stickyTop), sec.bottom - h.height - mb);
          if (Math.abs(h.top - want) > 1) {
            out.push(
              `部屋見出し「${head.textContent}」の位置がおかしい ` +
                `(${h.top.toFixed(1)} ≠ ${want.toFixed(1)}: ` +
                `部屋 ${sec.top.toFixed(1)}〜${sec.bottom.toFixed(1)} / 止まる位置 ${stickyTop})`,
            );
          }
        }
      };
      measure();
      // 止まった状態も見る。スクロール前だけだと「潜る」側を一度も踏まない。
      window.scrollTo(0, 400);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      measure();
      window.scrollTo(0, 0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return [...new Set(out)];
    },
    BARE_SCENES.has(scene.scene ?? ""),
  );
  stick.forEach((f) => issues.push(`[${name}] ${f}`));

  // ## 鍵盤で辿ったとき、いまどこに居るかが見えること(WCAG 2.4.7)
  //
  // Tab で実際に送って、焦点の輪郭を測る。**押せるものが在るかどうかを
  // 数えるだけでは足りない** — 輪郭が無い・地に沈んでいる、が普通に起きる。
  // 実際、このアプリは `.shelf-item` 以外に焦点の定義がまったく無く、
  // ブラウザ既定の黒い輪郭に任せていた(暗いテーマでは沈む)。
  // 計算値では測れない。ブラウザ既定の `outline-style: auto` は、暗い面でも
  // `outline-color: rgb(16,16,16)` / 幅 1px と返す — **「輪郭が在るか」を
  // 見る検査は、既定のままでも通ってしまう**(最初にそう書いて、CSS を
  // 消しても合格したので書き直した)。焦点を当てた前後の絵を撮って、
  // **同じ画素がどれだけ変わったか**を見る。変わらなければ見えていない。
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    const box = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4 || b.top < 0 || b.bottom > window.innerHeight) return null;
      return {
        clip: {
          x: Math.max(0, Math.round(b.x) - 6),
          y: Math.max(0, Math.round(b.y) - 6),
          width: Math.round(b.width) + 12,
          height: Math.round(b.height) + 12,
        },
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 14),
        tag: el.tagName.toLowerCase(),
      };
    });
    if (!box) break;
    const after = await page.screenshot({ clip: box.clip });
    await page.evaluate(() => document.activeElement?.blur?.());
    const before = await page.screenshot({ clip: box.clip });
    const ratio = await page.evaluate(
      ({ a, b }) =>
        new Promise((resolve) => {
          const load = (src) =>
            new Promise((r) => {
              const im = new Image();
              im.onload = () => r(im);
              im.src = src;
            });
          Promise.all([load(a), load(b)]).then(([ia, ib]) => {
            const c = document.createElement("canvas");
            c.width = ia.width;
            c.height = ia.height;
            const x = c.getContext("2d", { willReadFrequently: true });
            x.drawImage(ia, 0, 0);
            const da = x.getImageData(0, 0, c.width, c.height).data;
            x.clearRect(0, 0, c.width, c.height);
            x.drawImage(ib, 0, 0);
            const db = x.getImageData(0, 0, c.width, c.height).data;
            const lumOf = (r, g, bl) => {
              const f = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
              };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
            };
            let best = 1;
            for (let i = 0; i < da.length; i += 4) {
              const la = lumOf(da[i], da[i + 1], da[i + 2]);
              const lb = lumOf(db[i], db[i + 1], db[i + 2]);
              const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
              if (r > best) best = r;
            }
            resolve(best);
          });
        }),
      {
        a: "data:image/png;base64," + after.toString("base64"),
        b: "data:image/png;base64," + before.toString("base64"),
      },
    );
    if (process.env.UI_VERBOSE) {
      console.log(`  ${name}: 焦点 <${box.tag}> "${box.label}" ${ratio.toFixed(2)}:1`);
    }
    if (ratio < FOCUS_MIN_RATIO) {
      issues.push(
        `[${name}] 焦点がどこに居るか見えない: <${box.tag}> "${box.label}" ` +
          `実測 ${ratio.toFixed(2)}:1 < ${FOCUS_MIN_RATIO}`,
      );
    }
  }

  // **撮る前に必ず先頭へ戻す。**
  //
  // ここまでの段で頁は動く(押せる範囲を確かめるために要素を画面へ運ぶし、
  // Tab を送ると焦点のある要素までブラウザが勝手にスクロールする)。
  // 頁が下がったまま全体を撮ると、**上のバーは貼り付いた位置に描かれる** —
  // つまり画像の真ん中にバーが写り、その下の中身が隠れる。
  // 実際、長い単語カードで「発音のコツ」がバーの下敷きになった絵が出て、
  // 一瞬アプリの不具合に見えた。目で見る門に嘘の絵を渡さない。
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, `ui-${name}.png`), fullPage: true });
  await page.close();
}

/**
 * ## 動きを減らす設定での検査
 *
 * `prefers-reduced-motion: reduce` を立てて開き、**まだ動いている
 * アニメーションの名前を数える**。止まっていなければならない物が
 * 1つでも走っていれば落とす。
 *
 * ### なぜ要るか
 * この app の reduced-motion の規則は、`ken-burns-a` `breathe` のように
 * **自作のクラス名を1つずつ並べて**書いてある。だから Tailwind が配る
 * `animate-pulse` は誰も止めていなかった — 読み込み中の骨組みは全画面で
 * それを使っているので、動きを減らす設定にしていても26箇所が脈打って
 * いた。名前を並べる規則は、名前を足し忘れた瞬間に静かに穴が開く。
 * **穴が開いたことを機械に言わせる。**
 *
 * ### 何を止めて、何を残すか
 * `spin` は残す。回転を止めると、待たされている人には「固まった」に
 * 見える。動きを減らす設定は手応えを消す設定ではない。
 * ここで見るのは「止めると決めた物が本当に止まっているか」だけ。
 */
const MOTION_STOP = ["pulse", "ping"];
/** 走っていてよい物。ここに無い名前が出たら、決めていない動きが増えた合図。 */
const MOTION_KEEP = ["spin"];
// 脈打つ物が実際に居る場面だけを見る。**居ない場面で緑にしても何の
// 保証にもならない**ので、下の「1つも見つからなかった」で担保する。
const MOTION_SCENES = ["scan-detail", "word-card", "home-loading", "review-loading"];
let motionSeen = 0;
for (const scene of MOTION_SCENES) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 800 },
    reducedMotion: "reduce",
  });
  await page.goto(sceneUrl(BASE, { scene }), { waitUntil: "load" });
  await page.waitForTimeout(400);
  const { running, marked } = await page.evaluate(() => ({
    // `animationName` を持つ物だけが CSS アニメーション(transition は持たない)。
    running: document
      .getAnimations()
      .map((a) => a.animationName)
      .filter(Boolean),
    marked: document.querySelectorAll('[class*="animate-"]').length,
  }));
  if (!marked) {
    issues.push(`[動きを減らす/${scene}] animate-* の要素が1つも無い(場面が違う疑い)`);
    await page.close();
    continue;
  }
  motionSeen += marked;
  for (const nm of running) {
    if (MOTION_STOP.includes(nm)) {
      issues.push(`[動きを減らす/${scene}] 止まるべき動きが走っている: ${nm}`);
    } else if (!MOTION_KEEP.includes(nm)) {
      issues.push(`[動きを減らす/${scene}] 決めていない動きが走っている: ${nm}`);
    }
  }
  await page.close();
}
if (!motionSeen) {
  issues.push("[動きを減らす] 見た場面のどこにも animate-* が無かった(検査が空回りしている)");
}

await browser.close();
server.close();

if (issues.length) {
  console.error(`不合格 ${issues.length}件:`);
  issues.forEach((i) => console.error("  - " + i));
  process.exit(1);
}
console.log(`合格。スクリーンショット: ${OUT}`);
