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
- review evaluation.
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

**Scheduler (owner decision 2026-10-02, "単語のアルゴリズムを正確に改善したい"):** the next interval and the displayed probability come from an FSRS-style DSR model (`src/lib/srs.ts`, formulas and FSRS-6 default weights from the MIT `ts-fsrs` package; see `docs/memory-algorithm-options.md` › decided). No DB migration: `reviews.interval_days` (integer) holds the stability S in whole days (interval at the 90% target equals S; 0 = never reviewed), `ease` 1.3–3.0 is a linear image of difficulty D 10–1 (`easeToDifficulty`/`difficultyToEase`), `repetitions` stays the consecutive-success count, `last_reviewed_at` is the memory anchor. Score 1–5 maps to Again (<3) / Hard (3, 4) / Good (5); Easy is unused because a four-choice recognition quiz gives no evidence for it. Displayed retention is FSRS's power forgetting curve (`forgettingCurve`); a word that has never been reviewed shows **0%** and the lowest level (badge, list, curves, overall average, admin counts). After a lapse the post-lapse stability (≤ S) sets the next date, so a mature word returns in a few days, a young one tomorrow; `review_history.interval_days_after` therefore also records S.

**Owner decision (2026-10-01, back to shadow):** the app's scheduler (FSRS since 2026-10-02; SM-2 before) sets the next review interval. After grading, `gradeReview` asks Jev in the background and only logs its interval (`model_shadow_predictions`, `meta.mode = "shadow"`); grading never waits for Jev. The switch is `app_config.jev_interval = {"mode":"live"}` (read by `jevIntervalMode`, unknown/unreadable = shadow). Going live again requires the calibration evaluation below. When live, the 2026-09-23 guardrails apply (read "SM-2" as "the app's scheduler"):

**Owner override (2026-09-23, "jevにすぐに切り替えて", superseded 2026-10-01 by the shadow default above):** Jev sets the next review interval in `gradeReview`, without a prior shadow-calibration period. Guardrails that must stay:

- A failed/hinted review (score < `LAPSE_SCORE`) always stays on the scheduler's post-lapse interval; Jev is not asked.
- If Jev is unavailable, times out (2.5 s) or returns an invalid shape, the scheduler's interval is used.
- Jev's days are clamped to 0.5×–2× the scheduler's interval (1–365 days) by `pickInterval` (`src/lib/jev-tasks.ts`). Widen only after calibration data supports it. When live, Jev's days are written to `interval_days`, i.e. they replace that word's stability.
- Every Jev interval decision (Jev days, scheduler days, used days) and every pre-answer recall prediction are logged to `model_shadow_predictions` so calibration can still be evaluated; nothing reads that table to change behavior.
- ease and repetitions remain scheduler state (difficulty image and consecutive successes).

**Jev usage map (owner request 2026-09-23, "速さと正確性を両立させて"):** Jev is a fast, text-only judge. Use it to _check, rank and decide_, never to _write_ learner-facing content (LLMs write; Jev verifies). Every Jev call must have a timeout and a non-Jev fallback, and must not add latency to the first thing the user sees.

- Live: scan candidate ranking + Taiwan-standard-term check in the same single call, made after the dots are shown (doubtful items are demoted and marked low-confidence, never deleted); second opinion before writing a reported correction to a shared word; category only when generation fell back to "other".
- Shadow (logged only, until calibrated): review interval (switchable, see above), recall prediction, example-sentence naturalness. Next candidate for going live: repair examples Jev rates clearly unnatural (<0.2) in a background job after the word is saved, applied only with the correction judge's approval.

**Displayed number (owner decision 2026-09-23, "単語の数値は1つに統一したい"):** every surface (photo badge, review list, forgetting-curve y-axis and colors, modal chip) shows one number: the estimated probability of recalling the word now (`memoryOf` → `memoryPercent(retention)`), matching PRODUCT.md. How long a word lasts is expressed as the next review date, never as a second percentage.

**No to-do counts (owner decision 2026-10-02, "今日覚えるべき単語などの数字を出すと…やる気がなくなるから出さない"):** the review header shows no "0 / 10" counter and the batch-end hint no "あと N 語"; progress is the bar only. Per-word percentages and the overall % stay. The overall graph (`MiniRetentionGraph`) draws one-colour lines over background bands of the six memory levels (`.mem-band` tokens, light/dark), with the y-axis zoomed to the data.

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

## Review grading safety (2026-10-01)

- `gradeReview` is idempotent: a review whose `due_at` is already in the future (more than 1 minute ahead) was already graded, so it returns the current state with `duplicate: true` (`isAlreadyGraded`). The update is a compare-and-set on the `due_at` that was read, so two simultaneous submissions advance the review once.
- A failed `review_history` insert is retried once and then logged; the response says `history_saved: false`.

## DB migrations: one place to read

