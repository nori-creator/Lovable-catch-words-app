-- 共有の語（words）を、ブラウザから書き換えられないようにする（2026-10-01）。
--
-- words は (language, headword) で全員が同じ行を見る。これまで
-- `words_update_own_card` が「その語の札を持っている人なら更新してよい」としていたので、
-- 好きな語に自分の札を作るだけで、**全員に見える意味・例文・解説を書き換えられた**。
-- アプリの更新はすべてサーバ（service role）を通っている（`updateWordExtras`・
-- `runSectionRegen` など）ので、ブラウザの更新口は使っていない。閉じても動きは変わらない。
--
-- あわせて: サーバが代わりに語を足すとき（service role では auth.uid() が空になる）も、
-- 足した人（created_by）を残せるようにする。ブラウザからの追加は今までどおり本人になる。

drop policy if exists words_update_own_card on public.words;
revoke update, delete, truncate on public.words from authenticated;
revoke insert, update, delete, truncate on public.words from anon;

create or replace function public.enforce_words_source()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.source := 'ai';
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;
