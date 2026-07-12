-- The tts bucket had NO storage policies at all, so:
--   - client-side createSignedUrl(s) on cached audio always failed
--   - the cache-write in synthesizeSpeech failed on every call, silently
--     falling back to a base64 data URL → the same word was re-synthesized
--     on every tap (106 paid TTS calls, zero cached as of 2026-07-12).
--
-- Fix: authenticated users may READ cached audio (it contains no personal
-- data — deterministic (language, voice, sha256(text)) paths). Writes stay
-- server-side only (service role via supabaseAdmin, see tts.functions.ts):
-- letting any client write to a shared cache would be an audio-poisoning
-- vector, and pronunciation correctness is non-negotiable (constitution §2-1).
create policy tts_read_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'tts');
