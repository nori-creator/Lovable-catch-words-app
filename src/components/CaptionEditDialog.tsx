import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { CAPTION_MAX, updateStickerCaption } from "@/lib/stickers.functions";

/**
 * **ひと言を直す小窓**（オーナー指示 2026-09-30「ひと言は単語の詳細やホームの
 * アルバム、日記でそれぞれ編集できるようにして」）。
 *
 * 3か所（単語の詳細・ホームのアルバム・日記の左ページ）が**この1つを共有する**。
 * 保存したら札の一覧と詳細を読み直すので、どの画面の見た目も同じ内容に揃う。
 * `target` が null の間は閉じている。
 */
export type CaptionTarget = { id: string; caption: string | null };

export function CaptionEditDialog({
  target,
  onClose,
  onSaved,
}: {
  target: CaptionTarget | null;
  onClose: () => void;
  /** 保存できた後（日記の絵を描き直すなど）。 */
  onSaved?: (id: string, caption: string | null) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const save = useServerFn(updateStickerCaption);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setText(target.caption ?? "");
  }, [target]);

  async function submit() {
    if (!target || busy) return;
    setBusy(true);
    try {
      const { caption } = await save({ data: { sticker_id: target.id, caption: text } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["stickers"] }),
        qc.invalidateQueries({ queryKey: ["sticker", target.id] }),
      ]);
      onSaved?.(target.id, caption);
      toast.success(t("caption.saved"));
      onClose();
    } catch {
      // 入れた文字は残す（もう一度押せる）。
      toast.error(t("caption.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      {/* 本の片ページ（z-80）や詳細の上でも隠れないよう、層を上げる。 */}
      <DialogContent className="z-[120] max-w-sm" overlayClassName="z-[120]">
        <DialogHeader>
          <DialogTitle>{t("caption.editTitle")}</DialogTitle>
          <DialogDescription>{t("caption.editHint")}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={text}
          maxLength={CAPTION_MAX}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          aria-label={t("caption.editTitle")}
          placeholder={t("capture.notePlaceholder")}
        />
        <div className="text-right text-caption text-muted-foreground tabular-nums">
          {text.length}/{CAPTION_MAX}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t("caption.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 単語の詳細に出す「ひと言」の1行。直すための鉛筆つき。
 * ひと言が無い札には「ひと言を書く」を出す（`editable` の時だけ）。
 */
export function CaptionLine({
  stickerId,
  caption,
  editable = true,
}: {
  stickerId: string;
  caption: string | null;
  editable?: boolean;
}) {
  const t = useT();
  const [target, setTarget] = useState<CaptionTarget | null>(null);
  if (!caption && !editable) return null;
  return (
    <div className="mt-2 flex items-start gap-1">
      {caption ? (
        <p className="min-w-0 flex-1 break-words text-body">「{caption}」</p>
      ) : (
        <span className="min-w-0 flex-1 text-footnote text-muted-foreground">
          {t("caption.editTitle")}
        </span>
      )}
      {editable && (
        <button
          type="button"
          onClick={() => setTarget({ id: stickerId, caption })}
          aria-label={caption ? t("caption.edit") : t("caption.add")}
          className="lift-soft -my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <CaptionEditDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
