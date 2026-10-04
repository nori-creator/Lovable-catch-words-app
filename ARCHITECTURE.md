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

Saved/error state (2026-10-03): Settings shows a small inline "保存しました / Saved / 已儲存" pill for 2 s after a successful autosave (`src/lib/save-status.ts` + `src/components/SaveStatus.tsx`; height-0 sticky, no layout shift, `role="status"`). Server saves report saving → saved; a partial save (server dropped columns) stays silent and names the fields in a warning toast; a failure keeps the error toast. Device-local rows (theme, motion, catch animation, photo preference, selfie step, sound, haptics) report saved immediately.

### Device-local preferences that affect learning (not synced across devices)

These live only in `localStorage`, so a learner who switches phone/browser silently gets defaults. Not migrated yet (task 2026-10-03 only lists them); move to `profiles` when the single preferences abstraction lands.

| Key | Module | Learning effect |
|---|---|---|
| `reading-pref-v1` (legacy `phonetic-pref-v1`) | `phonetic.tsx` | Zhuyin vs pinyin (or kana/romaji) shown everywhere — changes what the learner reads. |
| `level-pref-v1` | `level-pref.ts` | Local copy of current/goal level; the screen trusts it over the server when the column is missing. Mirrored to `profiles`, but the device copy wins on read. |
| `target-lang-v1`, `ui-lang-v1`, `lang-prefs-owner-v1` | `target-lang-pref.ts`, `i18n.tsx`, `use-language-prefs.ts` | Mirrored to `profiles` (reconciled on profile load); listed because the capture path reads the device copy before the profile arrives. |
| `wordcard-prefs-v6` | `card-prefs.ts` | Which word-detail sections are shown/hidden and their order (what the learner studies on each card). |
| `review-reminder-prefs-v1` | `review-reminder.ts` | Review reminder time/on-off (local notifications are per device by nature). |
| `place-reminder-enabled` | `place-reminder.ts` | Place-based review prompts. |
| `catch-animation-v1` | `catch-animation-pref.ts` | Full / short / off Catch celebration (pronunciation always plays). |
| `photo-pref-v1`, `cw-selfie-capture` | `photo-pref.ts`, `product-features.ts` | Which photo is the memory cue; whether the selfie step follows a Catch. |
| `home-resurface-v1` | `resurface.ts` | Which past word was resurfaced today / dismissed (another device may show a different one the same day). |
| `motion`, `cw-sound-level`, `cw-haptics` | `motion-pref.ts`, `sound-engine.ts`, `haptics.ts` | Presentation only, but they decide whether celebration audio and pronunciation-adjacent cues are heard. |

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

First-catch (tutorial) AI calls (2026-10-03 audit: 20–50 s, repeated 45–50 s failures): the photo is sent at 1024 px / JPEG 0.7 (`firstCatchPhoto`). Each attempt has its own deadline (candidates 20 s; card/lesson 30 s) with `maxRetries: 0` (the SDK's silent retries used to eat the whole 45 s), then **one** fallback to a different already-configured provider/model (`getAiAttemptChain`: app_config runtime → env → a keyed provider's fast vision model `gemini-2.5-flash`), run by `runAiAttempts` (`ai-attempts.ts`). One request = one quota reservation; if no attempt returned a reply (timeouts / transport errors) the reservation is released (member `usage_events` row deleted with the service key; guest budget keys deleted). Every request is logged: members in `ai_runs` (`loop="first_catch_ai"`, meta = attempts, latency, outcome), guests in `app_config` keys `first-catch-run:<day>:ok|fail:<uuid>` (no photo/word/IP), and client failures via `reportBackgroundFailure("first_catch_ai")`.

