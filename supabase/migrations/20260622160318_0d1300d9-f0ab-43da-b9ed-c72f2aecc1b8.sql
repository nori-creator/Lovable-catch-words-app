
-- Sprint 9: Security hardening + leaderboard

-- 1) Restrict profiles SELECT to authenticated users
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- 2) Enforce words.source server-side via trigger (prevent user from setting source freely)
CREATE OR REPLACE FUNCTION public.enforce_words_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.source := 'ai';
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_words_source ON public.words;
CREATE TRIGGER trg_enforce_words_source
  BEFORE INSERT ON public.words
  FOR EACH ROW EXECUTE FUNCTION public.enforce_words_source();

DROP POLICY IF EXISTS words_insert_ai_only ON public.words;
CREATE POLICY words_insert_authenticated ON public.words
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 3) Allow reading sticker images for visible posts (public/friends/own)
DROP POLICY IF EXISTS "stickers_read_visible" ON storage.objects;
CREATE POLICY "stickers_read_visible" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'stickers' AND (
      -- own files (path begins with user's uid)
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.stickers s
        JOIN public.posts p ON p.sticker_id = s.id
        WHERE s.cutout_image_url = storage.objects.name
          AND (
            p.visibility = 'public'
            OR (p.visibility = 'friends' AND public.are_mutual_followers(auth.uid(), p.user_id))
            OR p.user_id = auth.uid()
          )
      )
    )
  );

-- 4) Leaderboard view-style function (security invoker, aggregates only)
CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit int DEFAULT 20)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  sticker_count bigint,
  post_count bigint,
  xp bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_url,
    COALESCE(sc.cnt, 0) AS sticker_count,
    COALESCE(pc.cnt, 0) AS post_count,
    (COALESCE(sc.cnt, 0) * 10 + COALESCE(pc.cnt, 0) * 5)::bigint AS xp
  FROM public.profiles p
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS cnt FROM public.stickers GROUP BY user_id
  ) sc ON sc.user_id = p.id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS cnt FROM public.posts GROUP BY user_id
  ) pc ON pc.user_id = p.id
  ORDER BY xp DESC NULLS LAST
  LIMIT GREATEST(_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(int) TO authenticated;
