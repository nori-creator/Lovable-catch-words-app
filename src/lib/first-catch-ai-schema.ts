import { z } from "zod";
import { CATEGORY_KEYS } from "./category";
import { LearningPreferencesSchema } from "./learning-preferences";
import { UI_LANGS } from "./i18n";
import { TARGET_LANGUAGES } from "./target-lang";

export const PersonalLessonSchema = z.object({
  senses: z
    .array(z.object({ meaning: z.string().min(1).max(700), note: z.string().max(700) }))
    .min(1)
    .max(4),
  examples: z
    .array(
      z.object({
        sentence: z.string().min(1).max(700),
        translation: z.string().max(700),
        situation: z.string().max(500),
        explanation: z.string().max(900),
      }),
    )
    .min(1)
    .max(3),
});
export type PersonalLesson = z.infer<typeof PersonalLessonSchema>;
export const FirstCatchSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        headword: z.string().min(1).max(100),
        meaning_ja: z.string().min(1).max(500),
        reading_zhuyin: z.string().default(""),
        pinyin: z.string().default(""),
        category_key: z.enum(CATEGORY_KEYS).catch("other"),
        distinction: z.string().default(""),
      }),
    )
    .min(1)
    .max(5),
});
const common = {
  uiLanguage: z.enum(UI_LANGS),
  targetLanguage: z.enum(TARGET_LANGUAGES),
  preferences: LearningPreferencesSchema,
};
export const FirstCatchAIInput = z.discriminatedUnion("action", [
  z.object({
    ...common,
    action: z.literal("suggest"),
    photo: z
      .string()
      .min(100)
      .max(4_000_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  }),
  z.object({ ...common, action: z.literal("card"), headword: z.string().min(1).max(100) }),
  z.object({
    ...common,
    action: z.literal("lesson"),
    headword: z.string().min(1).max(100),
    meaning: z.string().max(1500),
  }),
]);
export type FirstCatchAIRequest = z.infer<typeof FirstCatchAIInput>;
