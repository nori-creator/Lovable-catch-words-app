import { ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { corpusLinksFor, corpusHref, copiesWord, type CorpusSection } from "@/lib/corpus-links";

/**
 * その節の下に置く「もっと詳しく」— 台湾華語のコーパスへのリンク。
 *
 * ## 「外部」の印を必ず付ける
 * このアプリは最初に「**検証済みと AI 生成を区別する**」と決めた。
 * コーパスはそのどちらでもない**第3の出所**なので、混ぜずに
 * 「外部」と書く。書かないと、AI が書いた解説と同じ顔で並ぶ。
 *
 * ## 語を写してから開く
 * どの系統も検索の URL の形をこちらで確かめられなかったので
 * (`src/lib/corpus-links.ts` の注釈)、**開く前に語を写す**。
 * 写せなかったときも黙って開く — 開けること自体は失われない。
 */
export function CorpusLinks({ section, headword }: { section: CorpusSection; headword: string }) {
  const t = useT();
  const sources = corpusLinksFor(section);
  if (sources.length === 0) return null;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="mb-1 text-caption text-muted-foreground">{t("corpus.more")}</p>
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <li key={s.id}>
            <a
              href={corpusHref(s, headword)}
              target="_blank"
              rel="noreferrer"
              title={t(s.hintKey)}
              onClick={() => {
                if (!copiesWord(s)) return;
                // 写せたときだけ知らせる。**節ごとに同じ注意書きを置かない** —
                // 1枚のカードに4箇所出るので、常設の説明文にすると
                // 同じ1文が4回並ぶ(検査の絵で見つけた)。
                void navigator.clipboard
                  ?.writeText(headword)
                  .then(() => toast.success(t("corpus.copied", { w: headword })))
                  .catch(() => {});
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 text-caption font-medium shadow-sm ring-1 ring-border"
            >
              {s.needsLogin && (
                <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span>{t(s.labelKey)}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
