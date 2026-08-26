import type { ElementType, ReactNode } from "react";
import { targetProfile } from "@/lib/target-profile";

/**
 * **学習言語の語を、その言語の字で出す包み。**
 *
 * オーナー報告 2026-08-26:
 * > 「カメラ撮った後の単語の候補の字体が変だから直して。」
 * > 「学習言語英語、母語台湾華語のとき、注音やピンインを決して表示しないで。
 * >  単語の詳細や単語の候補、文字入力の候補などを含むアプリ全体で。」
 *
 * ## なぜ `Zh` では足りないか
 * `Zh` は `lang="zh-Hant"` を**決め打ちで**付ける包みで、繁体字を
 * 日本語字形に落とさないために作った（あちらの注のとおり、学習の正しさの
 * 問題）。ところが学習言語が増えた日から、候補や見出し語のような
 * 「**学習言語の語**が入る場所」にも `Zh` が残っていた。
 * 英語の語に `lang="zh-Hant"` を付けると、browser は中国語のフォントで
 * ラテン文字を描く — `socks` の字形が他の英字と違って見えるのはこれ。
 *
 * ## 使い分け
 * - `Zh` … **必ず繁体字が入る所**（量詞、中国語の例文、注音）
 * - `Term` … **学習言語の語が入る所**（見出し語、候補、4択の選択肢）
 *
 * 字の宣言は `target-profile.ts` の `scriptLang` ただ1つから引く。
 * ここに `lang === "en" ? … : …` を書かない — 言語が増えた日に、
 * この包みだけ増えないから。
 */
export function Term({
  children,
  lang,
  as: Tag = "span",
  className,
  ...rest
}: {
  children: ReactNode;
  /** その語の学習言語。**渡さないと台湾華語として組む**（既定）。 */
  lang?: string | null;
  as?: ElementType;
  className?: string;
} & Record<string, unknown>) {
  return (
    <Tag lang={targetProfile(lang).scriptLang} className={className} {...rest}>
      {children}
    </Tag>
  );
}
