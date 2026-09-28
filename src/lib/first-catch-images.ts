export const FIRST_CATCH_IMAGES = [
  "/first-catch-cafe.webp",
  "/first-catch-flower.webp",
  "/first-catch-cat.webp",
  "/first-catch-ready.webp",
  "/first-catch-interests.webp",
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
