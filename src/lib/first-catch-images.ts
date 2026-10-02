import { FIRST_CATCH_INTERESTS } from "@/lib/learning-preferences";

/**
 * 最初の画面（`/welcome`）に出る4枚。`<head>` で先読みするのはこの4枚だけ
 * （2026-10-02）。前は興味の質問の9枚も一緒に先読みしていたので、最初の画面の
 * 写真と帯域を取り合い、Chrome は「先読みしたのに数秒使われていない」と警告し得た。
 * 9枚は画面を開いた直後に `preloadFirstCatchImages` が温める。
 */
export const WELCOME_IMAGES = [
  "/first-catch-cafe.webp",
  "/first-catch-flower.webp",
  "/first-catch-cat.webp",
  "/first-catch-ready.webp",
];
export const FIRST_CATCH_IMAGES = [
  ...WELCOME_IMAGES,
  ...FIRST_CATCH_INTERESTS.map((value) => `/first-catch-interest-${value}.webp`),
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
