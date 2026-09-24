import { createServerFn } from "@tanstack/react-start";
import { FirstCatchAIInput } from "./first-catch-ai-schema";
/** Only this metered, read/generate-only trial endpoint is available before login. */
export const firstCatchAI = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => FirstCatchAIInput.parse(raw))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { executeGuestFirstCatch } = await import("./first-catch-guest.server");
    return executeGuestFirstCatch(data, getRequest());
  });
