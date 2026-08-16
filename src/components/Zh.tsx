/**
 * 台湾華語(繁体字)を表示するための包み。
 *
 * ## なぜ専用の部品が必要か
 * 漢字は同じ文字コードでも、言語によって字形が違う。日本語フォントで
 * 繁体字を出すと別の形になる — 直/直、骨/骨、每/毎、者/者、戶/戸 など。
 * 見た目の好みではなく **学習の正しさ** の問題で、日本語字形のまま覚えると
 * 台湾で書いたときに間違った字を書くことになる。
 *
 * ブラウザは `lang` 属性を見て字形を選ぶので、繁体字を出す場所すべてに
 * `lang="zh-Hant"` を付ける必要がある。付け忘れると、その場所だけ静かに
 * 日本語字形に戻る — 見た目が似ているので気づきにくい。だから毎回手で
 * 属性を書くのではなく、この部品を通す。
 *
 * ## 使い方
 *   <Zh>{word.headword}</Zh>                     // span で囲む
 *   <Zh as="h1" className="text-hero">{...}</Zh>   // 任意のタグで
 */

import type { ElementType, ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** 描画するタグ。既定は span。見出しなら "h1" などを渡す。 */
  as?: ElementType;
  className?: string;
} & Record<string, unknown>;

export function Zh({ children, as: Tag = "span", className, ...rest }: Props) {
  return (
    <Tag lang="zh-Hant" className={className} {...rest}>
      {children}
    </Tag>
  );
}
