
CREATE POLICY "stickers_storage_read_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "stickers_storage_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "stickers_storage_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "stickers_storage_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);
