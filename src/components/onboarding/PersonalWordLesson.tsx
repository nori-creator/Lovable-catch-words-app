import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { useT, useUiLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { firstCatchAI } from "@/lib/first-catch-ai.functions";
import {
  PersonalLessonSchema,
  type PersonalLesson,
  type FirstCatchAIRequest,
} from "@/lib/first-catch-ai-schema";
import {
  learningPreferencesOf,
  learningPreferencesKey,
  type LearningPreferences,
} from "@/lib/learning-preferences";
import { normalizeTargetLanguage } from "@/lib/target-lang";
import { PronounceButton } from "@/components/PronounceButton";
import "./first-catch.css";

export type PersonalLessonContext = {
  id: string;
  preferences: LearningPreferences;
  initial?: PersonalLesson;
  request?: (data: FirstCatchAIRequest) => Promise<unknown>;
  onReady?: (lesson: PersonalLesson) => void;
};

/** Personal examples are a separate, user-scoped query. They never overwrite the
 * canonical word or the shared language/L1 explanation cache. */
export function PersonalWordLesson({
  headword,
  meaning,
  language,
  context,
}: {
  headword: string;
  meaning: string;
  language?: string | null;
  context?: PersonalLessonContext;
}) {
  const t = useT();
  const uiLanguage = useUiLang();
  const call = useServerFn(firstCatchAI);
  const [saved, setSaved] = useState<{ id: string; preferences: LearningPreferences } | null>(null);
  const onReady = useRef(context?.onReady);
  onReady.current = context?.onReady;
  useEffect(() => {
    if (context) return;
    let active = true;
    const sync = (
      session: { user: { id: string; user_metadata?: Record<string, unknown> } } | null,
    ) => {
      if (!active) return;
      const preferences = learningPreferencesOf(session?.user.user_metadata?.learning_preferences);
      setSaved(session && preferences ? { id: session.user.id, preferences } : null);
    };
    /*
     * **ログインの仕組みに繋がらない所でも、単語の詳細ごと落とさない。**
     * Supabase の設定が無い所（Netlify の確認用ページ）では `supabase.auth` に
     * 触れた瞬間に投げる。ここは「あなたの場面で使ってみよう」の欄を足すだけ
     * なので、繋がらなければ欄を出さずに進む — 前はこの一行で単語の詳細の
     * 画面全体が真っ白になっていた（2026-09-24 に確認用ページで見つけた）。
     */
    let data: { subscription: { unsubscribe: () => void } } | null = null;
    try {
      void supabase.auth
        .getSession()
        .then(({ data }) => sync(data.session))
        .catch(() => {});
      data = supabase.auth.onAuthStateChange((_event, session) => sync(session)).data;
    } catch {
      sync(null);
    }
    return () => {
      active = false;
      data?.subscription.unsubscribe();
    };
  }, [!!context]);
  const source = context ?? saved;
  const query = useQuery({
    queryKey: [
      "personal-word-lesson",
      source?.id,
      headword,
      language,
      uiLanguage,
      source ? learningPreferencesKey(source.preferences) : "",
    ],
    queryFn: async () => {
      const data: FirstCatchAIRequest = {
        action: "lesson",
        headword,
        meaning,
        targetLanguage: normalizeTargetLanguage(language),
        uiLanguage,
        preferences: source!.preferences,
      };
      const response = context?.request ? await context.request(data) : await call({ data });
      return PersonalLessonSchema.parse(response);
    },
    enabled:
      !!source &&
      !!(context || source.preferences.goals.length || source.preferences.interests.length),
    initialData: context?.initial,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  useEffect(() => {
    if (query.data) onReady.current?.(query.data);
  }, [query.data]);
  if (
    !source ||
    (!source.preferences.goals.length && !source.preferences.interests.length && !context)
  )
    return null;
  return (
    <section className="personal-lesson" aria-labelledby="personal-lesson-title">
      <div className="personal-lesson-heading">
        <Sparkles size={20} />
        <h2 id="personal-lesson-title">{t("first.personalTitle")}</h2>
      </div>
      <p className="first-sub">{t("first.personalHint")}</p>
      {query.isFetching && (
        <p className="personal-lesson-status" role="status">
          <Loader2 className="animate-spin" size={18} />
          {t("first.personalLoading")}
        </p>
      )}
      {query.isError && (
        <div role="alert">
          <p>{t("first.personalFailed")}</p>
          <button className="first-secondary" onClick={() => void query.refetch()}>
            {t("first.retry")}
          </button>
        </div>
      )}
      {query.data && (
        <>
          <h3>{t("first.otherMeanings")}</h3>
          <ol className="personal-senses">
            {query.data.senses.map((sense, i) => (
              <li key={i}>
                <strong>{sense.meaning}</strong>
                {sense.note && <p>{sense.note}</p>}
              </li>
            ))}
          </ol>
          <div className="personal-examples">
            {query.data.examples.map((example, i) => (
              <article key={i}>
                <span className="personal-situation">{example.situation}</span>
                <div className="personal-example-line">
                  <p lang={normalizeTargetLanguage(language)}>{example.sentence}</p>
                  <PronounceButton
                    text={example.sentence}
                    language={normalizeTargetLanguage(language)}
                  />
                </div>
                <p className="personal-translation">{example.translation}</p>
                <p className="personal-explanation">{example.explanation}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
