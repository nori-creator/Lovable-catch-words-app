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
- Beats (owner revision 2026-10-02, `TOUR_TIMING` in `Spotlight.tsx`). New screen: show the screen alone for at least 1.0 s and until the target has stopped moving (8 still frames; no long tasks; capped at +4 s), then dim and expand the blue frame from a 24px square at the target's centre to the target over 700ms, then show the coach (+80ms) — only then does the target accept input. Next guide on the same screen: hide the coach, keep the dim, slide the frame to the new target over 480ms once it has settled, then show the coach. The coach text never appears before its target is framed. Reduced motion (app preference `<html data-motion>`) shows the screen for 0.4 s, then frame and coach at once without animation.
- The frame hugs the target: 4px outside on every side (2px gap + 2px line), corner radius = target radius + 4 (a square container takes the radius of the card that shares its corner); it follows scroll/resize/late layout in the same frame and is clamped 2px inside the viewport only where the target itself leaves it. Every coach shows its chapter (1–5 / 5); the frame always surrounds the control to operate (never a whole screen with a second frame inside).
- Readings: the pre-signup tutorial with Taiwan Mandarin stores pinyin (`reading-pref-v1`) only when the device has no stored reading, so the tutorial and the account afterwards show pinyin (candidates, card, Dex, detail, review choices). A stored zhuyin, or a change in the tutorial settings, is kept; a user who never went through the tutorial and never chose still sees zhuyin. Tutorial Home shows only the album (no 3D shelf). The tutorial word detail shows meaning, example and usage chunks without scrolling at 390×844 (example at least at 375×667) with a one-row coach at the bottom; the review answer sheet is framed whole with Next pulsing inside.
- Repeat with direct signup, refresh/resume, three UI languages, narrow screens and real iOS camera/AI. Static preview data alone is not evidence of live AI or iOS success.
- Candidate meanings (2026-10-03): with every display × learning language pair (especially zh-TW × en and en × zh-TW), no candidate, card meaning/translation or personal lesson shows text in a third language; a missing display-language meaning shows no meaning line rather than another language (`first-catch-meaning.test.ts`, `first-catch-ai-fallback.test.ts`).
- Shutter → candidates (Real app check, all browsers × languages): typical under ~8 s; a slow primary AI is hedged after 6 s (`ai_runs` meta / `first-catch-run:*` rows show `via` and `hedged`); never more than ~26 s server-side before a reasoned failure.
- Analysis failure is never a dead end: the error card offers "Continue with a sample" (`first.useSample`, not for device-storage failures), which continues with the labelled sample photo/word without AI and is not imported after signup; a network failure says to check the connection (`first.network`), not "unavailable before sign-up".

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

## Reader-language checks (2026-10-02)

With words collected in Japanese, switch the display language to English and then 繁體中文 (learning Taiwanese Mandarin):

- Review quiz: the prompt never shows a Japanese meaning ("Which one means “notebook”?" / 「記事用的本子」是哪一個？); while no reader-language meaning exists yet it asks "Which one is this?" with the photo.
- Answer sheet: pattern, related-word and measure-word glosses appear in the display language once the reader explanation exists (generated in the background for the current and next card); the POS legend reads Noun / Verb / … (名詞 / 動詞 / 狀態動詞（形容詞） in 繁體中文).
- Dex cover-flow, grid, list, calendar and map day cards show a meaning under the headword in the display language; dex search also matches that meaning.
- Word card: the 品詞 chip reads "N · Noun" / "N · 名詞" in the display language.
- Japanese UI with Japanese words looks exactly as before (harness `review-choice&lang=ja&mixed=1&photo=1&answer=right`).
- First run (2026-10-03): before the display language is chosen, `/welcome` and the first question follow the browser language (zh-TW / zh-Hant / zh-HK → 繁體中文, ja → 日本語, otherwise English) and preselect it; a stored choice is never overwritten (harness `first-catch&browser=en-US`).
- English counts use the singular for 1 (`{n|photo|photos}` in `i18n.tsx`): "1 photo", "met 1 time", "Caught 1 word today".
- Small phones (2026-10-03): at 320×568 and 360×640 the first questions keep "Next" on screen, the goals list never cuts "Exam preparation / TOCFL", and round choice rows ("10 min", 時刻を指定, 無制限) shrink or wrap instead of "10 …" (`ChoiceRow` measures after layout).
- First load (2026-10-03): route files export only `Route` (`route-split.test.ts`); after `npx vite build`, root + route preloads stay under ~300 KB gzip for `/welcome`, `/home`, `/dex`. The tutorial's later stages load in the background — walk welcome → questions → ready → home on a slow connection and confirm no blank screen lingers.
- Collections over 120 items (2026-10-03): Home/Dex show the newest items first and fill in the rest within seconds; search, map and calendar include old items once loaded; saving or deleting does not shrink the Dex while it reloads; at 3,000+ items the truncated notice still appears.
- Catch animation (2026-10-03): Settings › Appearance › Catch animation is full / short / off (default short, device-local). Short catches skip music/confetti but still read the word and wait for it to finish; the 1st/10th/50th/100th… catch (or an explicit new-category flag) plays the full celebration; Off never animates but still pronounces. The global Animation switch (reduced motion) still wins (harness `catch-animation&plan=short|full|off`).
- Settings autosave (2026-10-03): every successful change shows a small "保存しました / Saved / 已儲存" pill for ~2 s without moving the rows; failures keep the error toast; a partial save shows the warning toast instead of "Saved" (harness `settings-saved`).
- Resurfacing (2026-10-03): with ≥30 words, Home may show "〇か月前のこの言葉、まだ言える？" for a photo ≥60 days old whose recall is ≥60% — at most one per day and not on consecutive days, never on the memorial-album day, gone for the day after ✕; tapping opens the word and plays it (harness `home-resurface`).

## Shared word content checks (2026-10-03 audit, after applying `20261003130000`–`20261003130200`)

- Catch a word nobody has caught before (photo → pick a candidate → save **immediately**, before the card finishes): the Dex shows its meaning and reading right away; after the card finishes, opening the word shows example, chunks and related words. Same for a typed catch, a scan catch and the guest first catch transferred after sign-in.
- Open a word whose explanation already exists in your display language: nothing visibly changes after the background fill (shown items are never replaced).
- Regenerate an example section (↻): the new example never quotes your note, place or diary.
- Rearrange a home album day with many photos, and from the diary book: the order saves in one go; reload shows the same layout.
