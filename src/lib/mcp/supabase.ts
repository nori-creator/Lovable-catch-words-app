// Server-only helper: build a Supabase client that acts as the MCP caller.
// The token comes from the MCP ToolContext (verified by @lovable.dev/mcp-js
// against the Supabase OAuth issuer). RLS runs as that user.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

export function supabaseForCaller(ctx: ToolContext): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
