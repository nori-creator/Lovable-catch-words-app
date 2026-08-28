import {
  AudioLines,
  Blocks,
  BookOpen,
  Boxes,
  ChartColumn,
  Clapperboard,
  Globe,
  Hash,
  Images,
  Landmark,
  Lightbulb,
  Link2,
  ListPlus,
  MapPin,
  Megaphone,
  MessageSquareQuote,
  Network,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { sectionIconName, type SectionIconName } from "@/lib/section-icon";
import type { SectionId } from "@/lib/card-sections";

/**
 * 節の目印。**鮮やかな青い丸に、白い線の絵**を1つ。
 *
 * オーナー指示 2026-08-28 ⑧:
 * > 「アプリ内のすべての単語の詳細、復習の4択も含めて、すべて単語の
 * >  詳細の項目の鮮やかな青い丸のアイコンに統一して。」
 *
 * ## どの絵かはここで決めない
 * 節 → 名前の対応は `lib/section-icon.ts`(試験付き)。ここは
 * **名前 → 部品**と、丸の描き方だけを持つ。分けてあるので、節を足した
 * 日に「絵を忘れた」が試験で落ちる — 画面を開いて気付く必要がない。
 *
 * ## なぜ塗った丸なのか
 * 前は絵文字を地の上に直に置いていた。絵文字は端末ごとに形も色も違い、
 * 字として組まれるので大きさも揃わない。**同じ寸法の丸**に入れると、
 * 14〜18個が縦に並んだときに左端が1本の線として通る。
 *
 * ## 色は1つ
 * 節ごとに色を変えない。13色は誰も覚えないので賑やかさしか残らない
 * (`WordCard.tsx` に一度その判断が書いてある)。区別は**絵と見出し**が
 * する。丸は「ここが節の頭だ」とだけ言う。
 */

const ICONS: Record<SectionIconName, LucideIcon> = {
  BookOpen,
  Images,
  ChartColumn,
  MessageSquareQuote,
  ListPlus,
  Blocks,
  Network,
  AudioLines,
  Landmark,
  Lightbulb,
  Clapperboard,
  Hash,
  MapPin,
  Repeat,
  Boxes,
  Megaphone,
  Link2,
  Globe,
};

/** 丸の寸法。`sm` は一覧の中(並べ替えの行)、`md` は節の見出し。 */
const BOX = { sm: "h-5 w-5", md: "h-6 w-6" } as const;
const GLYPH = { sm: "h-3 w-3", md: "h-3.5 w-3.5" } as const;

/**
 * 名前で直に描く(節ではない所 — 復習の4択など)。
 *
 * **`aria-hidden`。** 隣に必ず言葉の見出しが在るので、読み上げに
 * 同じことを2度言わせない。
 */
export function BadgeIcon({
  name,
  size = "md",
  className = "",
}: {
  name: SectionIconName;
  size?: "sm" | "md";
  className?: string;
}) {
  const Glyph = ICONS[name] ?? BookOpen;
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm ${BOX[size]} ${className}`}
    >
      <Glyph className={GLYPH[size]} strokeWidth={2.25} />
    </span>
  );
}

/** 節の目印。 */
export function SectionIcon({
  id,
  size = "md",
  className = "",
}: {
  id: SectionId;
  size?: "sm" | "md";
  className?: string;
}) {
  return <BadgeIcon name={sectionIconName(id)} size={size} className={className} />;
}
