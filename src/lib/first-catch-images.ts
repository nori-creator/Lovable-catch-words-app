import { FIRST_CATCH_INTERESTS } from "@/lib/learning-preferences";

/**
 * 最初の画面（`/welcome`）に出る写真と手（2026-10-03 の空と手の1枚）。`<head>` で
 * 先読みするのはこれだけ。興味の質問の残りの写真は、画面を開いた直後に
 * `preloadFirstCatchImages` が温める（一緒に先読みすると最初の画面の写真と帯域を
 * 取り合い、Chrome は「先読みしたのに数秒使われていない」と警告し得た）。
 */
export const WELCOME_IMAGES = [
  "/first-catch-ready.webp",
  "/first-catch-hand.webp",
  "/first-catch-welcome-sea.webp",
  "/first-catch-welcome-blur-flower.webp",
  "/first-catch-welcome-blur-cat.webp",
  "/first-catch-welcome-blur-coffee.webp",
  "/first-catch-welcome-blur-lake.webp",
];
/**
 * 最初の画面の「海邊」を書く手書き（Zen Kurenaido）のうち、海・邊を持つ2つの切り出し。
 * 字体は `font-display: block` なので、先に取っておくと字の出る前の空白が短い。
 */
export const WELCOME_FONTS = [
  "/fonts/zen-kurenaido/zk-114.woff2",
  "/fonts/zen-kurenaido/zk-64.woff2",
];
export const FIRST_CATCH_IMAGES = [
  ...new Set([
    ...WELCOME_IMAGES,
    // ホーム・図鑑・復習の見本の写真（最初の画面の後で出る）。
    "/first-catch-cafe.webp",
    "/first-catch-flower.webp",
    "/first-catch-cat.webp",
    ...FIRST_CATCH_INTERESTS.map((value) => `/first-catch-interest-${value}.webp`),
  ]),
];
let loading: Promise<void> | undefined;
/** Warm the same HTTP/decode cache used by Home, questions, Dex and review. */
export function preloadFirstCatchImages() {
  if (typeof Image === "undefined") return Promise.resolve();
  return (loading ??= Promise.all(
    FIRST_CATCH_IMAGES.map((src) => {
      const image = new Image();
      image.src = src;
      return image.decode().catch(() => {});
    }),
  ).then(() => {}));
}