Every database change must be readable from `supabase/migrations/`. Lovable also writes `drizzle/migrations/`; anything added there must be mirrored into a `supabase/migrations/` file that names the drizzle file (`src/lib/migrations-mirror.test.ts` enforces it). Production policy changes are applied only with owner approval.

Shared `words` rows are written only by the server (service role). Browser `UPDATE`/`DELETE` were revoked on 2026-10-01 (`20261001100000_words_server_only_update.sql`, applied). Browser `INSERT` is closed by `docs/pending-migrations/20261001100200_words_server_only_insert.sql`, **to be applied only after the version where `upsertWord` inserts with the service role is published** (kept out of `supabase/migrations/` so it cannot run early; move it there once applied).

## Failures must be visible

A background failure that the UI deliberately survives (TTS falling back to the device voice, optional photo uploads, review grading) still reports through `reportBackgroundFailure` (`src/lib/background-failure.ts`) or `reportSaveFailure`, which count in the admin per-user screen and Lovable error reporting. Do not add new silent `catch {}` / `.catch(() => {})` on user data paths.

## Day boundaries

User-facing "today" counts use Taiwan time (`Asia/Taipei`; `startOfAppDay` for plan limits). AI abuse caps (`assertWithinDailyCap`) are a rolling 24 hours on purpose, and their message says so.

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

## Home album layout: one function (2026-09-30)

`src/lib/album-day-layout.ts` decides where every photo of a day sits (`settleDayAlbum` → `frameRatio` + `settledById`; `layoutDayAlbum` for the whole day). Both the home `DayCollage` (DOM) and the 3D diary book's left page (`shelf3d/textures.ts` → `paintPlacedPhotos`, painted in the book's own paper style) use it, and `albumHeroUrl` picks the picture. Do not add a second layout path — the one exception is `album-page-fit.ts`, which re-flows the book page only when the home layout would shrink into a thin column or leave most of the page empty (owner request 2026-10-02); otherwise the book reproduces the home placement. Do not overlay DOM on the book (`HomeShelf` renders no album UI; it only repaints textures via `refreshDays`). `CaptionEditDialog` is the note editor used by word detail and the home album.

Dead-code policy used in R26: delete only files with zero references (code, tests, harness, docs) — done: WordTreeView, AuthProviderButtons, ImagePicker, ai-gateway.server, first-catch-sample, words.functions, catch-landing v1–v4. Kept on purpose: shadcn `ui/*` primitives, `DayJournalPage`, `use-voice-input`, `admob`, `quests.functions`, `catch-landing/v5_physics` (tests gate a future re-connection), `src/server.ts` (SSR entry; knip false positive). Unused npm dependencies are listed for the owner, not removed (lockfile/Lovable sync). The "kept on purpose" list was superseded by the 2026-10-01 cleanup below.

## Large cleanup (2026-10-01, owner-approved)

The owner chose, item by item, what to delete. Deleted as code (DB tables, columns and saved rows are **kept**):

- Hidden features: social (`/feed`, `/discover`, `/notifications`, `/post/*`, `/u/*`), the old `/journal` page and the `/wordbooks` screens. `product-guardrails.test.ts` keeps those routes deleted.
- Old variants: scan-analyzing effects v1–v12 (`ScanEffect` always renders `v13depth`, which falls back to `v0cutout`), `catch-landing/v5_physics`, `catch-choreography`, `InputCatchSheet` / `WordCandidateRow` / `use-voice-input`.
- Harness-only parts (HoloSticker, PageCurlBook, StoryInk, 3D gallery, ModelPicker, …), 40 unused shadcn `ui/*` primitives and their 32 npm packages.
- Look packs (`pack-styles.css`, `ui-pack.ts`, `PackGallery`), the paused background cutout (`cutout*.ts`, `@imgly/background-removal`, the cutout buttons/settings, `cutoutAllowance`), `quests.functions.ts`, `admob.ts`.
- About 180 CSS selectors and 18 keyframes that nothing referenced (checked against code, including template-built class names).

Kept on purpose:

- Every `/api/native-*` endpoint and the server functions behind it — including `journal.functions.ts` (`listJournal`, `correctMyJournal`, `getJournalPrompts`, `saveMyDiary`, `listMyDiaryMonth`), `wordbook.functions.ts` (`extractWordbook` and the rest) and `attachStickerCutout`. Before deleting a server function, check `src/lib/native-fn.ts`.
- Display of already-saved cutout images (`cutout_image_url`, the `"cutout"` hero role and photo preference) and admin stats for past `removebg` usage.
- The DexShelf bookshelf view (hidden behind `DEX_SHELF_ENABLED`).

Small merges: image resize/thumb helpers now live in `image-resize.ts`; the optional IndexedDB opener shared by the photo and audio caches is `idb-store.ts`; the Taipei calendar day is `taipei-day.ts`. Similar-looking helpers that differ on purpose were left alone (photo downscalers differ in EXIF stripping / orientation handling; the CJK script regexes differ in which marks they accept).
