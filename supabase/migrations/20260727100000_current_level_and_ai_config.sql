-- 2026-07-27
-- 1) TOCFL の「現在レベル」を保存(目標だけでは i+1 の調整ができない)
-- 2) AIモデルの切替表(管理者のみ書き込み) — provider/model を無停止で変更する
alter table public.profiles
  add column if not exists current_level text;

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_config enable row level security;

-- 読み取りは認証ユーザー全員(クライアントが現在のモデル名を表示できる)
drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config
  for select to authenticated using (true);

-- 書き込みは admin のみ
drop policy if exists app_config_write on public.app_config;
create policy app_config_write on public.app_config
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

comment on table public.app_config is
  'Runtime switches (AI models etc). Readable by all, writable by admins only.';
