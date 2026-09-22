# Phase 0 — Current implementation inventory

Baseline inspected: `main` at `8c441c915416c07114306fcc748898b1141c3b13`
Inventory date: 2026-09-23

This document is an implementation map, not a product specification. Product behavior is defined by the four root source-of-truth files.

## Safety / rollback baseline

The Phase 0 work branch was created directly from the baseline main commit above. No production behavior is changed by this inventory.

There is an open draft PR #103 from `claude/app-quality-review-jjv1yn`. It touches Catch performance, per-section correction, Home journal visibility and memory indicators. Do not duplicate or overwrite that work without reconciling its diff first.

## Current product surface

### Active core
- Auth: `src/routes/auth.tsx`
- Authenticated shell: `src/routes/_authenticated/route.tsx`
- Onboarding: `src/routes/_authenticated/onboarding.tsx` — currently authenticated-first; PRODUCT.md requires guest-first later.
- Capture/scan: `src/routes/_authenticated/scan.tsx`
- Review: `src/routes/_authenticated/review.tsx`
- Settings: `src/routes/_authenticated/settings.tsx`
- Collection/Dex and Map are implemented under authenticated routes.
- Word/sticker persistence and retrieval: `src/lib/stickers.functions.ts`
- AI provider abstraction: `src/lib/ai-provider.server.ts` and `src/lib/ai.functions.ts`
- TTS: `src/lib/tts.functions.ts`
- SRS: `src/lib/srs.ts`
- Memory display model: `src/lib/memory.ts`
- i18n infrastructure is present; Web launch requirement remains ja/en/zh-TW.

### Intentionally hidden — preserve
`src/lib/features.ts` explicitly marks these as hidden future functionality, not dead code:
- `SOCIAL_ENABLED = false`
- `JOURNAL_ENABLED = false`
- `DEX_SHELF_ENABLED = false`

Do not delete their code merely because routes/components are currently unreachable from navigation.

### Cutout
`src/lib/cutout-feature.ts` has `CUTOUT_ENABLED = false`. Web MVP must not make background removal a critical path. Preserve stored assets/pipeline until a deliberate native/future migration.

## Known architecture facts

### TTS
Current server TTS already has a shared Supabase Storage cache and batch pre-generation path. It is Google-first when `GOOGLE_TTS_API_KEY` exists, with an OpenAI-compatible fallback. This should be evolved into the provider-agnostic speech router in ROADMAP Phase 4 rather than rebuilt from zero.

Current cache identity is based on language/voice/text (speed is encoded into voice key). Before higher-quality multi-provider routing, extend identity so provider/model/version and pronunciation-disambiguating inputs cannot collide.

### Memory / review
`src/lib/srs.ts` is a custom SM-2-derived scheduler with recognition/listening/reverse/production modes.
`src/lib/memory.ts` currently exposes a composite “memory strength” percentage that mixes retention and stability/maturity. PRODUCT.md requires the primary displayed percentage to become a mathematically defined current recall probability. Therefore the current percentage must not be treated as the final Memory Engine V2 semantic.

PR #103 currently changes memory indicators; reconcile it before changing memory UI or semantics.

### Collection scaling
`src/lib/stickers.functions.ts` contains batched URL signing and comments describing collection reads up to thousands of items. ROADMAP Phase 9 still requires screen-scoped queries/pagination rather than loading a growing collection wholesale.

### Settings
Settings is a large route and is a known refactor target. A historical branch `feat/roadmap-settings-autosave` exists, but it is not evidence that the work is merged. Compare it with latest main before reusing any part.

## Historical / obsolete instructions

Files under `docs/design` contain historical implementation details. In particular, `docs/design/06-scan-first-mvp.md` still declares itself the sole Source of Truth and contains superseded decisions including:
- scan-first “かざす=調べる、撮る=残す” as the defining concept;
- Taiwan-resident Japanese / zh-TW×ja-only MVP target;
- browser cutout as required Catch behavior;
- speaking-output review as the primary review model;
- fixed 3 catches/day and fixed launch pricing.

Those instructions conflict with PRODUCT.md / ROADMAP.md and must not drive new implementation.

## Test / release infrastructure already present

`package.json` provides:
- `npm run check` — TypeScript + i18n + ESLint + Vitest
- `npm test`
- `npm run ui:audit`
- `npm run shelf:perf`

UI changes must use the existing `scripts/ui-harness` + Netlify Deploy Preview workflow described in AGENTS.md.

## Phase 0 classification

| Area | Classification | Action |
| --- | --- | --- |
| Catch/scan | active/current | protect with characterization tests before structural refactor |
| Collection/Map | active/current | preserve; later paginate/cluster |
| Review/SRS | active/current | preserve current behavior; Memory V2 later |
| TTS cache/pregen | active/current | preserve; evolve router later |
| Settings | active/current, refactor target | reconcile autosave branch before implementation |
| Social | hidden intentional future | keep behind flag |
| Journal | hidden intentional future | keep behind flag |
| Dex shelf | hidden intentional future | keep behind flag |
| Cutout | paused future/native | keep disabled; do not put on Web critical path |
| old docs/design product instructions | obsolete as authority | archive/mark historical in Phase 1 |
| Supabase migrations | historical applied schema | never delete as “dead code” |

## Immediate next implementation work

1. Mark `docs/design` clearly historical so coding agents cannot follow the stale Source-of-Truth banner.
2. Add/strengthen characterization tests around critical Catch → save → Collection and settings persistence before cleanup.
3. Reconcile open PR #103 before touching overlapping memory/Catch performance files.
4. Audit the settings autosave branch against current main; cherry-pick concepts only, never blindly merge stale code.
5. Begin incremental cleanup only after the relevant tests exist.
