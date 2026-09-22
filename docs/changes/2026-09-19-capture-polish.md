# Capture flow polish

Photo peeling keeps the original rounded photo on one glossy white backing. A committed gesture requires travel of about 56% of card width; motion is projected along the initial drag direction, and reversing the finger reverses the fold. Cutout code remains behind its existing flag.

Capture immediately enters the live selfie view when the device preference is enabled (default on), with Skip available. AI analysis runs while the selfie view is open. The captured image matches the object-cover viewfinder and decimal digital zoom; the focus guide crop is sent to AI while the full viewed photo is retained. Camera permission, lens switching, optical zoom and native gallery saving need physical-device verification.

Reencounters pass the freshly fetched owned-word record directly to persistence, instead of reading stale React state. Required photo upload/association errors no longer silently report success. The same sticker's photo list is invalidated after the encounter is recorded. No database migration is introduced. Production database persistence was not exercised in this environment.

The reward uses a 120 ms release, 480 ms entrance, name/voice at 600 ms, then 180 ms glint and 280 ms afterglow once speech finishes. Uncached audio gets a 350 ms budget before device speech; playback completion has a bounded fallback. Slow storage still delays landing until a successful save, with a floating animation instead of a frozen image. Thumbnail uploads no longer block saving.

Device photo saving begins at capture, including scan snapshots and selfies, rather than during celebration. Native gallery implementation is retained. Browsers own download notifications; moving the download avoids initiating it during celebration but cannot hide an existing OS notification or guarantee silent Photos-library sync on the web. The existing user sync preference remains respected.

Settings use white rounded rows, separate modal wheel choices and a sticky save action. Review quizzes and wordbooks are disabled through feature flags; implementation files remain. Native-meaning reminder copy and the reencounter card are refreshed; counters, strength explanation and retake suggestion are hidden.

Verification: 43 focused Vitest tests pass (viewfinder crop, zoom, device saving, reminder copy and localization). UI harness build succeeds. Type checking retains the pre-existing `src/routes/__root.tsx` error-component Error/unknown mismatch; no new errors. Netlify PR Deploy Preview is the visual review target, with the changed screens linked in its selector. Do not merge before visual approval, per AGENTS.md.
