
DROP POLICY IF EXISTS stickers_read_visible ON storage.objects;
CREATE POLICY stickers_read_visible ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'stickers' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM stickers s
      JOIN posts p ON p.sticker_id = s.id
      WHERE (
        s.cutout_image_url = objects.name
        OR s.object_image_url = objects.name
      )
      AND (
        p.visibility = 'public'
        OR (p.visibility = 'friends' AND are_mutual_followers(auth.uid(), p.user_id))
        OR p.user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM stickers s
      JOIN posts p ON p.sticker_id = s.id
      WHERE s.selfie_image_url = objects.name
        AND p.user_id = auth.uid()
    )
  )
);
