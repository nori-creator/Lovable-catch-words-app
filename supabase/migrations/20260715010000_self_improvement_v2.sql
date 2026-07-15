-- 自己改善v2 (2026-07-15):
-- 1) self_improve_runs — 各ステップの実行ログ。「機能してない」を二度と
--    無言にしないための可視化(管理画面に表示)。
-- 2) corpus_pairs — 共起データ。「どの単語がどの単語と一緒に使われるか」の
--    ランキングの土台(同一見出し/文内の語ペア×日×ソース)。
create table if not exists public.self_improve_runs (
  id uuid primary key default gen_random_uuid(),
  step text not null,           -- 'audit' | 'news' | 'synth'
  ok boolean not null,
  detail jsonb,                 -- 件数・エラーメッセージ・フィード別status等
  created_at timestamptz not null default now()
);
alter table public.self_improve_runs enable row level security;
create index if not exists self_improve_runs_created_idx on public.self_improve_runs (created_at desc);

create table if not exists public.corpus_pairs (
  word_a text not null,
  word_b text not null,
  day date not null,
  source text not null default 'news',
  count integer not null default 0,
  primary key (word_a, word_b, day, source)
);
alter table public.corpus_pairs enable row level security;
create policy corpus_pairs_read_authenticated on public.corpus_pairs
  for select to authenticated using (true);
create index if not exists corpus_pairs_day_idx on public.corpus_pairs (day desc, count desc);
