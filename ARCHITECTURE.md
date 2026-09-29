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

Provider routing (2026-09-23): the developer picks a provider/voice/model per target language in Settings → developer section (`app_config.key='tts_voice'`, keys stay in env: `AZURE_SPEECH_KEY`+`AZURE_SPEECH_REGION`, `ELEVENLABS_API_KEY`, `MINIMAX_API_KEY`). Providers are called directly, not via OpenRouter (latency). VoAI and ATEN are listed but not connected until their official API specs are available.
The voice tag (`voiceTag`) is part of every audio cache key (Storage path and on-device IndexedDB key), so switching voices never replays the old voice; no choice = legacy tag `alloy`. On provider failure the request falls back to the legacy voice and caches it under the legacy path only.

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

**Jev usage map (owner request 2026-09-23, "速さと正確性を両立させて"):** Jev is a fast, text-only judge. Use it to _check, rank and decide_, never to _write_ learner-facing content (LLMs write; Jev verifies). Every Jev call must have a timeout and a non-Jev fallback, and must not add latency to the first thing the user sees.

- Live: review interval (guardrails above); scan candidate ranking + Taiwan-standard-term check in the same single call, made after the dots are shown (doubtful items are demoted and marked low-confidence, never deleted); second opinion before writing a reported correction to a shared word; category only when generation fell back to "other".
- Shadow (logged only, until calibrated): recall prediction, speaking judgement, example-sentence naturalness. Next candidate for going live: repair examples Jev rates clearly unnatural (<0.2) in a background job after the word is saved, applied only with the correction judge's approval.

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

Photo-save failures are never silent (2026-09-30): capture, re-encounter and the guest first-catch transfer call `reportSaveFailure` (`src/lib/save-failure.ts`), which sends the error to Lovable error capture and a whitelisted `save_failed_*` row to the existing `usage_events` table; the developer-only user page counts them. A guest catch that was peeled (`hasAddedCatch`) is transferred on the next sign-in even if the tour was not finished.

Fonts: display text keeps `font-display: block`; the diary input field uses generated swap aliases (`"<Family> Input"`, `public/fonts/diary/input/`, `scripts/make-diary-input-fonts.mjs`) so IME input never blanks. Traditional Chinese handwriting uses self-hosted Iansui (OFL, `scripts/fetch-tc-hand-font.mjs`). Pages opt out of machine translation (`notranslate`) and set `<html lang>` before first paint from the stored UI language.

## Scaling

Do not load an entire growing personal collection when a screen only needs a subset.
Use date-scoped home queries, pagination/infinite scrolling, thumbnails, map clustering and indexes as appropriate.
Track AI/TTS cost per operation and aggregate per active user without exposing unnecessary personal content.

## AI-assisted fixes

AI may diagnose and prepare fixes automatically.
Production mutation must be gated by reproducible tests and risk classification.
Never auto-promote changes to authentication, authorization/RLS, billing, DB migrations, memory scheduling or other high-risk domains without human approval.

## First-catch tutorial: one rendering source (2026-09-27)

The tutorial is a controller over production presentation components, not a second UI.

- `AppShellFrame` and `AppNavigation` own the frame, spacing, tab order, icons and labels for both entry paths.
- The boundary is the **whole screen**, not its parts (2026-09-29). Home renders production `HomeSurface` (bookshelf, today's page, past days, one wall) — the route and the tour differ only in data and handlers. Collection uses `DexSurface` (including search, filters, view dispatch, category grouping and landing styles) and opens the just-caught landing with the shared `JUST_CAUGHT_VIEW`.
- Camera, analysis, candidates and the pre-save card use `CaptureObjectPanel`, `CaptureAnalyzingPanel`, `PickWordPanel` and `CaptureCardPanel`.
- Detail uses `StickerSheet`, including its real photo header, sections and `WordCard`. Its `local` data source disables authenticated queries and mutations for an unsaved catch; it does not select a different detail layout.
- Review uses `ReviewSessionHeader` and `ReviewQuestion`, including the real choice feedback and memory modal. Local exercises do not create scheduled-review records. The guide constrains the exercise to four choices; mode selection is inert during this exercise.
- First-run pages that have no app counterpart (introduction, questions, ready, sign-in) take colour only from the app tokens (`--primary`, `--foreground`, `--card`, `--border`, `--muted-foreground`, …) and never redefine them; photos there use the Home album print (`AlbumPrint`). Changing the app palette or the album print therefore changes these pages too.
- `Spotlight` only measures existing DOM anchors and overlays guidance. It must not render copies of the highlighted controls or resize/redecorate app components.
- First-run data, local persistence, guest AI transport, allowed interactions and progression are adapters. Sample photos are data, never substitutes for analyzing a learner's photo.

Changes to shared presentation components therefore affect the app and tutorial in the same build. New features still need intentional tutorial copy/step decisions; this mechanism does not generate explanations automatically. Keep semantic `data-tour` anchors with the production controls when moving them.

`onboarding-shared-surfaces.test.ts` guards the rendering boundary and rejects tutorial-specific replacements/size overrides. Visual review must exercise the same production components with deterministic local data, and live capture/AI must also be tested on a backend-enabled deployment before release.
