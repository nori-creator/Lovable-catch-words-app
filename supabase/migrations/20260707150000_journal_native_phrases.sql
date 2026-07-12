-- Roadmap B6: diary redesign — the AI no longer writes a full model diary.
-- Corrections now come with 2-3 native phrases ("その気持ちをネイティブならこう言う"),
-- stored per entry as [{ zh, ja, note }].
alter table public.journal_entries
  add column if not exists native_phrases jsonb;
