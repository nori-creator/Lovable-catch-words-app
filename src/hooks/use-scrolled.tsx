import { useEffect, useState } from "react";

/**
 * 中身が上のバーの下に潜り込んでいるか。
 *
 * apple-design §12「区切り線ではなく、縁の効果」。固定ヘッダーの下に
 * いつも1本線を引いておくのは、そこに何も無いときでも「境目がある」と
 * 言っていることになる。実際に中身が潜り込んだときだけ縁を出す。
 */
export function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const read = () => setScrolled(window.scrollY > threshold);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, [threshold]);
  return scrolled;
}
