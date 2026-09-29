import { useEffect, useState } from "react";
import { scrollTopNow } from "@/lib/scroll-root";

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
    // 指の端末では殻（`[data-app-shell]`）が巻き取る（`lib/scroll-root.ts`）。
    // 殻の巻き取りは window に届かないので、文書で拾う（capture）。
    const read = () => setScrolled(scrollTopNow() > threshold);
    read();
    document.addEventListener("scroll", read, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", read, { capture: true });
  }, [threshold]);
  return scrolled;
}
