import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // `text-field`(16px)は見た目の選択ではない。15px の本文をそのまま
          // 入れていたので、iOS Safari が焦点のたびに画面を拡大していた
          // (`styles.css` の `--text-field` に理由を書いた)。
          // `md:text-body` で広い画面だけ 15px に戻していたが、iPad の
          // Safari も同じ拡大をするので、戻さない。
          "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2.5 text-field shadow-sm transition-colors file:border-0 file:bg-transparent file:text-body file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
