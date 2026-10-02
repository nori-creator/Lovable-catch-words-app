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

Useful additional scenes: `?scene=first-catch&step=home&tour=1` (chapter selector + replay button to watch the beat timing), `?scene=first-catch&step=pick` (sample candidates for the sample cafe photo), `?scene=first-catch&step=card`, `?scene=first-catch&step=added`, `?scene=first-catch&step=explore`, `?scene=first-catch&step=account`, and `?scene=first-catch&step=card&fail=storage`. Sample screens are explicitly labelled; camera capture still uses the real camera component.

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

## 2026-09-30 pre-signup AI: caps, fallback and error codes

- A tutorial needs at least three AI calls (candidates, card, personal lesson), plus retakes and retries, so the caps are 30 calls per address per day and 1000 globally per day (`GUEST_IP_LIMIT_PER_DAY`, `GUEST_GLOBAL_LIMIT_PER_DAY`). The earlier 12 / 200 were exhausted by a handful of trials and every later visitor failed with a generic message.
- The caller address is read from `cf-connecting-ip`, `x-nf-client-connection-ip`, `x-real-ip` or `x-forwarded-for`. When none exists the per-address cap is skipped (only the global cap applies); it is never shared under a single `unknown` key.
- The same-origin check also accepts the forwarded host, for hosts that proxy the request to a different internal URL.
- If the guest endpoint refuses at the gate (`FIRST_CATCH_LIMIT`, `FIRST_CATCH_ORIGIN`, `FIRST_CATCH_AI_UNAVAILABLE`), the client falls back to a per-device anonymous account and the authenticated endpoint (24 calls per account per day). If anonymous sign-in is disabled, `FIRST_CATCH_GUEST_UNAVAILABLE` is shown. Genuine AI failures are not retried on the other path.
- Generic failures now show the error code after the message, and the server logs why the gate refused (no photo, word or address), so the cause can be reported and traced.

## 2026-10-02 camera primer and "works everywhere" camera paths

- A website cannot restyle or suppress the browser's own camera permission dialog (Safari, Chrome, Brave, Samsung Internet). The tutorial therefore shows an in-app primer **before** calling `getUserMedia`: why the camera is needed, that the photo is only used to find words and is saved only on this device until signup, and that the next browser prompt should be answered "Allow". The browser prompt appears only after the learner taps "Use camera".
- The decision is pure and tested (`cameraStart` in `src/lib/camera-access.ts`): already granted → live camera without primer; not yet granted → primer; denied → help; no `getUserMedia` / insecure context → in-app-browser or unsupported help. Only the tutorial uses the primer; the logged-in capture page still requests the camera immediately.
- Every primer/help screen also offers the phone's own camera app (`<input type="file" accept="image/*" capture="environment">`, no site permission needed) and "Choose a photo". Those files go through the same `firstCatchPhoto` resize and analysis as a live capture. The shutter itself never falls back to the OS camera.
- Denied help shows platform steps (iPhone Safari: aA → Website Settings → Camera; iPhone Chrome: Settings → Chrome; Android Chrome/Brave/Samsung Internet: address-bar icon → Permissions → Camera, then the browser app's Android permission). The LINE/in-app auto-reopen in the external browser is unchanged.
- The tutorial spotlight on the shutter appears only once the live camera is actually showing, so it never overlaps the primer, the help screen or the browser's own prompt.
- Production variant: `CAMERA_PRIMER_VARIANT` (`sheet`). Harness: `?scene=first-catch&step=camera&cam=prompt` with an A/B/C selector (`&primer=a|b|c`); states `cam=denied` (iPhone), `cam=android`, `cam=brave`, `cam=line`, `cam=android-app`, `cam=prompt-desktop`.

## 2026-10-02 tutorial polish (owner: precise frame, clear beats, value-first copy)

Guide sequence (every coach shows its chapter):

1. Home — today's album (Next) → camera tab (tap).
2. Catch — shutter → candidate list (the search box below stays usable) → meaning & speaker (Next) → peel the photo.
3. Collection — "added" cell (Next) → swipe the cover flow → tap the gallery-view button → tap your own photo (opens the detail).
4. Word detail (Try a review).
5. Review — intro on the question card (Next) → choices → the answer's Next button, twice → completion → account.

Coach copy: title = what to do, one sentence = why it helps. The review coach quotes the real button label (`review.next`), so it matches the screen in every language. Frame geometry and beat timing are in QA.md › Shared tutorial release checks.
