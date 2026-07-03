CREATE TABLE IF NOT EXISTS public.review_choices (
  word_id uuid PRIMARY KEY REFERENCES public.words(id) ON DELETE CASCADE,
  distractors text[] NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.review_choices TO authenticated;
GRANT ALL ON public.review_choices TO service_role;
ALTER TABLE public.review_choices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "review_choices_select_auth" ON public.review_choices FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "review_choices_insert_auth" ON public.review_choices FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "review_choices_update_auth" ON public.review_choices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid NOT NULL REFERENCES public.stickers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recalled boolean,
  lat double precision,
  lng double precision,
  location_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.encounters TO authenticated;
GRANT ALL ON public.encounters TO service_role;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "encounters_select_own" ON public.encounters FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "encounters_insert_own" ON public.encounters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS encounters_sticker_idx ON public.encounters (sticker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS encounters_user_idx ON public.encounters (user_id, created_at DESC);

ALTER TABLE public.stickers ADD COLUMN IF NOT EXISTS encounter_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "usage_events_select_own" ON public.usage_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "usage_events_insert_own" ON public.usage_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON public.usage_events (user_id, created_at DESC);