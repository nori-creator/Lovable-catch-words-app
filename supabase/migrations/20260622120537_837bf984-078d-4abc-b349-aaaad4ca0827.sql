
DROP POLICY IF EXISTS "words_insert_auth" ON public.words;
CREATE POLICY "words_insert_ai_only" ON public.words FOR INSERT TO authenticated WITH CHECK (source = 'ai');

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
