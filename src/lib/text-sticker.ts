/**
 * **文字で調べた語の札**（写真の無いキャッチ）。
 *
 * ## オーナー報告 2026-10-08（画面の録画）
 * > 文字で「貓」を調べると、剥がす札に何も載っていない（白く光るだけの札）。
 * > 何も無い札を剥がしている。
 *
 * 剥がす札（`PeelSticker`）は写真を前提にしていて、写真の無い回は**絵の無い台紙**
 * だけが出ていた。そのまま図鑑へ飛ばす演出も、飛ぶ絵が空なので、白い画面に
 * 語だけが残って止まって見えていた。
 *
 * ## 直し方
 * 1. ネットの画像（`use-auto-hero` と同じ検索）を**短い上限つきで**待ち、届けばそれを札にする。
 * 2. 届かなければ、**語そのものを組んだ札**（ここで作る SVG）を札にする。
 *
 * どちらでも札には必ず絵が載り、飛ぶ絵も同じ物になる。
 *
 * ここには外の世界に触れるものを入れない（文字列を組むだけ）。
 */

import { heroSearchQuery } from "./hero-image";

/** 札の一辺（`PeelSticker` の viewBox と同じ 320）。 */
const SIZE = 320;
/** 字を置ける幅。札の内側（20..300）から、さらに左右に余白を取る。 */
const TEXT_WIDTH = 216;
/** 1文字の札でも、ここより大きくしない。 */
const MAX_FONT = 148;
/** 長い語でも、ここより小さくしない（足りなければ字間を詰めて収める）。 */
const MIN_FONT = 30;

/**
 * 字の幅のおおよそ（1em を 1 とする）。漢字・かな・注音は全角、
 * ラテン文字などは約 0.58em。測れない所なので、収まりきらない時は
 * `textLength` で必ず枠に収める。
 */
export function estimateEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (/\s/.test(ch)) em += 0.3;
    else if (code >= 0x2e80) em += 1;
    else em += 0.58;
  }
  return em;
}

/** 語の長さから、札に載せる字の大きさを決める。 */
export function textStickerFontSize(text: string): number {
  const em = Math.max(estimateEm(text), 0.5);
  return Math.round(Math.max(MIN_FONT, Math.min(MAX_FONT, TEXT_WIDTH / em)));
}

/** その語の言語で字を選ぶ（SVG を絵として読むとウェブフォントは届かない）。 */
function fontStack(lang: string | null | undefined): string {
  const base = (lang ?? "").toLowerCase();
  if (base.startsWith("ja"))
    return "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP','Noto Sans CJK JP',sans-serif";
  if (base.startsWith("en"))
    return "-apple-system,'SF Pro Rounded','Helvetica Neue','Segoe UI',Roboto,sans-serif";
  return "'PingFang TC','Hiragino Sans','Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei',sans-serif";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 語を組んだ札の SVG（文字列）。紙の地に、語を大きく真ん中へ。読みがあれば下に小さく。
 *
 * 札（`PeelSticker`）は SVG の `<image>` で絵を貼るので、ここは**それ単体で
 * 完結する SVG** にする（外の書体・画像を参照しない）。
 */
export function textStickerSvg(opts: {
  headword: string;
  reading?: string | null;
  lang?: string | null;
}): string {
  const word = opts.headword.trim() || "?";
  const reading = (opts.reading ?? "").trim();
  const size = textStickerFontSize(word);
  const em = estimateEm(word);
  // 見積もりでも溢れるなら、字間（と字の幅）を詰めて必ず枠に収める。
  const squeeze =
    em * size > TEXT_WIDTH ? ` textLength="${TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs"` : "";
  const font = escapeXml(fontStack(opts.lang));
  // 読みがあるときは、語を少し上へ寄せて2行の重心を真ん中に置く。
  const wordY = reading ? 160 - size * 0.08 : 160 + size * 0.02;
  const readingSize = Math.max(
    14,
    Math.min(22, Math.round(200 / Math.max(estimateEm(reading), 1))),
  );
  const readingLine = reading
    ? `<text x="160" y="${Math.round(wordY + size * 0.5 + readingSize + 10)}" text-anchor="middle" font-family="${font}" font-size="${readingSize}" fill="#6b6f7d" letter-spacing="1">${escapeXml(reading)}</text>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="#fdf3f6"/><stop offset="1" stop-color="#eef3ff"/>` +
    `</linearGradient>` +
    `<radialGradient id="h" cx=".3" cy=".22" r=".7">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#h)"/>` +
    // 内側の細い縁（札らしさ）。
    `<rect x="34" y="34" width="252" height="252" rx="18" fill="none" stroke="#e7dccb" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>` +
    // 小さな星（キャッチした印）。
    `<path d="M262 58l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#f2b84b" opacity=".85"/>` +
    `<text x="160" y="${Math.round(wordY)}" text-anchor="middle" dominant-baseline="central" font-family="${font}" font-size="${size}" font-weight="700" fill="#1f2430"${squeeze}>${escapeXml(word)}</text>` +
    readingLine +
    `</svg>`
  );
}

