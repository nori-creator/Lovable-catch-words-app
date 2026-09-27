import { createServerFn } from "@tanstack/react-start";
import { FirstCatchAIInput } from "./first-catch-ai-schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
/** Only this metered, read/generate-only trial endpoint is available before login. */
export const firstCatchAI = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => FirstCatchAIInput.parse(raw))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { executeGuestFirstCatch } = await import("./first-catch-guest.server");
    return executeGuestFirstCatch(data, getRequest());
  });

/** Direct signups can run the same tutorial under their own metered account. */
export const firstCatchMemberAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FirstCatchAIInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { executeFirstCatchAI } = await import("./first-catch-ai.server");
    return executeFirstCatchAI(data, context);
  });
