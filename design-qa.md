# First-run design QA — PR #114

## Review target

[Deploy Preview](https://deploy-preview-114--catchwords.netlify.app/) opens the first-run flow. The top review strip links directly to questions, Home, Dex, review, and the full-screen account page; it is present only in the harness, not in the app. The user-supplied September 2026 welcome, question, notification, ready and tutorial screenshots guided the typography, spacing and photo direction. The blue mascot, streaks and unsupported Spanish option were excluded.

## Findings and changes

- The former `/onboarding` scan instruction was still reached when a direct signup produced a profile with `onboarded=false`. The authenticated layout now routes that profile to `/welcome`, while an already completed first Catch transfers before Home. The legacy URL redirects and no longer renders its old card.
- A signup with email confirmation pending now enters the questions without waiting for the email link. A signed-in direct signup completes the same tutorial and transfers its photographed word without a second signup. Authenticated tutorial AI requests use the per-account metered route; signed-out requests use the capped guest route.
- Welcome uses four generated photographs also present in the sample Home album, with varied sizes, angles and staggered entry. The account screen uses the same assets in a full-screen layout.
- Questions retain their flags and animated selection. The real Home, capture panel, Dex cover/gallery/map/list components, word card and four-choice review are reused. A short unobscured preview precedes each spotlight. The transformed shell had displaced the real fixed tab bar; its entrance motion is now applied to the main content instead.
- The album sample is populated before capture, and the first photo is added to the local Dex before review and account creation. Preview fixtures are visual examples; they do not replace AI analysis of a live photograph.
- Clicking the actual Dex gallery control exposed a shifted spotlight: a parent transform changed the coordinate system for its fixed overlay. The entrance motion now changes opacity only, preserving the viewport coordinates of the real tab bar, Dex map and spotlight.

## Verification

- TypeScript, production build, harness build, i18n check and all 2,213 unit tests passed locally.
- The published preview was inspected for welcome collage, flagged questions, Home album, full-screen account layout and actual Dex gallery switching. The final spotlight coordinate correction requires the next preview refresh.
- A real email/OAuth signup, camera permission and AI image analysis were not executed against a production account. They depend on the deployment's Supabase and AI configuration and must be exercised with a genuine new account before merge.

Do not merge PR #114 before the owner visually approves the Deploy Preview, per `AGENTS.md`.
