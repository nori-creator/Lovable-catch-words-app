# First Catch before signup

Branch implementation: `/welcome` → questions → real Home/Dex/Review components → real camera → existing AI candidates/card → existing PeelSticker/CatchLanding → local Dex addition → `/auth` → authenticated import.

## Product contract

- Display language, learning language and desired daily minutes are the three opening questions. Minutes are a saved preference, not a daily quota, notification schedule or streak.
- Supported display/learning languages come from the existing registries. No mascot, Spanish, badges, ranking or streak claims.
- Registration is **after** the first photo/word has been committed to IndexedDB and the real Dex cell has rendered. The existing landing animation completes before the two-second added-state dwell starts.
- During guidance, only the spotlighted operation and coach navigation are interactive. File input fallback, keyboard focus, camera errors, storage errors and retries remain supported.
- Auth renders the same Home masthead/collage components with the actual captured photo. Before a photo exists, Home and Auth share the same generated cafe photograph (`public/first-catch-cafe.webp`); there is no separately illustrated login hero.
- Email signup confirmation, OAuth navigation and reload retain the local draft. Server import uses a stable sticker UUID, caller-owned photo path and existing authenticated functions. The local photo is cleared only after successful import and profile persistence.

## Review

Netlify Deploy Preview opens `first-catch` by default. This uses production components, with deterministic AI results and in-memory persistence. It does not register accounts or call production AI.

Useful additional scenes: `?scene=first-catch&step=card`, `?scene=first-catch&step=added`, `?scene=first-catch&step=account`, and `?scene=first-catch&step=card&fail=storage`. Preview data is a labelled fixture; camera capture still uses the real camera component.

## Production gate (not enabled by this PR)

The project's public Auth settings were read on 2026-09-22. `external.anonymous_users` is **false**. The app's AI functions require authentication. This implementation uses Supabase anonymous sign-in for pre-signup AI access; it does not remove middleware, expose an unauthenticated paid AI endpoint, use a service key in the browser, or silently register permanent accounts.

Before merging/releasing:

1. Review existing RLS/server authorization for anonymous users (they receive the authenticated role), AI spend caps, signup rate limits, bot protection and anonymous-account cleanup.
2. Enable anonymous sign-ins in the intended environment after that review. No Auth configuration or RLS changes are applied here.
3. Exercise an actual camera → candidates → peel → Dex → email confirmation / Google / Apple → same-photo import journey with dedicated test accounts in that environment, including failed network/save and duplicate retry.
4. Approve the mobile visual experience before merge, as required by AGENTS.md.

If anonymous access is unavailable, the captured photo remains local and a retry message is shown. The app does not jump to signup early or fabricate an AI result.

Anonymous sessions hold AI usage/profile preferences only. Photos/catches remain local until permanent signup; sign-in to an existing account imports under that authenticated account, preserving its existing profile preferences. Anonymous-session cleanup is an operational requirement.
