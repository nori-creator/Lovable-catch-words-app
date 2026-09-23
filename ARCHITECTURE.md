# CatchWords — Architecture Guardrails

Status: Web MVP v3

## Principles
- Preserve working behavior before refactoring.
- Refactor incrementally by domain; avoid an untested big-bang rewrite.
- Separate UI, domain logic and external providers.
- AI/TTS providers must be replaceable behind stable interfaces.
- Prefer deterministic/licensed data for facts that should not vary; use AI where generative judgment is appropriate.
- Cache reusable safe outputs to reduce latency/cost.
- Treat personal photos, precise locations, audio and private text as sensitive product data; minimize access and retention.

## Target domains
- onboarding/auth
- catch/capture
- word intelligence
- collection/map
- memory/review
- settings/preferences
- AI providers
- TTS/audio
- analytics/monitoring
- billing (later)

## Preferences
Create one authoritative preferences abstraction.
UI changes should autosave and expose lightweight saved/error state. Avoid parallel unsynchronized server/local/React-state sources.

## AI pipeline
Use task-oriented interfaces rather than model names throughout UI/business logic.
Suggested stages:
- vision/candidate ranking;
- fast meaning;
- warm lightweight word intelligence;
- rich selected-word intelligence;
- linguistic validation/correction;
- review/speaking evaluation.
Provider/model choice may change without rewriting product flows.

## TTS
Speech service interface should support provider routing and fallback.
Cache key must be pronunciation-safe and versioned.
Do not share user-specific/private speech output as a global cache. Canonical headword pronunciation may be shared when appropriate.

## Memory
Separate:
1. scheduling state;
2. evidence/events;
3. displayed probability;
4. experimental model predictions.
Store enough event data to re-evaluate algorithms later without rewriting history.
Experimental models should initially run shadow predictions, not control production schedules.

**Owner override (2026-09-23, "jevにすぐに切り替えて"):** Jev now sets the next review interval in `gradeReview`, without a prior shadow-calibration period. Guardrails that must stay:
- A failed/hinted review (score < `LAPSE_SCORE`) always stays on SM-2 (tomorrow); Jev is not asked.
- If Jev is unavailable, times out (2.5 s) or returns an invalid shape, SM-2 is used.
- Jev's days are clamped to 0.5×–2× the SM-2 interval (1–365 days) by `pickInterval` (`src/lib/jev-tasks.ts`). Widen only after calibration data supports it.
- Every Jev interval decision (Jev days, SM-2 days, used days) and every pre-answer recall prediction are logged to `model_shadow_predictions` so calibration can still be evaluated; nothing reads that table to change behavior.
- ease and repetitions remain SM-2 state.

**Displayed number (owner decision 2026-09-23, "単語の数値は1つに統一したい"):** every surface (photo badge, review list, forgetting-curve y-axis and colors, modal chip) shows one number: the estimated probability of recalling the word now (`memoryOf` → `memoryPercent(retention)`), matching PRODUCT.md. How long a word lasts is expressed as the next review date, never as a second percentage. The stability-weighted `maturityLevel` is internal and only chooses the review question format.

## Data licensing
Maintain provenance for external lexical/corpus data.
No assumption that AI transformation removes upstream license restrictions.
Before a source enters a commercial production pipeline, record its license/permission and required attribution/conditions.

## Reliability
Critical flows need automated tests:
onboarding/guest → first Catch → signup persistence;
capture → candidates → audio → save;
collection retrieval;
review grade/update;
settings persistence;
language switching.
Use CI gates before merge.

## Scaling
Do not load an entire growing personal collection when a screen only needs a subset.
Use date-scoped home queries, pagination/infinite scrolling, thumbnails, map clustering and indexes as appropriate.
Track AI/TTS cost per operation and aggregate per active user without exposing unnecessary personal content.

## AI-assisted fixes
AI may diagnose and prepare fixes automatically.
Production mutation must be gated by reproducible tests and risk classification.
Never auto-promote changes to authentication, authorization/RLS, billing, DB migrations, memory scheduling or other high-risk domains without human approval.
