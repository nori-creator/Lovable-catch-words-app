-- 1) profiles: scope full-row reads to the owner; others see only public columns.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_public_or_own ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, display_name, avatar_url, created_at, onboarded) ON public.profiles TO authenticated;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO anon;

-- 2) review_choices: shared data, read-only for users; writes only server-side.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.review_choices FROM authenticated, anon;
REVOKE SELECT ON public.review_choices FROM anon;
GRANT SELECT ON public.review_choices TO authenticated;
GRANT ALL ON public.review_choices TO service_role;
DROP POLICY IF EXISTS review_choices_no_write ON public.review_choices;
CREATE POLICY review_choices_no_write ON public.review_choices
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS review_choices_select_auth ON public.review_choices;
CREATE POLICY review_choices_select_auth ON public.review_choices
  FOR SELECT TO authenticated USING (true);

-- 3) stickers storage reads: require folder prefix == owning sticker's user id
DROP POLICY IF EXISTS stickers_read_visible ON storage.objects;
CREATE POLICY stickers_read_visible ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'stickers'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.stickers s
        JOIN public.posts p ON p.sticker_id = s.id
        WHERE (s.cutout_image_url = objects.name OR s.object_image_url = objects.name)
          AND (storage.foldername(objects.name))[1] = s.user_id::text
          AND (storage.foldername(objects.name))[1] = p.user_id::text
          AND (
            p.visibility = 'public'
            OR (p.visibility = 'friends' AND public.are_mutual_followers(auth.uid(), p.user_id))
            OR p.user_id = auth.uid()
          )
      )
    )
  );