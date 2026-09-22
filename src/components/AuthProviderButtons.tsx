import { Apple } from "lucide-react";

import { Button } from "@/components/ui/button";

type AuthProviderButtonsProps = {
  appleLabel: string;
  googleLabel: string;
  loading?: boolean;
  onApple: () => void;
  onGoogle: () => void;
};

export function AuthProviderButtons({
  appleLabel,
  googleLabel,
  loading = false,
  onApple,
  onGoogle,
}: AuthProviderButtonsProps) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogle}
        disabled={loading}
      >
        <span>{googleLabel}</span>
      </Button>
      <Button
        type="button"
        className="w-full bg-foreground font-semibold text-background shadow-sm hover:bg-foreground/90 hover:text-background"
        onClick={onApple}
        disabled={loading}
      >
        <Apple aria-hidden="true" className="size-5" strokeWidth={2.25} />
        <span>{appleLabel}</span>
      </Button>
    </div>
  );
}
