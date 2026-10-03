import { CardSchema } from "./card-schema";
import { FirstCatchSuggestionsSchema, type FirstCatchAIRequest } from "./first-catch-ai-schema";
import { LearningPreferencesSchema } from "./learning-preferences";
import type { FirstCatch } from "./first-catch";

/**
 * @param shrinkForAi 写真を AI に送る前に縮める（本物の撮影と同じ長い辺 768px）。端末に残す
 *   写真（1024px）はそのまま。縮められなければ元の写真で送る。
 */
export function createFirstCatchServices(
  request: (data: FirstCatchAIRequest) => Promise<unknown>,
  prepare: () => Promise<void>,
  shrinkForAi: (photo: string) => Promise<string> = async (photo) => photo,
) {
  const common = (draft: FirstCatch) => ({
    uiLanguage: draft.uiLanguage,
    targetLanguage: draft.targetLanguage,
    preferences: LearningPreferencesSchema.parse(draft),
  });
  return {
    prepare,
    suggest: async (photo: string, draft: FirstCatch) => {
      const sent = await shrinkForAi(photo).catch(() => photo);
      return FirstCatchSuggestionsSchema.parse(
        await request({ ...common(draft), action: "suggest", photo: sent }),
      );
    },
    card: async (headword: string, draft: FirstCatch) =>
      CardSchema.parse(await request({ ...common(draft), action: "card", headword })),
    lesson: request,
  };
}
