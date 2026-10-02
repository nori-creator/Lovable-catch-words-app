import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { CategoryKey } from "@/lib/category";
import { categoryDisplay, stickerCategoryKey, type UserCategory } from "@/lib/user-category";
import {
  canRemoveFrom,
  membersOf,
  membershipChanges,
  type MemberChange,
  type MemberItem,
} from "@/lib/category-members";
import { useT, useUiLang } from "@/lib/i18n";
import { readerMeaningCached } from "@/lib/reader-meanings";
import { ReaderMeaning } from "@/components/ReaderMeaning";
import { useDragDismiss } from "@/hooks/use-drag-dismiss";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MemberRow = MemberItem & {
  headword: string;
  meaning?: string | null;
  /** 語の id。意味を読む人の言語で出すため（`ReaderMeaning`）。 */
  wordId?: string | null;
  thumb?: string | null;
};

/**
 * **カテゴリーの側から、入れる単語を選ぶ面**（オーナー指示 2026-09-28「図鑑の
 * カテゴリーに入れる単語をユーザーが編集できるようにして。ある単語をあるカテゴリーに
 * 追加削除できるようにして」）。
 *
 * 前は写真の詳細から1枚ずつ移すしかなく、「旅行」に10語入れたい時に10回開いていた。
 * ここは**全部の単語に印を付ける一覧**: 印あり＝このカテゴリーに入っている。押すたびに
 * 印が付け外しされ、下の「N件を変更」でまとめて書く。いまどこに居るかも小さく出す
 * （外すとどこへ戻るかが読める）。
 *
 * 通信は呼ぶ側（`onApply`）。ここは見た目と選び方だけ — 確認用ページでも同じ物を動かす。
 */
export function CategoryMembersSheet({
  categoryKey,
  items,
  userCategories,
  onApply,
  onClose,
}: {
  categoryKey: string;
  items: readonly MemberRow[];
  userCategories: readonly UserCategory[];
  onApply: (changes: MemberChange[]) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const { dragProps, grabber } = useDragDismiss({ onDismiss: onClose, enabled: !reduced });
  const labelOf = (k: CategoryKey) => t(`cat.${k}`);
  const userKeys = useMemo(() => new Set(userCategories.map((c) => c.key)), [userCategories]);
  const initial = useMemo(
    () => membersOf(items, categoryKey, userKeys),
    [items, categoryKey, userKeys],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [q, setQ] = useState("");
  const uiLang = useUiLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = categoryDisplay(categoryKey, userCategories, labelOf);
  const removable = canRemoveFrom(categoryKey);

  // 入っている物を上、ほかを下。同じ語が何枚あっても1行ずつ（写真ごとに移せる）。
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (r: MemberRow) =>
      !needle ||
      r.headword.toLowerCase().includes(needle) ||
      (r.meaning ?? "").toLowerCase().includes(needle) ||
      readerMeaningCached(r.wordId, uiLang).toLowerCase().includes(needle);
    return [...items]
      .filter(hit)
      .sort((a, b) => Number(initial.has(b.id)) - Number(initial.has(a.id)));
  }, [items, q, initial, uiLang]);

  const changes = useMemo(
    () => membershipChanges(items, categoryKey, selected, userKeys),
    [items, categoryKey, selected, userKeys],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (!removable && initial.has(id)) return prev;
        next.delete(id);
      } else next.add(id);
      return next;
    });
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await onApply(changes);
      onClose();
    } catch {
      setError(t("catEdit.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      {...dragProps}
      className="material-in fixed inset-0 z-50 flex flex-col material-thick"
      role="dialog"
      aria-modal="true"
      aria-label={t("catEdit.members", { name: name.label })}
    >
      {grabber && (
        <div className="shrink-0 pb-1 pt-2" aria-hidden>
          <div className="mx-auto h-1 w-9 rounded-full bg-foreground/25" />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-headline font-semibold">
            <span aria-hidden className="mr-1">
              {name.emoji}
            </span>
            {t("catEdit.members", { name: name.label })}
          </h2>
          <p className="text-caption text-muted-foreground">
            {t("catEdit.membersCount", { n: String(selected.size) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 pt-3">
        <label className="relative block">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("catEdit.membersSearch")}
            aria-label={t("catEdit.membersSearch")}
            className="pl-9"
          />
        </label>
        {!removable && (
          <p className="mt-2 text-caption text-muted-foreground">{t("catEdit.membersNoRemove")}</p>
        )}
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-3" role="list">
        {rows.map((r) => {
          const on = selected.has(r.id);
          const now = stickerCategoryKey(r, userKeys);
          const where = now === categoryKey ? null : categoryDisplay(now, userCategories, labelOf);
          const locked = !removable && initial.has(r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={busy || locked}
                onClick={() => toggle(r.id)}
                className="category-row press-in flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 text-start"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                  {r.thumb ? (
                    <img src={r.thumb} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span aria-hidden className="text-title3">
                      {categoryDisplay(now, userCategories, labelOf).emoji}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span lang="zh-Hant" className="block truncate text-body font-semibold">
                    {r.headword}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {/* 意味は読む人の言語で（英語・繁體中文の人に日本語の意味を出さない。2026-10-02）。 */}
                    <ReaderMeaning text={r.meaning} wordId={r.wordId} />
                    {where && ` · ${t("catEdit.membersFrom", { name: where.label })}`}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                  }`}
                >
                  {on && <Check className="h-4 w-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border/60 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        {error && (
          <p role="alert" className="mb-2 text-footnote text-destructive-ink">
            {error}
          </p>
        )}
        <Button
          type="button"
          className="w-full"
          disabled={busy || changes.length === 0}
          onClick={() => void apply()}
        >
          {t("catEdit.membersApply", { n: String(changes.length) })}
        </Button>
      </div>
    </div>
  );
}
