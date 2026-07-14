-- 1) profiles: restrict authenticated column-level SELECT to public-safe fields.
--    Own-row full read continues via service-role in getMyProfile server fn.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, created_at, onboarded) ON public.profiles TO authenticated;

-- 2) storage: re-check that the storage path's first folder matches the
--    sticker's actual owner, so a spoofed path cannot leak another user's file.
DROP POLICY IF EXISTS stickers_read_visible ON storage.objects;
CREATE POLICY stickers_read_visible ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'stickers'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.stickers s
      JOIN public.posts p ON p.sticker_id = s.id
      WHERE (s.cutout_image_url = objects.name OR s.object_image_url = objects.name)
        AND (storage.foldername(name))[1] = (s.user_id)::text
        AND (
          p.visibility = 'public'
          OR (p.visibility = 'friends' AND public.are_mutual_followers(auth.uid(), p.user_id))
          OR p.user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.stickers s
      JOIN public.posts p ON p.sticker_id = s.id
      WHERE s.selfie_image_url = objects.name
        AND (storage.foldername(name))[1] = (s.user_id)::text
        AND p.user_id = auth.uid()
    )
  )
);