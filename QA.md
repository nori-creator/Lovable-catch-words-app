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

## iPhone (Safari / home-screen app) device checks

Automated checks here run in Chromium only; WebKit is not available in the preview pipeline, so these must be confirmed on a real iPhone before release.
Known WebKit traps the code already guards against (keep the guards):

- `indexedDB.open` can never settle → queueing a capture must not block AI analysis (`offline-queue.ts` open timeout; `capture.tsx` runs AI first).
- Geolocation `timeout` is not counted while the permission prompt is open → every location wait uses `withDeadline` (`deadline.ts`).
- Total canvas memory is capped → release canvases after encoding (`width = height = 0`).
- `MediaRecorder` records MP4, not WebM → label blobs with `rec.mimeType`.
- `<video>` needs `playsInline` (and `muted` for camera streams) or it goes full screen.
  Checklist (Safari tab and home-screen app, Wi-Fi and cellular):

1. Take a photo → candidates appear (or the "saved for later" state) within ~20 s; never an endless "analyzing".
2. Same with location permission prompt left unanswered.
3. Scan mode: frame → detected words.
4. Five photos in a row without reloading.
5. Place reminder permission flow (home-screen app only; Safari tabs cannot receive web notifications).

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

## Shared tutorial release checks

- Change a production tab, collection view, card section or review control once; confirm both the normal app and tutorial render that change. The same holds for whole screens (`HomeSurface`, `CaptureAnalyzingPanel`) and for the colour tokens used by the first-run question pages.
- Home → actual camera → actual candidate picker → capture card → shared landing animation → collection views → shared detail sheet → real four-choice exercise / memory modal → completion → full-screen auth.
- Verify the guide allows only the intended controls, including keyboard access; no duplicate UI and no tutorial CSS overriding production card dimensions.
- Verify guest detail/review never calls authenticated storage or scheduled-review mutations.
- Normal motion: show the screen for 1.6 seconds, expand the blue 24px frame to the measured target over 850ms, then show the coach. Reduced motion follows the app preference and must still reveal the coach.
- Repeat with direct signup, refresh/resume, three UI languages, narrow screens and real iOS camera/AI. Static preview data alone is not evidence of live AI or iOS success.

## Beta-test regression checks (2026-09-30)

- Guest first catch: peel the sticker, then sign in from any entry before finishing the tour. The catch must appear in the collection after sign-in (`hasAddedCatch`). If the transfer or any photo save fails, `/admin/users` → that user → "写真の保存の失敗" must count it.
- Display language 台湾華語 on a device whose system language is Chinese: Chrome/Android Chrome/iOS Safari must not offer or auto-run Google Translate (`notranslate`, `translate="no"`, `lang="zh-Hant-TW"` before first paint).
- Write a diary entry with Zhuyin input: text already typed must never disappear while a new character's font subset loads (input field uses the swap alias fonts).
- Traditional Chinese handwritten lines (e.g. 眼前的東西，要怎麼說？) render every glyph in one typeface (Iansui).
- Camera screen: a two-finger pinch must not zoom the page; inside the frame it changes the camera zoom. Tap-to-focus shows the ring only on devices that support `pointsOfInterest`; elsewhere a tap does nothing visible.
- Measure-word 個 reads with the neutral tone (˙ㄍㄜ / ge) in the measure-word section and after numerals/demonstratives (一個・這個・幾個); non-measure uses (個人・個性) stay ㄍㄜˋ (`tw-neutral-tone.ts`).

## R26/R27 regression checks (2026-09-30)

- Camera / scan screens: the whole page never zooms (`useLockPageZoom`: viewport `user-scalable=no` + `html.page-zoom-locked` only while the camera is mounted; restored on leave). Camera zoom stays a pinch inside the frame only. Bottom-left button is "add a photo from the camera roll" (ImagePlus), never a thumbnail of the last catch.
- Dex map: changing the day (arrows, calendar, list) always scrolls the timeline back to that day's first item.
- Diary book, left page: keeps the book's own paper look (white mount, masking tape, bold word, brown handwritten note ≤3 lines) but photos sit where the home album puts them (size / angle / stacking), from the single layout function `lib/album-day-layout.ts`. Since 2026-10-02 home and book share one page-shaped board (1 : 1.35): every photo of a day fits inside it (1–4 columns), the book paints the same board scaled to the page, no "— N枚" suffix, date headings in the app sans font. Nothing is laid over the book (an overlay drifted from the page). Long-pressing the book's left page opens the same arrange screen as home (`BookAlbumEditor`, full-screen); Done saves like home and the open book repaints (`refreshDays`). Photos hidden from the home album are not pasted. When touching the layout function, compare `home-vs-book` (7/4/2/1 photos): home and book must show the same placement, nothing clipped, and saved placements below the page must still be visible (board grows).
- Note (ひと言) can be edited from word detail and the home album (arrange mode) — not from the diary book; owner only (`updateStickerCaption`), empty saves as removed.
- Account delete confirmation accepts 削除 / DELETE / 刪除 in every UI language. Auth failures are shown in the UI language (`authErrorText`); raw server messages are never toasted (`readableError`).
