-- Lovable が drizzle/migrations/0004_20261003150000_apple_tokens.sql にも同じ内容で書いている。
-- 「Apple でサインイン」の token の置き場所（2026-10-03）。
-- Lovable が同じ内容を drizzle/migrations/0004_20261003150000_apple_tokens.sql にも書いた（中身は同じ）。
--
-- Apple の決まり（退会できるアプリは、退会のときに Apple の許可を取り消す。TN3194）のため、
-- Apple でサインインした直後に Supabase が1回だけ渡す provider_refresh_token をサーバに預け、
-- 退会（deleteMyAccount）のときに https://appleid.apple.com/auth/revoke で取り消す
-- （src/lib/apple-revoke.ts / apple-revoke.server.ts）。
--
-- - **サーバの鍵（service_role）だけが読み書きする。** ブラウザ（anon / authenticated）には
--   何の権限も無く、決まり（policy）も置かない = RLS ですべて断る。
-- - 退会（auth.users の削除）で一緒に消える（取り消しの後にサーバが先に消す）。
-- 何度流しても同じ結果になる。

create table if not exists public.apple_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Apple の refresh token（無ければ access token）。返事にも記録にも出さない。
  token text not null,
  token_type text not null default 'refresh_token',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apple_tokens drop constraint if exists apple_tokens_type_check;
alter table public.apple_tokens
  add constraint apple_tokens_type_check check (token_type in ('refresh_token', 'access_token'));

alter table public.apple_tokens enable row level security;
alter table public.apple_tokens force row level security;

revoke all on public.apple_tokens from public, anon, authenticated;
grant all on public.apple_tokens to service_role;

comment on table public.apple_tokens is
  'Apple でサインインの token（退会のときに Apple の許可を取り消すため）。service_role だけが触る。'
  'src/lib/apple-revoke.server.ts。';
