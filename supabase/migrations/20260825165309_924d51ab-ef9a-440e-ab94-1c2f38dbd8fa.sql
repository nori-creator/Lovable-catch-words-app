DROP POLICY IF EXISTS review_choices_select_auth ON public.review_choices;

CREATE POLICY review_choices_select_own_words
ON public.review_choices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.stickers s
    WHERE s.word_id = review_choices.word_id
      AND s.user_id = auth.uid()
  )
);
