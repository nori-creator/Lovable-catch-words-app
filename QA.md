# CatchWords — Critical Behavior & QA Contract

This file protects existing product behavior during refactors.

## Golden rule
A cleanup/refactor is not successful merely because the code is smaller. It is successful only when intended current behavior still works and the architecture is easier to change safely.

## Critical user journeys
1. App can start and route correctly.
2. Existing authenticated user can sign in and reach the app.
3. Camera/capture flow works on supported mobile browsers.
4. Image analysis returns useful candidate words.
5. User can select a candidate or use the existing fallback search when the desired word is absent.
6. Meaning/pronunciation path works.
7. Catch/save creates the expected Collection/Dex item.
8. Existing Catch/landing/sticker experience is preserved until explicitly redesigned and approved.
9. Home shows the appropriate recent/today content.
10. Collection/Dex entry opens and its word data renders.
11. Review can present a question, accept an answer and persist review state.
12. First-attempt failure must not be erased by a later retry.
13. Settings persist reliably and language changes do not unexpectedly revert.
14. Japanese, English and Traditional Chinese UI paths must not regress as multilingual support is completed.
15. Hidden/future features behind flags must not be deleted merely because they are currently off.

## Before deleting legacy code
Prove at least one:
- unreachable and unreferenced;
- superseded by a tested implementation;
- explicitly deprecated by current product docs;
- duplicate whose callers have been safely migrated.
If uncertain, isolate/mark it rather than delete it.

## UI change policy
For user-visible design, interaction or animation changes:
- use a feature branch/PR;
- provide a preview when infrastructure supports it;
- user performs real-device comparison;
- merge after approval.

## Performance checks
For Catch path track p50/p90/p99 where possible:
- capture → candidate response;
- candidate selection → usable meaning;
- request → first audio playback;
- Catch → persisted item.

## AI quality benchmark
Maintain a fixed representative test set for Taiwan Mandarin and English candidate generation.
Track Top-1 and Top-3 usefulness/accuracy, latency and cost across model changes.
TTS changes require language-specific pronunciation/naturalness evaluation rather than provider-name assumptions.

## Linguistic correctness
Do not label AI estimates as official exam/corpus facts.
User-reported canonical corrections require validation before global propagation.

## Review UX
Never require a user to clear an intimidating accumulated backlog to receive a successful daily completion state.
The minimum review experience should be intentionally small.

## Release blockers
- critical Catch/save failure;
- authentication/data-loss regression;
- settings repeatedly reverting;
- incorrect global data mutation;
- broken language path;
- major privacy/RLS issue;
- displayed memory probability with misleading/undefined semantics;
- unbounded collection queries likely to fail at realistic scale.
