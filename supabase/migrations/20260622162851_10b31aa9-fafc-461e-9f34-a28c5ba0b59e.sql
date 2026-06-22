-- 1) Restrict realtime channel subscriptions to the user's own notif:<uid>:* topics
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to their own notif channel" ON realtime.messages;
CREATE POLICY "Users can subscribe to their own notif channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE ('notif:' || (auth.uid())::text || ':%')
);

-- 2) Broaden stickers_read_visible to include selfie/object images of visible posts
DROP POLICY IF EXISTS "stickers_read_visible" ON storage.objects;
CREATE POLICY "stickers_read_visible"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'stickers'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM stickers s
      JOIN posts p ON p.sticker_id = s.id
      WHERE (
        s.cutout_image_url = objects.name
        OR s.object_image_url = objects.name
        OR s.selfie_image_url = objects.name
      )
      AND (
        p.visibility = 'public'
        OR (p.visibility = 'friends' AND are_mutual_followers(auth.uid(), p.user_id))
        OR p.user_id = auth.uid()
      )
    )
  )
);