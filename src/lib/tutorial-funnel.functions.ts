import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FUNNEL_SESSION_ID, TUTORIAL_STEPS } from "./funnel-events";

/**
 * **登録前のチュートリアルの段を1つ数える**（ログイン不要の受け口）。中身は
 * `tutorial-funnel.server.ts`（人を特定しない・同じセッションの同じ段は1回・送りすぎを止める）。
 * 失敗しても投げない — 数えられなかった理由を返すだけ（画面は何も変えない）。
 */
export const TutorialStepInput = z.object({
  step: z.enum(TUTORIAL_STEPS),
  sid: z.string().regex(FUNNEL_SESSION_ID),
});

export const recordTutorialStep = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => TutorialStepInput.parse(raw))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { executeTutorialStep } = await import("./tutorial-funnel.server");
    return executeTutorialStep(data, getRequest());
  });
