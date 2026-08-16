import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * ## 焦点の輪郭は**ブラウザ既定に任せる**
 *
 * ここには `focus-visible:outline-none` + `ring-ring/40`(青一色・不透明度40%)
 * が入っていた。既定の輪郭を消したうえで、代わりに置いたものが薄い。
 * 鍵盤で送って前後の画素を測ったら **1.03:1** — つまり
 * **アプリ中のボタンで、いまどこに居るかが一切見えていなかった**。
 *
 * 前の周に `.shelf-item` で同じことを測って「既定のほうが強い」と結論した
 * のに、**実際に使われている shadcn の部品には手を入れていなかった**。
 * 「直した場所が動く経路に無い」をまた踏んだので、ここで直す。
 *
 * | | 明るい面 | 暗い面 |
 * |---|---|---|
 * | ブラウザ既定(黒白の二重リング) | 18.8:1 | 19.9:1 |
 * | `--ring` の青一色 | 3.65:1 | 7.68:1 |
 *
 * 単色の輪郭はどこかの背景で必ず負ける。既定は背景に応じて描き分ける。
 *
 * ## 押せないときは**薄くしない**
 *
 * `disabled:opacity-50` は、塗りと文字を**一緒に**薄くする。塗りが薄れた
 * ぶん文字との差も縮むので、押せない状態のボタンは何と書いてあるか
 * 読めなくなる(退会の赤いボタンで実測 **1.61:1**)。
 * 「押せない」は伝えたいが、「何のボタンか分からない」は伝えたくない。
 * 押せないときは**専用の面と文字色**に切り替える — どちらもトークンなので
 * テーマごとに 4.5:1 が保たれる。`:disabled` の付いた側が詳細度で勝つので、
 * 見た目の種類(default / destructive …)より後に効く。
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-body font-medium cursor-pointer disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 lift",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md shadow-destructive/25 hover:bg-destructive",
        outline:
          "border border-border bg-background/70 backdrop-blur shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary",
        ghost: "lift-soft hover:bg-accent hover:text-accent-foreground shadow-none",
        link: "text-primary underline-offset-4 hover:underline shadow-none lift-soft",
      },
      size: {
        // apple-design §11: 44px is the minimum touch target. Default and icon
        // buttons meet the floor; `sm` stays compact for dense secondary rows.
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-footnote",
        lg: "h-12 rounded-md px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
