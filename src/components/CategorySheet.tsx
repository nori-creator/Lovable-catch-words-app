import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ListChecks, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { CATEGORY_META, type CategoryKey } from "@/lib/category";
import {
  categoryDisplay,
  cleanCategoryLabel,
  isBuiltinCategory,
  type UserCategory,
} from "@/lib/user-category";
import { useT } from "@/lib/i18n";
import { useDragDismiss } from "@/hooks/use-drag-dismiss";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * **カテゴリーの一覧と編集**（オーナー指示 2026-09-27「ユーザーがカテゴリーの
 * 名前を変更したり、作成したり、写真のカテゴリーを移動したり、編集できる
 * ようにして」）。
 *
 * 2つの入り方で同じ面を使う:
 *   ・写真の詳細から … 押したカテゴリーへその1枚を移す（`current` あり）
 *   ・図鑑の絞り込みから … 名前を変える・作る・消すだけ（`current` なし）
 *
 * 通信は呼ぶ側が持つ（`onMove` / `onSave` / `onDelete`）。ここは見た目と
 * 入力だけ — 確認用ページでも同じ物を動かせるように。
 */
export function CategorySheet({
  current,
  usedKeys,
  userCategories,
  onMove,
  onSave,
  onDelete,
  onEditMembers,
  onClose,
  initialEditing = null,
}: {
  /** 写真を移すときの、いまのカテゴリー。無ければ編集だけ。 */
  current?: string | null;
  /** 図鑑で使っているカテゴリー（上にまとめて出す）。 */
  usedKeys: readonly string[];
  userCategories: readonly UserCategory[];
  onMove?: (key: string) => Promise<void>;
  /** 作る（`key` 無し）か、名前と絵文字を変える。作った鍵を返す。 */
  onSave: (input: { key?: string; label: string; emoji: string }) => Promise<string>;
  onDelete: (key: string) => Promise<void>;
  /** カテゴリーの側から、入れる単語を選ぶ面を開く（図鑑から開いた時だけ）。 */
  onEditMembers?: (key: string) => void;
  onClose: () => void;
  /** 開いた時に最初から編集しておくカテゴリー（図鑑の見出しの長押し、R14）。 */
  initialEditing?: string | null;
}) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const { dragProps, grabber } = useDragDismiss({ onDismiss: onClose, enabled: !reduced });
  const labelOf = (k: CategoryKey) => t(`cat.${k}`);
  const [editing, setEditing] = useState<string | null>(initialEditing);
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 上: 使っている物と自分で作った物。下: 残りの既定の分類。 */
  const { top, rest } = useMemo(() => {
    const seen = new Set<string>();
    const top: string[] = [];
    const push = (k: string) => {
      if (!seen.has(k)) {
        seen.add(k);
        top.push(k);
      }
    };
    if (current) push(current);
    usedKeys.forEach(push);
    userCategories.filter((c) => !isBuiltinCategory(c.key)).forEach((c) => push(c.key));
    const rest = (Object.keys(CATEGORY_META) as CategoryKey[]).filter((k) => !seen.has(k));
    return { top, rest };
  }, [current, usedKeys, userCategories]);

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "CATEGORY_LABEL_INVALID"
          ? t("catEdit.nameInvalid")
          : t("catEdit.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const row = (key: string) => {
    const d = categoryDisplay(key, userCategories, labelOf);
    const on = current === key;
    if (editing === key) {
      return (
        <li key={key}>
          <CategoryForm
            initialLabel={d.label}
            initialEmoji={d.emoji}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={(label, emoji) =>
              run(async () => {
                await onSave({ key, label, emoji });
                setEditing(null);
              })
            }
            extra={
              d.custom ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive-ink"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t("catEdit.deleteConfirm", { name: d.label }))) return;
                    void run(async () => {
                      await onDelete(key);
                      setEditing(null);
                    });
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> {t("catEdit.delete")}
                </Button>
              ) : d.renamed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await onDelete(key);
                      setEditing(null);
                    })
                  }
                >
                  <Undo2 className="mr-1 h-4 w-4" /> {t("catEdit.resetName")}
                </Button>
              ) : null
            }
          />
        </li>
      );
    }
    return (
      <li key={key} className="flex items-center gap-1">
        <button
          type="button"
          className="category-row press-in flex min-h-12 flex-1 items-center gap-3 rounded-2xl px-3 text-start"
          aria-pressed={onMove ? on : undefined}
          disabled={busy || (!onMove && !onEditMembers)}
          onClick={() =>
            onMove ? void run(() => onMove(key)) : onEditMembers && onEditMembers(key)
          }
        >
          <span aria-hidden className="text-title3">
            {d.emoji}
          </span>
          <span className="flex-1 text-body font-medium">{d.label}</span>
          {on && <Check aria-hidden className="h-5 w-5 text-primary" />}
        </button>
        {onEditMembers && (
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
            aria-label={t("catEdit.members", { name: d.label })}
            disabled={busy}
            onClick={() => onEditMembers(key)}
          >
            <ListChecks className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
          aria-label={t("catEdit.rename", { name: d.label })}
          disabled={busy}
          onClick={() => {
            setCreating(false);
            setEditing(key);
          }}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </li>
    );
  };

  return (
    <div
      {...dragProps}
      className="material-in fixed inset-0 z-50 flex flex-col material-thick"
      role="dialog"
      aria-modal="true"
      aria-label={t(onMove ? "catEdit.moveTitle" : "catEdit.title")}
    >
      {grabber && (
        <div className="shrink-0 pb-1 pt-2" aria-hidden>
          <div className="mx-auto h-1 w-9 rounded-full bg-foreground/25" />
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <h2 className="text-headline font-semibold">
          {t(onMove ? "catEdit.moveTitle" : "catEdit.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {error && (
          <p
            role="alert"
            className="mb-2 rounded-xl bg-destructive/10 p-3 text-footnote text-destructive-ink"
          >
            {error}
          </p>
        )}
        <p className="px-2 pb-1 text-caption font-semibold text-muted-foreground">
          {t("catEdit.yours")}
        </p>
        <ul className="space-y-0.5">{top.map(row)}</ul>

        <div className="mt-2 px-1">
          {creating ? (
            <CategoryForm
              initialLabel=""
              initialEmoji="📦"
              busy={busy}
              onCancel={() => setCreating(false)}
              onSubmit={(label, emoji) =>
                run(async () => {
                  const key = await onSave({ label, emoji });
                  setCreating(false);
                  // 写真から開いたときは、作ったカテゴリーへそのまま移す。
                  if (onMove) await onMove(key);
                })
              }
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> {t("catEdit.create")}
            </Button>
          )}
        </div>

        <button
          type="button"
          className="mt-4 flex min-h-11 w-full items-center justify-between px-2 text-caption font-semibold text-muted-foreground"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {t("catEdit.others", { n: String(rest.length) })}
          <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
        </button>
        {showAll && <ul className="space-y-0.5">{rest.map(row)}</ul>}
      </div>
    </div>
  );
}

/** 絵文字と名前の2つの欄。作るときと名前を変えるときで同じ形。 */
function CategoryForm({
  initialLabel,
  initialEmoji,
  busy,
  onSubmit,
  onCancel,
  extra,
}: {
  initialLabel: string;
  initialEmoji: string;
  busy: boolean;
  onSubmit: (label: string, emoji: string) => void;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const t = useT();
  const [label, setLabel] = useState(initialLabel);
  const [emoji, setEmoji] = useState(initialEmoji);
  const valid = cleanCategoryLabel(label) !== null;
  return (
    <form
      className="category-form space-y-2 rounded-2xl border border-border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(label, emoji);
      }}
    >
      <div className="flex gap-2">
        <Input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          aria-label={t("catEdit.emoji")}
          className="w-14 text-center text-title3"
          maxLength={8}
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("catEdit.namePlaceholder")}
          aria-label={t("catEdit.namePlaceholder")}
          maxLength={40}
          autoFocus
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={busy || !valid}>
          {t("catEdit.save")}
        </Button>
      </div>
    </form>
  );
}
