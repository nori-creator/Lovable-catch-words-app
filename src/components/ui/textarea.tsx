import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // `text-field`(16px)の理由は `styles.css` の `--text-field` を見る。
          // 15px だと iOS Safari が焦点のたびに画面を拡大して戻さない。
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-field shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
