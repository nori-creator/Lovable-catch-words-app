-- Security fix (docs/design/03 §1): the shared public.words table could be
-- updated without an ownership check. Replace any existing UPDATE policy
-- (the live DB may have drifted from these migrations) with a strict one:
-- a user may update an AI-generated word only while one of their own
-- stickers references it. Verified/seed words are never client-updatable.

grant update on public.words to authenticated;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'words' and cmd = 'UPDATE'
  loop
    execute format('drop policy %I on public.words', p.policyname);
  end loop;
end $$;

create policy words_update_own_card on public.words
  for update to authenticated
  using (
    source = 'ai'
    and exists (
      select 1 from public.stickers s
      where s.word_id = words.id and s.user_id = auth.uid()
    )
  )
  with check (source = 'ai');
