# CatchWords — Product Source of Truth

Status: Web MVP v3
Last updated: 2026-09-20

## Core promise
CatchWords removes the friction between encountering something in real life and learning how to say it in another language.

Core loop:
**Encounter → Catch → Understand/Pronounce → Collection → Remember**

The product should make the user's own life, photos, places and encounters become language-learning material. The emotional goal is: **“My own collection/world is growing.”**

## Current product scope
- Display languages: Japanese, English, Traditional Chinese.
- Learning languages at Web launch: Taiwan Mandarin and English.
- Home prioritizes today's catches.
- Collection supports category growth and a Map view.
- Web MVP does not depend on image cutout. Preserve existing cutout code only if needed for future/native work; do not expose it as a required Web flow.
- Social, large diary/journal experiences, 3D, games, video scan, AR and other experiments must not delay Web v1.

## First-run experience
Account creation must not be the first experience.
1. Introduce the app with generated everyday photos, then choose display language and learning language.
2. Ask desired daily study amount, learning goals and interests (owner revision, 2026-09-23). Goals and interests are multi-select and tailor the learner's private example situations and explanations, never the shared dictionary meaning or which objects vision sees.
3. Offer an optional notification-preference page, then a ready screen that starts the interactive tour. Store the preference, but do not imply scheduled delivery on unsupported Web devices.
4. Interactive tutorial explains pains solved by CatchWords by letting the user operate the real product. Home and Collection start with explicitly marked generated-photo examples, so neither tour screen has a blank-state message. The generated album photo layout is shared with the account screen.
5. User takes one real photo and completes one Catch.
6. After the landing animation, let the user open the added word and read multiple real meanings, examples and usage. Only when the learner chooses to finish that view should they create/sign in to an account to save the collection.
Guest progress must survive registration. The first photo/word must be durably added to the local Collection and its landing completed **before** the registration screen appears. Reuse actual Home components behind registration; do not promise a different illustrated home.

## Catch
- Image analysis normally returns roughly 3–5 useful candidate words depending on the image.
- Candidate ranking should account for image evidence and learner level; avoid overly generic candidates when a more useful specific word is appropriate.
- If the desired word is absent, user can search in their native/display language.
- Immediately prioritize fast display of headword, meaning and pronunciation.
- Start low-cost background preparation for the most likely candidate after capture, before the user taps a candidate.
- After candidate confirmation, generate/fetch richer data.
- Do not eagerly generate expensive data that is unlikely to be viewed.
- Preserve the existing sticker/peel/collection landing behavior unless a later approved change explicitly replaces it.
- Catch animation is user-configurable ON/OFF. Pronunciation remains a core learning behavior and should not be degraded merely because decorative animation is off.
- Normal repeated Catch animation should be short; reserve richer celebration for meaningful milestones.

## Pronunciation / TTS
Current mechanical-sounding Google-first speech is not the target quality.
Build a provider-agnostic speech router. Candidate providers/models may include high-quality services such as MiniMax, ElevenLabs and future compatible providers, but model selection must be based on language-specific quality testing rather than brand name.
Use hybrid caching:
1. pre-generate common/high-value vocabulary when economical;
2. reuse shared cached audio for identical safe canonical entries;
3. generate long-tail words on demand and cache them.
Cache identity must distinguish language, canonical reading/pronunciation, POS when relevant, provider/model/version/voice and other parameters needed to prevent wrong reuse.

## Word detail
Default view uses progressive disclosure.
Free/core experience should remain useful and trustworthy. The default five learning elements are:
1. word + part of speech;
2. pronunciation (Zhuyin/appropriate pronunciation notation + high-quality audio);
3. concise meaning;
4. one highly useful natural chunk/pattern;
5. one natural situation/example.
Advanced fields may be part of paid functionality. Users may enable additional fields and reorder advanced sections in Settings.
Taiwan Mandarin and English must not merely share identical linguistic fields. Use a shared UI architecture with language-specific data models (e.g. Taiwan Mandarin pronunciation/measure words/patterns vs English IPA/stress/collocations/phrasal behavior).

## Linguistic trust
Never fabricate an official TOCFL/TOEFL/CEFR classification when a source does not establish it.
Internally distinguish verified/licensed data, derived data and AI-estimated content.
Do not assume that sending non-commercially licensed corpus/data through an AI model makes commercial use lawful. Commercial pipelines must use data with appropriate rights/permission or obtain explicit legal/licensing clearance.

## Memory & review
The number shown on a word should have a precise meaning. Target concept: estimated probability that the learner can recall the word now, not a vague XP/mastery percentage.
Track evidence from first-attempt correctness, hints, retries, elapsed response time (as a secondary feature), review history, interval and question modality.
A first failed attempt remains evidence of failure even if a retry succeeds; retry success may be stored separately as relearning evidence.
Internally distinguish recognition, recall and production when practical. The card/Dex can show one primary probability, with deeper dimensions available on demand.
Use a validated scheduling baseline (e.g. FSRS-style concepts) and test experimental predictors/models such as Jev in shadow mode before allowing them to control scheduling. (Owner override 2026-09-23: Jev sets intervals now, within the guardrails in ARCHITECTURE.md › Memory, while its decisions keep being logged for calibration.)
Never present review backlog as debt (“73 reviews due”). Always provide a low-friction session such as a one-minute review and allow the user to continue voluntarily.
Question difficulty/modality should adapt to memory state and evidence, moving from recognition toward recall and production rather than only increasing by raw repetition count.

## Collection
Do not optimize for completion of all words; language is effectively unbounded.
Optimize for **growth**:
- categories gain items over time;
- categories can emerge/discover as the user's collection grows;
- AI may propose the initial category, but AI classification is not authoritative;
- users can rename their own categories and manually move/add/remove their words between categories without changing the canonical word itself;
- preserve a sensible default/AI suggestion so editing is optional, not required;
- avoid assigning excessive visible categories to one item;
- Map is another view of the personal collection/memory.
Avoid arbitrary “rarity” until there is defensible data behind it.

### Optional personal albums inside Collection
Separate from the Home/day album, Collection may support user-created personal albums such as “Night Market”, “Trip to Tainan”, or “Photos with friends”.
These are **personal groupings of catches/photos**, not linguistic categories. A catch may belong to a linguistic category and zero or more personal albums at the same time.
This is optional/post-core work and must not block Web MVP reliability.

## Home
Today's catches are primary.
Past memories should be resurfaced selectively (e.g. “three months ago — can you still say this?”) rather than requiring endless archive browsing.

## Monetization
Initial public testing is a free beta. Do not prematurely hard-code a restrictive daily Catch limit without observing behavior.
Core product value — Catch, collection, trustworthy basic meaning/pronunciation and basic review — must be experienced in Free.
Paid value should primarily expand depth, volume, advanced linguistic intelligence, speaking/coaching and other high-cost/power-user features.
Do not make poor-quality pronunciation the free experience and natural pronunciation the paid experience.

## Design principles
- One coherent CatchWords visual language, not a collage of Apple/Pokémon/Instagram aesthetics.
- Suggested metaphor: premium field notebook / collector's album.
- Camera and review are clean and focused; collection may have more physical/photo materiality.
- Brand color has a stable role; memory-state colors communicate memory, not arbitrary decoration.
- Sound/haptics are meaningful and restrained.
- Accessibility and reduced-motion preferences must be respected.
- Prefer progressive disclosure to information overload.

## North-star outcome
Primary learning outcome to evaluate: **Personal Words Retained / Week** — words encountered/caught by the user that remain retrievable later.
Supporting metrics include Catch completion, candidate accuracy, latency, retention, review engagement, TTS quality and AI cost.
