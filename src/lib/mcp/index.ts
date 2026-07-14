import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoAmI from "./tools/who-am-i";
import listMyStickers from "./tools/list-my-stickers";
import searchMyDex from "./tools/search-my-dex";
import getSticker from "./tools/get-sticker";
import listDueReviews from "./tools/list-due-reviews";

// OAuth issuer MUST be the direct Supabase auth host. On publish, SUPABASE_URL
// is rewritten to the .lovable.cloud proxy which mcp-js rejects (RFC 8414
// issuer mismatch). VITE_SUPABASE_PROJECT_ID is inlined by Vite at build
// time — the fallback keeps the value well-formed during the throwaway
// manifest-extract eval; the published build inlines the real ref and no
// token ever verifies against the sentinel.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "catchwords-mcp",
  title: "Catchwords MCP",
  version: "0.1.0",
  instructions:
    "Read-only tools over the signed-in user's Catchwords data (Taiwanese-Mandarin vocabulary learned by photographing objects in Taiwan). Use `who_am_i` to introduce yourself, `list_my_stickers` to browse recent catches, `search_my_dex` to look up a specific word in the user's dex, `get_sticker` for full detail on one entry, and `list_due_reviews` to see which SRS reviews are due now. Every result is scoped by Supabase RLS to the connected user only.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoAmI, listMyStickers, searchMyDex, getSticker, listDueReviews],
});
