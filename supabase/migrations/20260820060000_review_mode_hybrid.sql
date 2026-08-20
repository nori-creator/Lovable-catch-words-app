-- 2026-08-20
-- 復習の出題形式に「おまかせ」を足す。
--
-- ## なぜ制約から直すのか — 先月と同じ罠がここにも在る
-- `profiles.review_mode` は
-- `check (review_mode in ('speaking','choice'))`
-- (`20260708010000_phase_a_foundation.sql:25-26`)。
--
-- ここを広げずに zod の enum だけに `'hybrid'` を足すと、**保存が毎回
-- 制約違反で落ちる**。`dictionary_entries.taiwan_usage` に自由文を書いて
-- 辞書の蓄積が2か月まるごと死んでいたのと同じ形で、
-- 違うのは「今度は書く前に気づいた」ことだけ。だから制約が先。
--
-- ## 名前で消さない
-- 元の制約は列定義に直接書かれていて、名前は Postgres が付けている
-- (`profiles_review_mode_check` のはず)。**「はず」で `drop constraint
-- if exists` を撃つと、名前が違ったときに黙って何も消えない** —
-- 新しい制約が足されるだけで、古い狭いほうが残って 'hybrid' を弾き続ける。
-- 失敗したことに気づけない消し方はしない。
-- だから `review_mode` に触れている検査制約を**定義から探して**全部落とす。

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%review_mode%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.profiles
  add constraint profiles_review_mode_valid
  check (review_mode in ('speaking', 'choice', 'hybrid'));

comment on column public.profiles.review_mode is
  '復習の出題形式。speaking=いつも発話 / choice=いつも4択 / '
  'hybrid=記憶の段階に合わせる(忘れかけ→4択、うろ覚え→発音、覚えた→作文発話)。';
