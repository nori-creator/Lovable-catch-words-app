# CatchWords — Master Roadmap

Status: authoritative execution order for Web MVP
Last updated: 2026-09-20

## Operating rule
Do not add large new features until the core Web loop is reliable.
Every change should clearly improve **Catch → Collection → Remember**, product reliability, trust, accessibility, cost, or release readiness.

The repository has evolved through repeated vibe-coding iterations. Refactor aggressively where useful, but **do not remove currently working product behavior merely because code looks old**. Preserve behavior first, characterize/test it, then replace/delete implementation safely.

## Phase 0 — Preserve and inventory
1. Read the latest main branch before doing work.
2. Record current routes/features/feature flags, Supabase dependencies, AI/TTS paths and current user-visible behavior.
3. Establish a baseline/tag or otherwise preserve the pre-refactor state.
4. Classify code as:
   - active/current;
   - hidden but intentionally future;
   - duplicate/legacy;
   - unreachable/dead;
   - uncertain — do not delete until proven.
5. Add characterization/smoke tests around critical existing behavior before large refactors.

**Gate:** no known currently implemented critical feature is accidentally removed.

## Phase 1 — Documentation and architecture cleanup
1. Treat PRODUCT.md, ROADMAP.md, ARCHITECTURE.md and QA.md as current source-of-truth documents.
2. Audit old docs under docs/design. Migrate still-valid facts, then clearly archive/remove obsolete product instructions so agents do not implement historical requirements.
3. Update AGENTS.md to direct future coding agents to the current source-of-truth docs.
4. Remove dead/duplicate code only with evidence and tests.
5. Refactor by domain rather than a single big-bang rewrite.
6. Simplify Settings into one preference source with autosave; remove confusing mixed “instant update vs Save button” behavior.

## Phase 2 — First-run / onboarding
Implement pre-signup onboarding:
display language → learning language → level → purpose → daily study target → interactive tutorial → real first photo/Catch → account creation.
The tutorial must demonstrate pains solved by the product through real interaction.
Preserve guest Catch state across signup.

## Phase 3 — Catch reliability
1. Benchmark candidate quality with a fixed representative image set.
2. Improve useful Top-1/Top-3 candidate accuracy and learner-level specificity.
3. Preserve native-language fallback search.
4. Optimize fast path: word + meaning + pronunciation first.
5. Background warm-up only for high-probability/high-value data; full rich generation after selection.
6. Measure p50/p90/p99 latency, not only averages.
7. Web uses original photo/sticker treatment rather than making cutout a critical path.

## Phase 4 — Catch reward and TTS
1. Add Catch animation ON/OFF preference.
2. Keep normal Catch celebration short and pronunciation-centered.
3. Use richer celebration only for milestones/new meaningful collection events.
4. Replace provider-specific TTS assumptions with a speech router.
5. Run language-specific quality evaluation before selecting default providers.
6. Implement pre-generation/shared cache/on-demand hybrid audio strategy.

## Phase 5 — Word Intelligence & trust
1. Default to five core learning elements defined in PRODUCT.md.
2. Add progressive disclosure and paid advanced fields.
3. Support field visibility/order preferences without cluttering basic Settings.
4. Separate Taiwan Mandarin and English linguistic schemas where appropriate.
5. Track provenance/confidence: verified/licensed, derived, AI-estimated.
6. Build a data-license registry/process. Do not route non-commercial data through AI as a workaround for licensing.
7. Add user correction/report flow.

## Phase 6 — Memory Engine V2
1. Give displayed memory probability a mathematically clear definition. — Done 2026-09-23: one number everywhere = estimated recall probability now (`memoryOf`).
2. Preserve first-attempt failure as negative evidence even after successful retry.
3. Incorporate question modality, hint/retry use, intervals and history; treat response time as secondary evidence.
4. Track recognition/recall/production where useful.
5. Establish a validated scheduler baseline.
6. Evaluate Jev/other experimental prediction in shadow mode against real outcomes and calibration before production scheduling. — **Owner override 2026-09-23:** Jev already controls the review interval inside guardrails (see ARCHITECTURE.md › Memory). Calibration evaluation from the logged decisions is still required and decides whether the guardrails widen or Jev is rolled back.
7. Build calibration dashboards/tests.

