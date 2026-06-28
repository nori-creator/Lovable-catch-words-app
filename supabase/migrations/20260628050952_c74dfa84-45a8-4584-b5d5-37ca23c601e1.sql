CREATE TABLE public.review_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  sticker_id uuid NOT NULL REFERENCES public.stickers(id) ON DELETE CASCADE,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  score integer NOT NULL,
  correct boolean NOT NULL,
  blur_seen boolean NOT NULL DEFAULT false,
  response_ms integer NOT NULL DEFAULT 0,
  interval_days_after integer NOT NULL,
  ease_after numeric NOT NULL,
  repetitions_after integer NOT NULL
);

GRANT SELECT, INSERT ON public.review_history TO authenticated;
GRANT ALL ON public.review_history TO service_role;

ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_history_select_own" ON public.review_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "review_history_insert_own" ON public.review_history
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX review_history_user_reviewed_at_idx ON public.review_history (user_id, reviewed_at DESC);
CREATE INDEX review_history_sticker_idx ON public.review_history (sticker_id, reviewed_at DESC);