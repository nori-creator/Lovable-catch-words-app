import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

/** 法務の頁とサポート（同じ順で、どこからでも行き来できる）。 */
export const LEGAL_LINKS = [
  { href: "/terms", key: "auth.terms" },
  { href: "/privacy", key: "auth.privacy" },
  { href: "/legal/tokushoho", key: "legal.tokushoho" },
  { href: "/support", key: "legal.support" },
] as const;

/** 法務の頁とサポートへのリンクの列（設定・ログインの画面・法務の頁の下で使う）。`current` は外す。 */
export function LegalLinks({ current, className }: { current?: string; className?: string }) {
  const t = useT();
  return (
    <nav aria-label={t("legal.linksAria")} className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {LEGAL_LINKS.filter((l) => l.href !== current).map((l) => (
          <li key={l.href}>
            <a href={l.href} className="inline-block py-3 -my-1 underline">
              {t(l.key)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * 法務の頁の枠。戻る・本文・ほかの頁へのリンク。
 * `<a href>` で書く — ログイン前にも開く頁で、ハーネスでも同じ markup になる。
 */
export function LegalShell({
  current,
  children,
  footer,
}: {
  current: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <a
        href="/"
        className="inline-block py-3 -my-3 text-body text-muted-foreground hover:text-foreground"
      >
        ← {t("common.back")}
      </a>
      {children}
      <LegalLinks current={current} className="mt-8 text-footnote text-muted-foreground" />
      {footer}
    </article>
  );
}
