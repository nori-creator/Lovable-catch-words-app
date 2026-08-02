-- 2026-08-02
-- プロフィール写真(ヘッダーの丸アイコン)用のバケット。
-- ヘッダーは全画面に出るので、期限付きの署名URLを毎回作り直すより
-- 公開バケットにして普通にキャッシュさせるほうが速く・確実。
-- 中身は「本人が自分で選んだ顔写真」だけで、機微な学習データは入らない。
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 読み取りは誰でも(公開バケット)。書き込みは自分のフォルダだけ。
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
