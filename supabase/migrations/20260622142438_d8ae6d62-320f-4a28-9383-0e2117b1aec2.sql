
CREATE TABLE public.daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  category_key TEXT,
  target_word TEXT NOT NULL,
  hint_ja TEXT NOT NULL,
  reward_xp INT NOT NULL DEFAULT 20,
  completed_at TIMESTAMPTZ,
  sticker_id UUID REFERENCES public.stickers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_date, target_word)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_quests TO authenticated;
GRANT ALL ON public.daily_quests TO service_role;
ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quests" ON public.daily_quests FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  body_zh TEXT NOT NULL,
  body_ja TEXT NOT NULL,
  used_sticker_ids UUID[] NOT NULL DEFAULT '{}',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal" ON public.journal_entries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX journal_user_date_idx ON public.journal_entries(user_id, entry_date DESC);
