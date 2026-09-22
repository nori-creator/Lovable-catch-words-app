# Web MVP implementation evidence

Updated: 2026-09-22. This is an evidence log, not a replacement roadmap.
Authoritative specifications: PRODUCT.md, ROADMAP.md, ARCHITECTURE.md, QA.md.

## Preserved baseline

Latest main inspected: `7333eec1161f5f3a14ac3304a71e770c27d8eb5f` (PR #96 merged after #100).
Working branch: `feat/roadmap-settings-autosave`, based directly on that main.
The earlier autosave work was checkpointed before integration; published history was not rewritten.
Open PRs inspected: #87 (camera alternative), #1 (legacy diary/quest). Neither is a release prerequisite or silently merged.

## Phase 0 inventory

| Area | Current implementation | Classification / remaining evidence |
| --- | --- | --- |
| Auth/onboarding | `/auth`, authenticated route guard, `/onboarding`; `/` redirects to `/home` | Active; pre-signup real Catch and guest-to-account persistence are still missing (phase 2) |
| Catch | `/capture`, `/scan`, InputCatchSheet, ScanCatchSheet, PeelSticker, CatchLanding | Active; preserve original-photo peel and all-category landing. Real camera/audio/AI/save still need device and backend QA |
| Collection | `/dex`, `/dex/$stickerId`, `/map`, stickers.functions.ts | Active; audit collection query bounds before release |
| Home | `/home`, today's catches and earlier day groups | Active; PR #96 incorporated |
| Review | `/review`, reviews.functions.ts, memory.ts, srs.ts | Memory overview active; practice modes intentionally hidden by REVIEW_PRACTICE_ENABLED=false. Tiny review is future phase 7 work |
| Settings | `/settings`, settings-restore.ts, language-sync.ts, device preference modules | Active; this branch replaces manual profile save with serial autosave and retry |
| Cutout / wordbooks | CUTOUT_ENABLED=false; WORDBOOKS_ENABLED=false | Intentionally hidden; code and assets retained |
| Journal/social/admin | journal/feed/discover/notifications/user/post/admin routes | Existing/uncertain reachability; retained, not promoted into MVP core |
| AI | ai.functions.ts, ai-provider.server.ts, ai-gateway.server.ts, scan.functions.ts | Active provider boundaries; candidate benchmark and measured percentiles still required |
| TTS | tts.functions.ts, tts-voice.ts, tts-store.ts, tts-cache.ts, use-pronounce.tsx | Existing generation/cache/fallback; provider quality evaluation and pronunciation-safe cache review pending |
| Supabase | auth middleware, profile/sticker/review functions, integrations/supabase, migrations | Existing auth/database/storage dependencies; no production schema/RLS changes in this branch |
| Historical design docs | docs/design | Historical, not current instructions; retained with explicit precedence warning |

No uncertain implementation was deleted. A disabled feature is not evidence of dead code.

## Phase 1 changes

- One serial/debounced profile settings writer; later edits cannot be overwritten by an older completion.
- Account-scoped draft retained on failure; visible retry instead of a false saved state.
- Existing language/level restoration kept; profile refetch no longer overwrites edits in the open form.
- Profile settings no longer mix immediate local changes with an end-of-page Save requirement.
- Device-only preferences remain in existing modules; full preference abstraction consolidation is still pending.
- UI harness opens the changed settings interaction by default and uses the production autosave hook/status component with an isolated fake persistence adapter.
- Auth root error boundary accepts the router's unknown error type.

## Release gates still open

This branch is NOT a claim that all phases of #100 are complete or that production is launch-ready.

1. Real-device visual approval of UI changes before merge (AGENTS.md / QA.md).
2. Actual authenticated settings save/reopen/offline behavior against the CatchWords backend.
3. Guest onboarding/registration preservation, reliable tiny review, precise memory semantics.
4. Candidate/TTS quality datasets and human language evaluation; p50/p90/p99 measurements.
5. Bounded queries and live auth/RLS/privacy audit in the correct Supabase project.
6. Actual iPhone/Android capture, zoom, speech, gesture and photo-save tests. A desktop fixture cannot certify hardware behavior.
7. Free beta evidence before monetization/native phases.

Resume at phase 1 after reviewing this branch; do not restart or treat later phases as already complete.
