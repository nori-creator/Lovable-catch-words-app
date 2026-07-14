-- 自己改善システム (2026-07-14):
-- 1) lexicon_audits — 辞書エントリの毎日ランダムAI監査の履歴。
--    service roleのみ書込。読み取りも管理関数経由(RLS有効・ポリシーなし)。
-- 2) corpus_stats — アプリ独自コーパス。台湾ニュース等の見出しから
--    語×日×ソースの頻度だけを蓄積(本文は保存しない=著作権セーフ)。
create table if not exists public.lexicon_audits (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.dictionary_entries(id) on delete cascade,
  headword text not null,
  source text not null,
  ok boolean not null,
  confidence real,
  suggestion jsonb,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.lexicon_audits enable row level security;
create index if not exists lexicon_audits_created_idx on public.lexicon_audits (created_at desc);

create table if not exists public.corpus_stats (
  word text not null,
  day date not null,
  source text not null default 'news',
  count integer not null default 0,
  primary key (word, day, source)
);
alter table public.corpus_stats enable row level security;
-- 頻度統計は個人情報を含まないため、アプリ内表示用に認証ユーザーへ読み取りを開放
create policy corpus_stats_read_authenticated on public.corpus_stats
  for select to authenticated using (true);
create index if not exists corpus_stats_day_idx on public.corpus_stats (day desc, count desc);
