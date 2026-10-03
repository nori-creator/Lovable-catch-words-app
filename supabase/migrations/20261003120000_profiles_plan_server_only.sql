-- profiles.plan をブラウザから書き換えられないようにする（2026-10-03 監査）。
--
-- `profiles_update_self` は本人の行の更新を全部許すので、ログインした人（お試しの匿名の人も）が
-- 自分の plan を 'pro' に書き換えられた。Supabase は表全体の UPDATE を authenticated に
-- 与えているため、列だけの revoke は効かない。そこで、ブラウザ（authenticated / anon）から
-- plan を変えようとしたら断るトリガーを置く。
--
-- 本番には 2026-10-03 にこの内容で入っている（ここはその記録。何度流しても同じ結果になる）。
-- アプリの plan の書き込みは Stripe の知らせ（`api.stripe-webhook.ts`・service role）だけ。
-- 画面の設定保存（`updateMyProfile`）は plan を送らないので、動きは変わらない。

create or replace function public.guard_profile_plan()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- ブラウザ（PostgREST の authenticated / anon）からは plan を変えさせない。
  -- 変えられるのはサーバ（service_role の Stripe webhook）と管理者の SQL だけ。
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.plan is distinct from 'free' then
        raise exception 'profiles.plan is managed by the server' using errcode = '42501';
      end if;
    elsif new.plan is distinct from old.plan then
      raise exception 'profiles.plan is managed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_plan on public.profiles;
create trigger profiles_guard_plan
  before insert or update on public.profiles
  for each row execute function public.guard_profile_plan();
