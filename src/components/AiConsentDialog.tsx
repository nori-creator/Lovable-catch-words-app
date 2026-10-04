import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Hand, ImageIcon, Lightbulb, Loader2, Network, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AI_CONSENT_VERSION, PRIVACY_AI_SECTION_URL } from "@/lib/ai-consent";
import { writeLocalConsent, type ConsentAsk } from "@/lib/ai-consent-client";
import { recordAiConsent } from "@/lib/ai-consent.functions";
import { useT } from "@/lib/i18n";

/**
 * **外部の AI へ送る前の確認の画面**（iOS の `AIConsentView` と同じ中身）。
 * 何を・どこへ・何のために送るか、同意しないとどうなるかを見せて、
 * 「同意して始める」/「同意しない」を選んでもらう。どちらかを選ぶまで閉じない
 * （外を押しても Esc でも閉じない — はっきりした同意だけを同意にする）。
 *
 * 登録した人はサーバに記録する（`recordAiConsent`）。登録前は端末に覚えるだけで、
 * 登録した後にもう一度聞く。
 */
export function AiConsentDialog({ ask, onClose }: { ask: ConsentAsk; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const record = useServerFn(recordAiConsent);
  const [saving, setSaving] = useState(false);

  async function decide(agreed: boolean) {
    if (saving) return;
    if (ask.mode === "guest") {
      writeLocalConsent("guest", agreed ? "granted" : "declined");
      onClose();
      ask.resolve(agreed);
      return;
    }
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (agreed) {
        await record({ data: { version: AI_CONSENT_VERSION, agreed: true, source: "web" } });
        toast.success(t("aiConsent.agreedToast"));
      }
      if (uid) writeLocalConsent(`user:${uid}`, agreed ? "granted" : "declined");
      void qc.invalidateQueries({ queryKey: ["ai-consent"] });
      onClose();
      ask.resolve(agreed);
    } catch {
      toast.error(t("aiConsent.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={() => undefined}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/60" />
        <DialogPrimitive.Content
          data-testid="ai-consent"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-[91] mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-border bg-background shadow-xl sm:inset-y-0 sm:my-auto sm:h-fit sm:rounded-3xl"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-6">
            <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles size={26} aria-hidden />
            </div>
            <DialogPrimitive.Title className="text-title font-extrabold leading-tight">
              {t("aiConsent.title")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-body text-muted-foreground">
              {t("aiConsent.lead")}
            </DialogPrimitive.Description>
            <div className="mt-4 space-y-3">
              <Point icon={<ImageIcon size={18} />} title={t("aiConsent.whatTitle")}>
                {t("aiConsent.whatBody")}
              </Point>
              <Point icon={<Network size={18} />} title={t("aiConsent.whoTitle")}>
                {t("aiConsent.whoBody")}
              </Point>
              <Point icon={<Lightbulb size={18} />} title={t("aiConsent.whyTitle")}>
                {t("aiConsent.whyBody")}
              </Point>
              <Point icon={<Hand size={18} />} title={t("aiConsent.declineTitle")}>
                {t("aiConsent.declineBody")}
              </Point>
            </div>
            <p className="mt-3 px-1 text-footnote text-muted-foreground">
              <a
                href={PRIVACY_AI_SECTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-2"
              >
                {t("aiConsent.detailsLink")}
              </a>
            </p>
          </div>
          <div className="space-y-1.5 border-t border-border px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              data-testid="ai-consent-accept"
              disabled={saving}
              onClick={() => void decide(true)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-body font-bold text-primary-foreground disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              {t("aiConsent.accept")}
            </button>
            <button
              type="button"
              data-testid="ai-consent-decline"
              disabled={saving}
              onClick={() => void decide(false)}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl px-4 text-body font-semibold text-primary disabled:opacity-60"
            >
              {t("aiConsent.decline")}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5">
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-body font-bold">{title}</div>
        <p className="mt-0.5 text-footnote leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