/** 札・飛ぶ絵にそのまま渡せる data URL。 */
export function textStickerDataUrl(opts: {
  headword: string;
  reading?: string | null;
  lang?: string | null;
}): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(textStickerSvg(opts));
}

/**
 * 札に載せる絵を決める。**撮った写真 → ネットの画像 → 語の札** の順。
 * 写真のある回は今までどおり写真だけを使う（ネットの画像で上書きしない）。
 */
export function chooseStickerArt(sources: {
  photo: string | null | undefined;
  webImage: string | null | undefined;
  textArt: string;
}): { url: string; kind: "photo" | "web" | "text" } {
  if (sources.photo) return { url: sources.photo, kind: "photo" };
  if (sources.webImage) return { url: sources.webImage, kind: "web" };
  return { url: sources.textArt, kind: "text" };
}

/** ネットの画像の候補（`use-auto-hero` の `WebImageCandidate` と同じ形の必要な所だけ）。 */
export type TextStickerCandidate = { url: string; thumb?: string };

/**
 * 札に載せるネットの画像を1枚決める。**画面に出せることを確かめてから**返す
 * （読み込めない画像を札にすると、また何も無い札になる）。
 * 先頭が読めなければ次の1枚だけ試す。上限の時間は呼ぶ側が持つ。
 */
export async function findTextStickerImage<C extends TextStickerCandidate>(deps: {
  query: string;
  search: (query: string) => Promise<{ candidates: C[] }>;
  preload: (url: string) => Promise<void>;
}): Promise<{ candidate: C; shown: string } | null> {
  if (!deps.query.trim()) return null;
  const { candidates } = await deps.search(deps.query);
  for (const candidate of candidates.slice(0, 2)) {
    // 札は 320px 角なので、小さい方（あれば）で足りる。
    const shown = candidate.thumb || candidate.url;
    try {
      await deps.preload(shown);
      return { candidate, shown };
    } catch {
      // 次の1枚へ。
    }
  }
  return null;
}

/**
 * 札の絵を探す検索語。**図鑑の詳細の自動の1枚（`use-auto-hero`）と同じ決め方** —
 * AI の画像検索用の英語 → 意味 → 見出し語の順（`heroSearchQuery`）。
 */
export function textStickerImageSearch(word: {
  headword: string;
  meaning: string | null | undefined;
  imageQuery?: string | null;
  category?: string | null;
  avoid?: string[] | null;
}): {
  query: string;
  category: string | null;
  /** 見出し語と意味（英語の検索語がまだ無い時、サーバが意味を決めて探す。`image-sense.ts`）。 */
  headword: string;
  meaning: string | null;
  avoid: string[];
} {
  return {
    headword: word.headword,
    meaning: word.meaning ?? null,
    avoid: word.avoid ?? [],
    query: heroSearchQuery({
      headword: word.headword,
      meaning: word.meaning,
      imageQuery: word.imageQuery,
    }),
    // 候補の並べ直しの手がかり（`image-search-rank.ts`）。
    category: word.category ?? null,
  };
}
