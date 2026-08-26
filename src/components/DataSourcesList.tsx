import { useT } from "@/lib/i18n";
import { DATA_SOURCES } from "@/lib/data-sources";

/**
 * 出典の一覧。**目立たない所に、小さい字で。**
 *
 * オーナー指示 2026-08-25:
 * > 「参考資料（出典）は**約款の中など全く目立たない所**に、小さい字で
 * >  法律的に大丈夫な範囲で」
 *
 * ## 消してはいけない
 * CEFR-J は**出典を明記することが利用の条件**。設定の一覧から外すのは
 * かまわないが、アプリのどこからも読めなくすると条件を外れる。
 * だから「消す」ではなく「**約款の中へ移す**」。
 *
 * 前は設定の主な流れの中に大きな札で並んでいた。学習者が毎日開く画面に
 * 出典の一覧が要る理由は無い。
 */
export function DataSourcesList() {
  const t = useT();
  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="text-footnote font-semibold text-muted-foreground">{t("settings.sources")}</h2>
      <p className="mt-1 text-caption text-muted-foreground">{t("settings.sourcesHint")}</p>
      <ul className="mt-2 space-y-2">
        {DATA_SOURCES.map((s) => (
          <li key={s.id} className="text-caption text-muted-foreground">
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              // 小さい字でも**押せる高さは確保する**(44px)。
              className="inline-flex min-h-11 flex-col justify-center underline"
            >
              <span className="font-medium text-foreground">{s.name}</span>
              <span>
                {s.author} · {s.license}
                {s.attributionRequired ? ` · ${t("sources.required")}` : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
