ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS user_draft text,
  ADD COLUMN IF NOT EXISTS correction text,
  ADD COLUMN IF NOT EXISTS feedback_ja text,
  ALTER COLUMN body_zh DROP NOT NULL,
  ALTER COLUMN body_ja DROP NOT NULL;