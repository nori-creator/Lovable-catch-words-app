CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_user_date_unique
  ON public.journal_entries (user_id, entry_date);