## Phase 7 — Review UX
1. Never expose accumulated due reviews as intimidating debt.
2. Default to a tiny session such as “1-minute review”.
3. Prioritize the highest-value/most-at-risk items internally.
4. Adapt modality from recognition toward recall/production.
5. Allow voluntary continuation after the minimum session.
6. Preserve fast access back to the corresponding Collection entry.

## Phase 8 — Collection/Home
1. Category growth rather than impossible global completion.
2. Category discovery/emergence where useful.
3. Keep visible categorization understandable (avoid tag explosion).
4. Collection ↔ Map as complementary views.
5. Home prioritizes today's catches.
6. Resurface a small number of meaningful past memories automatically.

## Phase 9 — Reliability, scale, privacy, analytics
1. Remove “load thousands of stickers at once” patterns; paginate/infinite-scroll and query only what each screen needs.
2. Use thumbnails/clustered map data where appropriate.
3. Audit RLS/auth/privacy and minimize admin access to personal photos, exact location, journal/audio content.
4. Expand analytics funnel:
   camera_open → shutter → candidates → selection → first_audio → catch_started → catch_saved.
5. Measure candidate accuracy, p50/p90/p99 latency, D1/D7 retention, review behavior, later recall and AI/TTS cost.
6. Add automated health checks for critical journeys.

## Phase 10 — AI-assisted repair system
Target workflow:
runtime error/user report → AI triage → reproducible test → fix branch → static/unit/E2E/security checks → preview → safe promotion.
Never let an LLM silently mutate production data/code without validation.
Low-risk fixes may eventually auto-promote only after strict gates. Authentication, payments, DB migrations, memory scheduling and security-sensitive changes require human approval.
For linguistic corrections, cross-check before changing shared canonical data.

## Phase 11 — Free beta
Target groups:
- learners of Taiwan Mandarin;
- Taiwanese learners of English.
Run free beta before locking monetization thresholds.
Use real behavior/cost/learning data to choose Free/Pro limits.

## Phase 12 — Monetization and Web v1
Define Free/Pro based on beta evidence.
Keep core Catch/basic pronunciation/basic collection/basic review valuable in Free.
Gate expensive/deep features rather than making the core product intentionally poor.
Web v1 release requires reliability, linguistic trust, scalable queries, complete ja/en/zh-TW UI, monitoring and critical-path QA.

## Phase 13 — Native iOS
Only after Web has real usage evidence.
Rebuild natively where iOS APIs materially improve the product: cutout, camera, haptics, pronunciation, geofencing/location resurfacing, richer album/diary and later experiments.

## Deferred experiments — do not block Web v1
Social/feed, large diary system, 3D museum/scan/avatar, Tsum-Tsum-style games, word ownership/competition, video scan, AR, Google Photos, menu-specialized mode, anime voices, real-time conversation, Language-Reactor-like capture, Daily Quest and other major experiments.

## How a new ChatGPT/Codex/Work session should resume
When the user says **“CatchWords開発再開。ロードマップ通り進めて”**:
1. Open this repository and read AGENTS.md plus PRODUCT.md, ROADMAP.md, ARCHITECTURE.md and QA.md.
2. Inspect latest main and existing PRs before modifying code.
3. Determine the earliest unfinished roadmap phase from repository evidence; do not ask the user to restate this roadmap.
4. Work on a feature branch.
5. Preserve existing functionality unless the source-of-truth explicitly deprecates it.
6. Run available checks/tests.
7. Open a PR with what changed, risks, tests and a preview path/status when available.
8. For user-visible UI/animation changes, wait for the user's real-device approval before merge.
9. For non-UI low-risk cleanup, follow repository merge policy; never silently merge risky auth/payment/DB/memory/security changes.
10. Update the source-of-truth docs when a product/architecture decision changes.
