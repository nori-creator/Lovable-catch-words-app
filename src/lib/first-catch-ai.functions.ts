import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FirstCatchAIInput } from "./first-catch-ai-schema";

export const firstCatchAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FirstCatchAIInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { executeFirstCatchAI } = await import("./first-catch-ai.server");
    return executeFirstCatchAI(data, context);
  });
