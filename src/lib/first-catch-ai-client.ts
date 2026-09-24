import { CardSchema } from "./card-schema";
import { FirstCatchSuggestionsSchema, type FirstCatchAIRequest } from "./first-catch-ai-schema";
import { LearningPreferencesSchema } from "./learning-preferences";
import type { FirstCatch } from "./first-catch";

export function createFirstCatchServices(
  request: (data: FirstCatchAIRequest) => Promise<unknown>,
  prepare: () => Promise<void>,
) {
  const common = (draft: FirstCatch) => ({
    uiLanguage: draft.uiLanguage,
    targetLanguage: draft.targetLanguage,
    preferences: LearningPreferencesSchema.parse(draft),
  });
  return {
    prepare,
    suggest: async (photo: string, draft: FirstCatch) =>
      FirstCatchSuggestionsSchema.parse(
        await request({ ...common(draft), action: "suggest", photo }),
      ),
    card: async (headword: string, draft: FirstCatch) =>
      CardSchema.parse(await request({ ...common(draft), action: "card", headword })),
    lesson: request,
  };
}
