/**
 * **日記の字体**（オーナー指示 2026-09-28「日記はユーザーがタイプしたものが、本物の
 * 手書きのような字体含む日記の字体ユーザーが選べて、表示される」）。
 *
 * 打った字を、本人が選んだ字体で**日記帳のページに書いたように**出す。
 * 字体はどれも端末内に配る（`scripts/fetch-diary-fonts.mjs`。外から取りに行かない —
 * `styles.css` の冒頭の注）。手書きの3つは大きいので、**日記を開いた時だけ**
 * `diary-fonts.css` を読む（開かない人は1バイトも取らない）。
 *
 * 画面（DOM）と本棚の3D のページ（canvas）が同じ字体・同じ折り返しで描くよう、
 * ここに1つだけ置く。
 */

export type DiaryFontId = "hand" | "pencil" | "casual" | "brush" | "plain";

export const DIARY_FONTS: ReadonlyArray<{
  id: DiaryFontId;
  /** 設定・選ぶ所に出す名前（i18n の鍵）。 */
  key: string;
  /** CSS の font-family。先頭が本命、後ろは読み込めない時の逃げ。 */
  family: string;
  /** 行の高さ（字の大きさに対する倍率）。手書きは字の揺れがあるので広め。 */
  leading: number;
}> = [
  // 既定。撮影時の一言と同じ手書き（Zen Kurenaido は本体の styles.css が持つ）。
  { id: "hand", key: "diary.fontHand", family: '"Zen Kurenaido", cursive', leading: 1.9 },
  // 鉛筆で丁寧に書いた字（教科書体に近い）。
  {
    id: "pencil",
    key: "diary.fontPencil",
    family: '"Klee One", "Zen Kurenaido", serif',
    leading: 1.85,
  },
  // 力の抜けた走り書き。
  {
    id: "casual",
    key: "diary.fontCasual",
    family: '"Yomogi", "Zen Kurenaido", cursive',
    leading: 1.9,
  },
  // 繁体字の楷書。台湾華語で書く日記に。
  {
    id: "brush",
    key: "diary.fontBrush",
    family: '"LXGW WenKai TC", "Klee One", serif',
    leading: 1.8,
  },
  // 端末の字（手書きにしたくない人のため）。
  {
    id: "plain",
    key: "diary.fontPlain",
    family: 'system-ui, -apple-system, "Hiragino Sans", "PingFang TC", sans-serif',
    leading: 1.75,
  },
];

export const DEFAULT_DIARY_FONT: DiaryFontId = "hand";
const STORE_KEY = "diary-font-v1";
const CSS_HREF = "/fonts/diary/diary-fonts.css";

export function diaryFont(id: string | null | undefined) {
  return DIARY_FONTS.find((f) => f.id === id) ?? DIARY_FONTS[0];
}

/** 本人が選んだ字体（この端末に覚える。読めなければ既定）。 */
export function getDiaryFont(): DiaryFontId {
  try {
    return diaryFont(globalThis.localStorage?.getItem(STORE_KEY)).id;
  } catch {
    return DEFAULT_DIARY_FONT;
  }
}

export function setDiaryFont(id: DiaryFontId): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, id);
  } catch {
    // 保存できない端末（プライベートモード等）でも、この場の見た目は変わる。
  }
}

/** 手書きの字体の CSS を1度だけ差し込む（日記を開いた時に呼ぶ）。 */
export function ensureDiaryFontCss(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[data-diary-fonts]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  link.dataset.diaryFonts = "";
  document.head.appendChild(link);
}

/**
 * その字体で `text` を描けるまで待つ（canvas は字体が届く前に描くと、代わりの字で
 * 焼き付いてしまう）。字体は `unicode-range` で切り分けてあるので、**出す字を渡す**
 * と、その字が入っている枚だけを取る。待ちすぎないよう上限を置く。
 */
export async function loadDiaryFont(id: DiaryFontId, text: string, px = 32): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  ensureDiaryFontCss();
  const first = diaryFont(id).family.split(",")[0];
  const sample = text.slice(0, 400) || "日記";
  await Promise.race([
    document.fonts.load(`${px}px ${first}`, sample).catch(() => undefined),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
}

/**
 * **行に折る**（canvas には折り返しが無い）。改行はそのまま守り、行の幅を超えたら
 * 字の切れ目で折る。和文・漢字は1字ずつ折れる。欧文は語の途中で折らない
 * （1語が行より長い時だけ字で折る）。行頭に句読点を置かない（禁則の最小限）。
 */
export function wrapDiaryLines(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const out: string[] = [];
  const NO_START = /^[、。，．,.!！?？」』）)\]】〉》ー〜…]/;
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (para === "") {
      out.push("");
      continue;
    }
    // 欧文の語は塊、ほかは1字ずつ（空白は区切りとして前の塊に付ける）。
    const tokens = para.match(/[A-Za-z0-9'’-]+\s*|\s+|./gu) ?? [];
    let line = "";
    for (const tok of tokens) {
      const next = line + tok;
      if (line !== "" && measure(next.trimEnd()) > maxWidth) {
        // 句読点は前の行の終わりにぶら下げる。
        if (NO_START.test(tok) && tok.length === 1) {
          out.push(next);
          line = "";
          continue;
        }
        out.push(line.trimEnd());
        line = tok.trimStart();
      } else {
        line = next;
      }
      // 1語が行より長い時は字で折る。
      while ([...line].length > 1 && measure(line.trimEnd()) > maxWidth) {
        const chars = [...line];
        let k = chars.length - 1;
        while (k > 1 && measure(chars.slice(0, k).join("")) > maxWidth) k--;
        out.push(chars.slice(0, k).join(""));
        line = chars.slice(k).join("");
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
