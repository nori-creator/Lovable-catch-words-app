
-- 1. app_role enum + user_roles table
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users can view own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Seed: grant admin to the initial user
insert into public.user_roles (user_id, role)
values ('21b1c42a-9456-4a58-8624-46aa3abb632f', 'admin')
on conflict do nothing;

-- 2. dictionary_entries table (verified dictionary zone)
create table public.dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  headword text not null,
  language text not null default 'zh-TW',
  zhuyin text,
  pinyin text,
  meaning_ja text not null,
  pos text,
  tocfl_level int,
  taiwan_usage text check (taiwan_usage in ('common','written','spoken','rare')),
  audio_path text,
  source text not null default 'verified' check (source in ('verified','ai')),
  entry_type text not null default 'word' check (entry_type in ('word','phrase')),
  scene_tags text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (language, headword, entry_type)
);

create index dictionary_entries_headword_idx on public.dictionary_entries (language, headword);
create index dictionary_entries_source_idx on public.dictionary_entries (source);

grant select on public.dictionary_entries to authenticated, anon;
grant all on public.dictionary_entries to service_role;

alter table public.dictionary_entries enable row level security;

-- Anyone (incl. anon for SSR/public reads) can read; no client-side writes.
create policy "Anyone can read dictionary"
  on public.dictionary_entries for select
  to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies → writes only via service_role (server functions).

create trigger dictionary_entries_set_updated_at
  before update on public.dictionary_entries
  for each row execute function public.set_updated_at();

-- 3. scan_events table (silent scan log)
create table public.scan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  headword text not null,
  meaning_ja text,
  kind text not null check (kind in ('object','text')),
  confidence numeric,
  tapped boolean not null default false,
  caught boolean not null default false,
  lat numeric,
  lng numeric,
  created_at timestamptz not null default now()
);

create index scan_events_user_created_idx on public.scan_events (user_id, created_at desc);
create index scan_events_user_headword_idx on public.scan_events (user_id, headword);

grant select, insert, update, delete on public.scan_events to authenticated;
grant all on public.scan_events to service_role;

alter table public.scan_events enable row level security;

create policy "Users read own scan events"
  on public.scan_events for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own scan events"
  on public.scan_events for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own scan events"
  on public.scan_events for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own scan events"
  on public.scan_events for delete
  to authenticated
  using (auth.uid() = user_id);
