import { Fragment, type ReactNode } from "react";
import { UI_LANGS, useT, type UiLang } from "@/lib/i18n";
import { legalHrefFor } from "@/lib/legal-lang";

/** 言語の切り替えの札。**その言語自身の名前**で書く（読めない言語の名前は役に立たない）。 */
const LANG_NAMES: Record<UiLang, string> = {
  ja: "日本語",
  en: "English",
  "zh-TW": "繁體中文",
};

/**
 * 法務の頁の言語の切り替え（2026-10-15）。`?lang=` を付け替えるだけのリンク — iPhone の Safari で
 * 開いた時も、app の設定を触らずにその場で言語を変えられる。
 */
export function LegalLangSwitch({ current, lang }: { current: string; lang: UiLang }) {
  const t = useT();
  return (
    <nav aria-label={t("legal.langSwitchAria")} className="mt-3 text-footnote">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {UI_LANGS.map((l) => (
          <li key={l}>
            {l === lang ? (
              <span aria-current="page" className="inline-block py-3 -my-1 font-semibold">
                {LANG_NAMES[l]}
              </span>
            ) : (
              <a
                href={legalHrefFor(current, l)}
                hrefLang={l}
                className={`${LEGAL_LINK_CLASS} text-muted-foreground`}
              >
                {LANG_NAMES[l]}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

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
  lang,
  children,
  footer,
}: {
  current: string;
  /** この頁の表示言語（`useLegalLang`）。渡せば言語の切り替えを出す。 */
  lang?: UiLang;
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
      {lang && <LegalLangSwitch current={current} lang={lang} />}
      {children}
      <LegalLinks current={current} className="mt-8 text-footnote text-muted-foreground" />
      {footer}
    </article>
  );
}
