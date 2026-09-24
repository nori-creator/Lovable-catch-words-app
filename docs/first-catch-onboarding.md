# First Catch before signup

Branch implementation: `/welcome` introduction → five questions → notification preferences → ready screen → generated photos in the real Home album and Dex → guided Review → real camera → real image analysis → word card → PeelSticker/CatchLanding → local Dex addition → open word detail → `/auth` → authenticated import.

## Product contract

- Display language, learning language, daily minutes, learning goals and interests are the five opening questions. Minutes are a saved preference, not a daily quota, notification schedule or streak. Goals/interests are stored on the user account and tailor personal examples and notes on word details, never the shared canonical word or vision evidence.
- Supported display/learning languages come from the existing registries. No mascot, Spanish, badges, ranking or streak claims.
- Registration is **after** the first photo/word has been committed to IndexedDB, the existing landing animation has hit the real Dex cell and the learner has opened the detailed word card. There is no automatic time-based jump to signup.
- During guidance, only the spotlighted operation and coach navigation are interactive. File input fallback, keyboard focus, camera errors, storage errors and retries remain supported.
- Auth renders the same Home masthead/collage components with the actual captured photo. Before a photo exists, Home and Auth share the same explicitly labelled generated cafe, flower and cat photos. The Dex tour displays these as examples rather than an empty-state message. The ready screen has a generated travel photo. Notification choices are stored as preferences; this flow does not promise scheduled browser delivery.
- Email signup confirmation, OAuth navigation and reload retain the local draft. Server import uses a stable sticker UUID, caller-owned photo path and existing authenticated functions. The local photo is cleared only after successful import and profile persistence.

## Review

Netlify Deploy Preview opens `first-catch` by default without a developer menu. It uses the production components and an authenticated preview endpoint for the actual AI path. AI and Auth are unavailable until the intended environment has configured publishable Supabase and AI keys and reviewed anonymous sign-in. The preview fails explicitly; it never presents a canned word as though detected in the visitor's photo. In-memory sample screens and account form are for visual review only.

Useful additional scenes: `?scene=first-catch&step=card`, `?scene=first-catch&step=added`, `?scene=first-catch&step=explore`, `?scene=first-catch&step=account`, and `?scene=first-catch&step=card&fail=storage`. Sample screens are explicitly labelled; camera capture still uses the real camera component.

## Production gate (not enabled by this PR)

The project's public Auth settings were read on 2026-09-22. `external.anonymous_users` is **false**. The app's AI functions require authentication. This implementation uses Supabase anonymous sign-in for pre-signup AI access; it does not remove middleware, expose an unauthenticated paid AI endpoint, use a service key in the browser, or silently register permanent accounts.

Before merging/releasing:

1. Review existing RLS/server authorization for anonymous users (they receive the authenticated role), AI spend caps, signup rate limits, bot protection and anonymous-account cleanup.
2. Enable anonymous sign-ins in the intended environment after that review. No Auth configuration or RLS changes are applied here.
3. Exercise an actual camera → candidates → peel → Dex → email confirmation / Google / Apple → same-photo import journey with dedicated test accounts in that environment, including failed network/save and duplicate retry.
4. Approve the mobile visual experience before merge, as required by AGENTS.md.

If anonymous access is unavailable, the captured photo remains local and a retry message is shown. The app does not jump to signup early or fabricate an AI result.

Anonymous sessions hold AI usage/profile preferences only. Photos/catches remain local until permanent signup; sign-in to an existing account imports under that authenticated account, preserving its existing profile preferences. Anonymous-session cleanup is an operational requirement.

## 2026-09-24 owner revision
The guided path is Home → actual camera/photo AI → durable local Catch + landing animation → real Collection cover flow swipe and gallery view → own word detail → two local photo-review questions → congratulations → signup/signin. Account transfer is allowed only after review completion. Registration is not required to operate the camera or view the tutorial. Generated sample photos are preloaded and shown on welcome, Home, Collection and review; they never stand in for AI candidates from the learner's actual camera photo.

The pre-signup AI endpoint uses server-side `SUPABASE_SERVICE_ROLE_KEY` only to reserve atomic budget slots in the existing `app_config` table (12 requests per originating address/day and 200 globally/day). No personal photo or word enters that table. Calls fail closed if reservation or provider fails. Confirm runtime environment and a real device capture in the PR Deploy Preview and the eventual Lovable deployment.
