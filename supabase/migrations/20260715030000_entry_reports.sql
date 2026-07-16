-- 辞書エラー報告 (A8, 2026-07-15): 「発音が間違ってる」「品詞が違う」を
-- ユーザーがその場で報告できる恒久ルート。ランダム監査(lexicon_audits)と
-- 相補で、報告は管理画面のレビューキューに並ぶ。
create table if not exists public.entry_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  headword text not null,
  kind text not null check (kind in ('pronunciation', 'meaning', 'pos', 'other')),
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
alter table public.entry_reports enable row level security;
-- 本人は自分の報告を作成・参照できる。更新(状態変更)と全件閲覧は
-- service role(管理画面のサーバー関数)のみ。
create policy entry_reports_insert_own on public.entry_reports
  for insert to authenticated with check (auth.uid() = user_id);
create policy entry_reports_select_own on public.entry_reports
  for select to authenticated using (auth.uid() = user_id);
create index if not exists entry_reports_status_idx on public.entry_reports (status, created_at desc);
