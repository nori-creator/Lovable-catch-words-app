import { Fragment, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

/** 法務の頁とサポート（同じ順で、どこからでも行き来できる）。 */
export const LEGAL_LINKS = [
  { href: "/terms", key: "auth.terms" },
  { href: "/privacy", key: "auth.privacy" },
  { href: "/legal/tokushoho", key: "legal.tokushoho" },
  { href: "/support", key: "legal.support" },
] as const;

/** 法務のリンク1つぶんの見た目（設定の「AIへのデータ送信」のボタンも同じものを使う）。 */
export const LEGAL_LINK_CLASS = "inline-block py-3 -my-1 underline";

/**
 * 法務の頁とサポートへのリンクの列（設定・ログインの画面・法務の頁の下で使う）。`current` は外す。
 * `extra` はプライバシーポリシーのすぐ後ろに同じ並びで差し込む1項目（設定の AI へ送る同意。
 * オーナー指示 2026-10-09「AIを使う同意は規約などのほかのもの全く同じにして。」）。
 */
export function LegalLinks({
  current,
  className,
  extra,
}: {
  current?: string;
  className?: string;
  extra?: ReactNode;
}) {
  const t = useT();
  return (
    <nav aria-label={t("legal.linksAria")} className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {LEGAL_LINKS.filter((l) => l.href !== current).map((l) => (
          <Fragment key={l.href}>
            <li>
              <a href={l.href} className={LEGAL_LINK_CLASS}>
                {t(l.key)}
              </a>
            </li>
            {l.href === "/privacy" && extra ? <li>{extra}</li> : null}
          </Fragment>
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