Hedging (2026-10-03, Real app check run 37105477674: shutter → candidates 4.5–42 s across browsers/languages): `runAiAttempts` takes `hedgeAfterMs`. If the primary has not answered by then, the second entry of `getAiAttemptChain` starts **in parallel**; the first _valid_ reply wins (an unusable/failed reply on one side keeps waiting for the other) and the loser is aborted (`outcome: "cancelled"`). At most one extra call runs, only when the primary is slow; a fast primary failure still falls back at once; the request keeps its single quota reservation. Delays: tutorial photo 6 s, tutorial card/lesson 12 s, signed-in `suggestWords` 6 s (attempt deadlines 18 s / 13 s, so it ends before the screen's 20 s). `AI_HEDGE_AFTER_MS` overrides the photo delay; `0` turns hedging off. Worst case for the tutorial photo is now 6 + 20 = 26 s (was 20 + 20 = 40 s). Logged: tutorial `ai_runs`/guest rows carry `via` (the provider that answered), `hedged`, per-attempt `startMs`; signed-in capture writes `ai_runs` `loop="capture_suggest"` (ok, ms, ai_ms, via, hedged, attempts — no photo/word). The work before the AI call also runs in parallel now: provider-chain lookup alongside the quota reservation (guest: IP and global slots reserved together, prune deferred with `runAfterResponse`; member: chain lookup alongside `reserveAiCallFor`; `suggestWords`: chain, cap, level, explanation language in one `Promise.all`), the client reads the local session (`getSession`) instead of a network `getUser`, and the tutorial sends the AI a 768 px / JPEG 0.8 copy (same as the signed-in capture; the stored photo stays 1024 px).

**Owner-side fix for latency:** the production Gemini key is on Google AI Studio's **free tier**, which is rate limited (requests queue or fail with 429 under load — the 25–42 s outliers). Hedging to the second configured provider is only the code-side mitigation. Moving that key's project to the paid tier (Google AI Studio → billing) removes the free-tier rate limits; no code change is needed.

Display-language meanings (2026-10-03, same run: zh-TW UI × en target showed "flower 花。植物の生殖器官。" — a Japanese meaning — in WebKit, while Chromium correctly showed "latte 拿鐵…"): the AI's meaning was shown as-is and nothing checked its language; the JSON key is named `meaning_ja` and the model sometimes followed the key name. Now the prompt says the key names are legacy identifiers (values in the display language, "never in Japanese"), and every tutorial reply (candidates, card, lesson) and `suggestWords` candidate passes `first-catch-meaning.ts`: a meaning not in the display language is replaced from `dictionary_entries.meanings[display language]` (1.5 s cap) or left **empty** (the candidate shows no meaning line); translations/notes in another language are emptied; a lesson with no display-language sense is an unusable reply (fallback). The card receipt in `generated_cards` is written after this check.

## TTS

Speech service interface should support provider routing and fallback.
Cache key must be pronunciation-safe and versioned.
Do not share user-specific/private speech output as a global cache. Canonical headword pronunciation may be shared when appropriate.

Provider routing (2026-09-23): the developer picks a provider/voice/model per target language in Settings → developer section (`app_config.key='tts_voice'`, keys stay in env: `AZURE_SPEECH_KEY`+`AZURE_SPEECH_REGION`, `ELEVENLABS_API_KEY`; MiniMax was removed on 2026-10-03 by owner decision and must not be re-added without updating the privacy policy). Providers are called directly, not via OpenRouter (latency). VoAI and ATEN are listed but not connected until their official API specs are available.
The voice tag (`voiceTag`) is part of every audio cache key (Storage path and on-device IndexedDB key), so switching voices never replays the old voice; no choice = legacy tag `alloy`. On provider failure the request falls back to the legacy voice and caches it under the legacy path only.

## Memory

Separate:

1. scheduling state;
2. evidence/events;
3. displayed probability;
4. experimental model predictions.
   Store enough event data to re-evaluate algorithms later without rewriting history.
   Experimental models should initially run shadow predictions, not control production schedules.

**Scheduler (owner decision 2026-10-02, "単語のアルゴリズムを正確に改善したい"):** the next interval and the displayed probability come from an FSRS-style DSR model (`src/lib/srs.ts`, formulas and FSRS-6 default weights from the MIT `ts-fsrs` package; see `docs/memory-algorithm-options.md` › decided). No DB migration: `reviews.interval_days` (integer) holds the stability S in whole days (interval at the 90% target equals S; 0 = never reviewed), `ease` 1.3–3.0 is a linear image of difficulty D 10–1 (`easeToDifficulty`/`difficultyToEase`), `repetitions` stays the consecutive-success count, `last_reviewed_at` is the memory anchor. Score 1–5 maps to Again (<3) / Hard (3, 4) / Good (5); Easy is unused because a four-choice recognition quiz gives no evidence for it. Displayed retention is FSRS's power forgetting curve (`forgettingCurve`); a word that has never been reviewed shows **0%** and the lowest level (badge, list, curves, overall average, admin counts). After a lapse the post-lapse stability (≤ S) sets the next date, so a mature word returns in a few days, a young one tomorrow; `review_history.interval_days_after` therefore also records S. **Recognition evidence (2026-10-03 audit, "6 correct answers → next review in 3.7 years"):** FSRS's default weights come from free-recall flashcards, but every graded review here is a four-choice recognition quiz (25% guess rate; recognition is easier than recall). So for a correct answer with `evidence: "choice"` (the default of `nextSrs`; `gradeReview` passes it explicitly) the stability _gain_ is halved, `S' = S + (S_fsrs − S)·CHOICE_GAIN` with `CHOICE_GAIN = 0.5` — the same form FSRS uses for Hard (w15 ≈ 0.60), slightly weaker. Difficulty still moves by the rating, first-review stabilities and post-lapse shrinkage are unchanged. Stability/interval is capped at `MAX_INTERVAL_DAYS = 180` (Anki's "maximum interval" setting; FSRS default 100 years). On-time Good answers now go 2 → 6 → 17 → 42 → 96 → 180 days (previously 2 → 11 → 46 → 163 → 497 → 1346). `evidence: "recall"` (for a future speaking/typing grader) keeps FSRS's full gain but the same cap, because no column records which evidence produced a stored interval. Existing long values are **not rewritten**: `stabilityOf` clamps at read time (retention display, next computation), due selection uses `dueNowOrFilter` (`due_at ≤ now` or `last_reviewed_at ≤ now − 180 d`), the duplicate-grade guard and displayed next dates use `effectiveDueIso` (= min(`due_at`, `last_reviewed_at` + 180 d)), and the next grade writes a capped value.

**Owner decision (2026-10-01, back to shadow):** the app's scheduler (FSRS since 2026-10-02; SM-2 before) sets the next review interval. After grading, `gradeReview` asks Jev in the background and only logs its interval (`model_shadow_predictions`, `meta.mode = "shadow"`); grading never waits for Jev. The switch is `app_config.jev_interval = {"mode":"live"}` (read by `jevIntervalMode`, unknown/unreadable = shadow). Going live again requires the calibration evaluation below. When live, the 2026-09-23 guardrails apply (read "SM-2" as "the app's scheduler"):

**Owner override (2026-09-23, "jevにすぐに切り替えて", superseded 2026-10-01 by the shadow default above):** Jev sets the next review interval in `gradeReview`, without a prior shadow-calibration period. Guardrails that must stay:

- A failed/hinted review (score < `LAPSE_SCORE`) always stays on the scheduler's post-lapse interval; Jev is not asked.
- If Jev is unavailable, times out (2.5 s) or returns an invalid shape, the scheduler's interval is used.
- Jev's days are clamped to 0.5×–2× the scheduler's interval (1–365 days) by `pickInterval` (`src/lib/jev-tasks.ts`), and then to the scheduler's cap `MAX_INTERVAL_DAYS` (180) in `gradeReview`. Widen only after calibration data supports it. When live, Jev's days are written to `interval_days`, i.e. they replace that word's stability.
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

Initial JS (2026-10-03 audit): `routeTree.gen.ts` imports every route file statically, and TanStack's code splitting only moves a route's `component`; **anything else a route file exports stays in the client entry together with its imports**. The admin users screen exported its views (for the harness), which pulled `AdminCharts` → recharts into the entry (entry 269 → 168 KB gzip, root preloads 523 → 422 KB after moving them to `components/AdminUsersViews.tsx`). Route files should export only `Route`; shared views live in `src/components`. Charts stay behind `lazy()` / the split route component. The 3D confetti's three.js chunk is only loaded on demand (`load-confetti.ts`).

Initial JS, second pass (2026-10-03): every screen route (`home`, `dex`, `dex.$stickerId`, `capture`, `scan`, `review`, `settings`, `auth`, `reset-password`, `admin.dictionary`) exported its views, so all of them sat in the entry. Their contents now live in `src/components/screens/*Screen.tsx` (moved verbatim; `Route.useSearch()` → `getRouteApi(id).useSearch()`), and each route file exports only `Route` (guarded by `route-split.test.ts`). The tutorial (`/welcome`) renders its first pages from light modules and loads the stages that reuse the real screens (home, camera, dex, word detail, review, tutorial settings) through `first-catch-lazy.tsx`, prefetched in the background ~2.5 s after the first page; `FirstCatchTransfer` is lazy in the signed-in layout; zod gets its own chunk and the welcome head no longer imports it (`learning-preference-options.ts`). Root + layout + route preloads (gzip -9, measured on main after #155 with ads/legal/billing): `/welcome` 456 → 275 KB, `/home` 457 → 271 KB, `/dex` 456 → 273 KB, `/auth` 435 → 272 KB; root preloads alone 430 → 236 KB in 43 → 12 files (the entry chunk itself is 171 → 214 KB because the small shared chunks are now bundled with it).

Sticker list paging (2026-10-03 audit, "loads up to 3,000 items at once"): `listMyStickers` with no input keeps the old all-at-once behaviour (iOS app, MCP). The web screens pass `{ offset, limit }` through `stickerListQueryFn` (`lib/sticker-pages.ts`): the first 120 items render, the rest load in pages of 500 into the same `["stickers"]` cache (`loadingMore` while it runs), the 3,000 total cap and the `truncated` notice are unchanged; one request asks for at most `POSTGREST_PAGE` (1,000, `lib/pagination.ts`). While pages arrive, older items from the previous list stay visible (no shrink on refetch) and items optimistically added after the load started are kept; at the end the list is exactly the server's.
Track AI/TTS cost per operation and aggregate per active user without exposing unnecessary personal content.

## Review grading safety (2026-10-01)

- `gradeReview` is idempotent: a review whose `due_at` is already in the future (more than 1 minute ahead) was already graded, so it returns the current state with `duplicate: true` (`isAlreadyGraded`). The update is a compare-and-set on the `due_at` that was read, so two simultaneous submissions advance the review once.
- A failed `review_history` insert is retried once and then logged; the response says `history_saved: false`.

## DB migrations: one place to read

Every database change must be readable from `supabase/migrations/`. Lovable also writes `drizzle/migrations/`; anything added there must be mirrored into a `supabase/migrations/` file that names the drizzle file (`src/lib/migrations-mirror.test.ts` enforces it). Production policy changes are applied only with owner approval.

Shared `words` rows are written only by the server (service role). Browser `UPDATE`/`DELETE` were revoked on 2026-10-01 (`20261001100000_words_server_only_update.sql`, applied). Browser `INSERT` was revoked on 2026-10-02 after the version where `upsertWord` inserts with the service role was published (`20261001100200_words_server_only_insert.sql`, applied). Browsers can only `SELECT` shared words.

## Failures must be visible

A background failure that the UI deliberately survives (TTS falling back to the device voice, optional photo uploads, review grading) still reports through `reportBackgroundFailure` (`src/lib/background-failure.ts`) or `reportSaveFailure`, which count in the admin per-user screen and Lovable error reporting. Do not add new silent `catch {}` / `.catch(() => {})` on user data paths.

## Reader-language meanings and explanations (2026-10-02)

`words.meaning_ja` / `words.extras` are written in the language of whoever created the word. Every surface shows the reader's (display language's) text from `word_explanations` instead, keyed `(word, explain_lang, l1)`:

- `updateWordExtras` stores the generated reader-language meaning (`reader_meaning`) in the reader row; it used to copy the shared meaning (another language) there.
- Dex views (`ReaderMeaning`, `reader-meanings.ts`) batch-read reader meanings; for words whose shared meaning is not in the reader's language and that have none, `fillReaderMeanings` fills **only the meaning**: shared meaning if it fits → `dictionary_entries.meanings[lang]` → one batched AI call (cap `reader_meaning`, logged). It never touches extras or `verified` rows (`readerMeaningWriteTarget`).
- Review uses the same explanation query and save shape as the word card (`reader-explanation.ts`, `useReviewReaderExplanations`): the quiz prompt meaning is `quizPromptMeaning` (shared if it fits → reader explanation → dex cache → photo prompt "Which one is this?"), and the answer sheet is built from the reader row with `explainOf`. Missing reader explanations are generated through the word card's path (`generateCard` → `updateWordExtras`) for the current and next card only.
- Words whose shared meaning is already in the reader's language (Japanese UI with Japanese words) take none of these paths, so they look exactly as before.

## Day boundaries

User-facing "today" counts use Taiwan time (`Asia/Taipei`; `startOfAppDay` in `taipei-day.ts`, used for plan limits and the review daily limit). AI abuse caps (`assertWithinDailyCap`) are a rolling 24 hours on purpose, and their message says so.

## Security audit fixes (2026-10-03)

- Shared `words` rows: client-sent canonical columns and `extras` only **fill empty fields** (`shared-word-guard.ts`; same-language extras only; `verified` words untouched). The caller's full explanation goes to the reader-language `word_explanations` row, size-capped. Server-verified writes (`reportAndFixSection`, `regenerateCardSection`) are separate paths.
- AI caps (`ai-cap.ts`): fail closed when usage can't be counted; one usage row is reserved **before** the provider call (callers no longer `logUsage` the same kind afterwards); a global per-Taipei-day ceiling across all users (`AI_GLOBAL_DAILY_CAP`, default 5,000, TTS excluded) is counted in server-only `app_config` slots (`budget-slots.ts`), old slots pruned. Errors carry codes (`AI_DAILY_CAP`, `AI_GLOBAL_CAP`, `AI_USAGE_CHECK_FAILED`) localised via `errors.ts`.
- AI caps, abuse hardening (2026-10-03 audit H3/H4/M1/M7/M8): the per-user reservation is atomic — `reserve_usage_event` (Postgres, advisory lock per user+kind, service role only; migration `20261003130000`) counts and inserts in one call (`usage-reserve.ts`; falls back to count-then-insert only while the function is missing). Caller tier (`aiCallerTier`: `auth.users.is_anonymous` via the admin API, then `isProUser`, cached 60 s) picks the caps: anonymous accounts get `ANONYMOUS_DAILY_CAPS` (much smaller; `first_catch_ai` unchanged at 24), and non-Pro calls must also fit a sub-bucket of the global ceiling — anonymous `ai-anon-budget:` (`AI_ANON_DAILY_CAP`, default 500), free `ai-free-budget:` (`AI_FREE_DAILY_CAP`, default 2,500) — so Pro keeps at least 2,000 of the 5,000. If a bucket refuses, the user's usage row is released. Kinds added: `image_gen` (20/day; every paid image generation in `searchImageCandidates`, reserved right before the provider call; the photo-candidate path skips the AI image instead of failing), `jev_rank` (300/day, exempt from the global ceiling like `tts`; on refusal the scan keeps its order), `first_catch_ai` (the member tutorial path now uses the same reservation and global buckets; cap errors map to `FIRST_CATCH_LIMIT` / `FIRST_CATCH_TRIAL_FULL` / `FIRST_CATCH_AI_UNAVAILABLE`). Guest trial: 15 per network per day (IPv6 /64), 1,000 overall; when the overall guest budget is drained the gate answers `FIRST_CATCH_TRIAL_FULL` (and returns the network slot), the client falls back to the per-device anonymous account, and if that bucket is drained too the tutorial shows `first.trialFull`. Recommended owner step (needs an owner account): enable Supabase Auth CAPTCHA (Cloudflare Turnstile) for anonymous sign-ins and put Turnstile in front of `firstCatchAI`. Proxy hardening: `fetchImageAsDataUrl` and Higgsfield downloads are capped at 10 MB (`byte-cap.ts`). The photo-to-3D feature (Tripo3D: `/api/object3d-model`, `startObject3d`/`checkObject3d`) was removed entirely on 2026-10-03 by owner decision.
- Shared TTS cache: only headwords and dictionary example sentences are stored (`tts-share.ts`); other text is synthesized and returned uncached.
- `/api/native-ai` is off unless `NATIVE_AI_ENABLED=1` (no shipped client; iOS design is `/api/v1/*`).
- Stripe webhook re-reads the subscription from Stripe instead of trusting event order.

## Shared word content: server-made only (audit 2026-10-03, second pass)

- **No personal material in shared rows (H1).** `runSectionRegen` no longer reads the caller's caption, place, date or diary (`journal_entries.user_draft`); shared example prompts use `sharedExampleSourceRule` (world side only). `personalExampleRule` stays for a future per-sticker target (like `stickers.speaking_scaffold`). `word_explanations` is no longer readable by `anon` (`20261003130000`).
- **Server receipts (H2 / M3).** Every server function that writes word content for the client — `generateCard` (full card, keyed by explanation language × L1, written **before** it returns), `suggestWords` / `suggestWordCandidates` / `detectScan` / `generatePhraseCard` (meaning + readings as `candidate`), the tutorial card — records it in the server-only `generated_cards` table (`generated-cards.ts`, 14-day TTL, `20261003130100`). `upsertWord` builds a **new** shared word from the receipt (full card first), else the dictionary, else headword only (filled later by `generateCard` → `fillSharedWordFromCard` and the detail auto-fill); `updateWordExtras` fills shared columns/extras and the reader row only from the receipt with the same key. Client-sent meaning/example/extras/level are ignored. If the table is missing (migration not applied) both fall back to the previous client-content fill-empty behaviour.
- **Reader rows fill only.** `saveWordExplanation` inserts a missing row or fills empty fields (`fillReaderExplanation`); a meaning/translation not in the reader's language counts as empty, a wrong-language explanation is replaced; `verified` rows untouched. Only server regeneration (`mergeIntoReaderExplanation`) overwrites.
- **Concurrent first catch (M4).** A unique violation on insert re-selects the winner's row.
- **Album layout (M6).** `saveAlbumLayout` calls `save_album_layout(jsonb)` (`20261003130200`, SECURITY INVOKER, `user_id = auth.uid()`, one statement); per-row updates only when the function is missing.
- **Background work (L5).** `runAfterResponse` (`after-response.ts`) hands work to the Workers `waitUntil` that nitro puts on the request, else awaits it for at most 3 s; failures are logged with a label. Used for distractor pre-generation and receipts that the response does not need.

## Beta analytics (2026-10-03, roadmap 9.4 / 11)

What is measured, for the 2–4 week beta (dashboard: `/admin/beta`, admin only, server-checked `has_role`; link in Settings → developer and on `/admin/metrics`). No migration: existing tables only.

- **Signed-in funnel** — whitelisted kinds in `usage_events` via `logAppEvent` (`metrics.functions.ts`, names in `funnel-events.ts`): `camera_open → shutter → candidates_shown → candidate_picked → first_audio_played → catch_saved`, `review_started → review_answered → review_session_done`, `paywall_viewed → checkout_started`. Kind and time only. `candidates_shown` may carry `ms` (shutter → candidates); it is stored as an `ai_runs` row `loop="funnel_latency"`, `meta={event, ms}` because `usage_events` has no payload column.
- **Pre-signup tutorial funnel (anonymous)** — `welcome_view, questions_done, tutorial_start, photo_taken, candidates_shown, catch_done, practice_done, signup_view, signup_done`, sent by `tutorial-funnel-client.ts` to the public `recordTutorialStep` (`tutorial-funnel.server.ts`). One `app_config` row per step and session: `funnel:<Taipei day>:<step>:<HMAC(session id)>` with value `{}`; the unique key makes it idempotent (a session counts each step once; the client also dedupes in `sessionStorage`). The session id is a random per-tab value in `sessionStorage`. **No photos, words, emails, IPs or user ids are stored.** Abuse limits: same-origin only, 200 rows per network per day (counted in `funnel-rate:<day>:ip:<HMAC(day+IP bucket)>:<n>` slots, pruned after 2 days, raw IP never stored), 3,000 rows per day overall; funnel rows are pruned after 120 days. Failures never block the tutorial.
- **Dashboard** (`beta-metrics.functions.ts` reads, `beta-metrics.ts` computes — pure, tested): tutorial funnel (7/30 days) → signup → first catch → first review; retention by Taipei signup day (D1/D7/D30 exact day, plus "on or after"; only finished days count; active = any usage event, review or catch; anonymous accounts and admins excluded); weekly catches/reviews per active user and median review session length (answers split on 10-minute gaps); AI/TTS **cost estimate** = calls × unit cost (`DEFAULT_UNIT_COST_USD`, admin-editable override in `app_config.beta_unit_costs`), per active user per month, pre-signup cost shown separately, admin usage excluded; first-catch analysis success rate and p50/p90 from `ai_runs` `first_catch_ai` and guest `first-catch-run:*` keys (kept 14 days, UTC day).
- All reads page through PostgREST 1,000 rows at a time (`readAllPages`); the screen warns when a safety limit truncated a table. Harness: `?scene=admin-beta` (`&window=7`, `&lang=en|zh-TW|ja`).

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

## Home album layout: one function, one page-shaped board (2026-09-30, 2026-10-02)

`src/lib/album-day-layout.ts` decides where every photo of a day sits (`settleDayAlbum` → `frameRatio` + `settledById`; `layoutDayAlbum` for the whole day). Both the home `DayCollage` (DOM) and the 3D diary book's left page (`shelf3d/textures.ts` → `paintPlacedPhotos`, painted in the book's own paper style) use it, and `albumHeroUrl` picks the picture.

Owner decision 2026-10-02 (「台紙を本のページの形にそろえる」): home and the book share **one board whose shape is the book page** — width 1, height `ALBUM_PAGE_RATIO` (1.35, `album-place.ts`). Un-placed photos are packed into that board by `album-page-fit.ts` (`fitAlbumPage`: 1–4 columns, the largest photo width that fits, centred, slight stagger; plain text-only cards have a px height and get their frame ratio from the chosen width). Saved placements (`album_x/album_y` as fractions of the board **width**, `album_scale`, `album_rot`) keep their meaning and still win; autos avoid them (`avoidFixed`). `boardHeight` is `ALBUM_PAGE_RATIO` unless a saved card sits lower (legacy tall boards): then the board grows for that day and the book scales it down uniformly, so home and book stay identical. Dragging clamps the centre to the page bottom (`applyDelta(…, ALBUM_PAGE_RATIO)`). The book has **no re-flow branch** of its own; do not add a second layout path. Do not overlay DOM on the book (`HomeShelf` renders no album UI; it only repaints textures via `refreshDays`).

Arranging from the book (owner 2026-10-02 「本棚のアルバムでも長押しで配置を変換できるようにして」): `ShelfWorld` emits `onPageLongPress(side)` (550 ms, same as the home album; the press is not a tap or a flip), `HomeShelf` forwards the left page's day as `onAlbumLongPress({y,m,d})`, and `HomeSurface` opens `BookAlbumEditor` — a full-screen sheet with that day's production `DayCollage` in edit mode (`startEditing`, `onDoneEditing`). It saves through the same `saveAlbumLayout` as home, invalidates `["stickers"]`, and the book repaints via the existing `layoutSig` → `refreshDays()` path. Book text: date headings on both pages and the title page use the sans family (`SANS`), words are bold sans, only the owner's notes (and the diary) are handwritten — matching home (`DiaryDate` app font, bold word, `.handwritten-ja` note). `CaptionEditDialog` is the note editor used by word detail and the home album.

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
