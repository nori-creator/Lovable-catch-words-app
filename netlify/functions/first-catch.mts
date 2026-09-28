import { FirstCatchAIInput } from "../../src/lib/first-catch-ai-schema";
import { executeGuestFirstCatch } from "../../src/lib/first-catch-guest.server";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export default async function handler(request: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configured = !!(
    url &&
    key &&
    ["LOVABLE_API_KEY", "GEMINI_API_KEY", "AI_API_KEY", "OPENAI_API_KEY"].some(
      (name) => process.env[name],
    )
  );
  if (request.method === "GET") return json({ available: configured });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!configured) return json({ error: "FIRST_CATCH_PREVIEW_UNAVAILABLE" }, 503);
  if (Number(request.headers.get("content-length")) > 4_100_000)
    return json({ error: "INVALID_INPUT" }, 413);
  try {
    const body = await request.text();
    if (body.length > 4_100_000) return json({ error: "INVALID_INPUT" }, 413);
    const data = FirstCatchAIInput.safeParse(JSON.parse(body));
    if (!data.success) return json({ error: "INVALID_INPUT" }, 400);
    return json(await executeGuestFirstCatch(data.data, request));
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "INVALID_INPUT" }, 400);
    const limited = e instanceof Error && e.message === "FIRST_CATCH_LIMIT";
    return json(
      { error: limited ? "FIRST_CATCH_LIMIT" : "FIRST_CATCH_AI_UNAVAILABLE" },
      limited ? 429 : 503,
    );
  }
}
export const config = {
  path: "/api/first-catch",
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
