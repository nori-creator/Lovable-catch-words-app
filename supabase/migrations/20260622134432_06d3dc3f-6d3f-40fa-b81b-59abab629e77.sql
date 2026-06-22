
-- =========================================================
-- Sprint 2 base: SRS reviews + AI loop observability
-- =========================================================

-- AI loop observability: tracks Maker/Checker runs per user
CREATE TABLE public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loop text NOT NULL,                  -- 'suggest_words' | 'srs' | 'diary' | 'quest'
  iterations integer NOT NULL DEFAULT 1,
  accepted integer NOT NULL DEFAULT 0,
  tokens_in integer,
  tokens_out integer,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_runs TO authenticated;
GRANT ALL ON public.ai_runs TO service_role;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_runs_select_own ON public.ai_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ai_runs_insert_own ON public.ai_runs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX ai_runs_user_created_idx ON public.ai_runs (user_id, created_at DESC);

-- SRS reviews: one row per sticker per user, simplified SM-2 state
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id uuid NOT NULL REFERENCES public.stickers(id) ON DELETE CASCADE,
  ease real NOT NULL DEFAULT 2.5,        -- SM-2 ease factor
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  last_score smallint,                   -- 0..5 last grade
  blur_seen boolean NOT NULL DEFAULT false, -- ぼやけペナルティ表示済みか
  due_at timestamp with time zone NOT NULL DEFAULT now(),
  last_reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, sticker_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_select_own ON public.reviews
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY reviews_insert_own ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY reviews_update_own ON public.reviews
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY reviews_delete_own ON public.reviews
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX reviews_user_due_idx ON public.reviews (user_id, due_at);

CREATE TRIGGER reviews_set_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a review row when a sticker is captured, so it enters SRS immediately
CREATE OR REPLACE FUNCTION public.create_review_for_new_sticker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reviews (user_id, sticker_id, due_at)
  VALUES (NEW.user_id, NEW.id, now() + interval '10 minutes')
  ON CONFLICT (user_id, sticker_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stickers_create_review
  AFTER INSERT ON public.stickers
  FOR EACH ROW EXECUTE FUNCTION public.create_review_for_new_sticker();
