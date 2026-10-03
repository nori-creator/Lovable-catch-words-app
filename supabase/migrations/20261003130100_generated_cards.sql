-- サーバが作った語の中身の控え（2026-10-03 監査 H2 / M3）。
--
-- 共有の語（words）と読む人ごとの解説（word_explanations）は全員が同じ行を見る。前は
-- その中身を**画面が送ってきた文**で書いていたので、アプリを通さずに呼べば誰でも好きな文を
-- 共有の行に置けた。
--
-- いまは中身を作るサーバの関数（generateCard・候補を出す suggestWords /
-- suggestWordCandidates / detectScan・チュートリアルのカード）が、作った物をここに控え、
-- 保存の道（upsertWord・updateWordExtras）は**この控えだけ**を共有の行に書く
-- （src/lib/generated-cards.ts）。
--
-- サーバの鍵（service_role）だけが読み書きする。ブラウザ（anon / authenticated）には
-- 何の権限も無い。控えは 14 日で使わなくなり、時々消す。
--
-- この移行が当たる前のアプリは前の動き（送られた物で空の所だけ埋める）のまま動く。
-- 何度流しても同じ結果になる。

create table if not exists public.generated_cards (
  language text not null,
  headword text not null,
  -- どの言語・どの母語向けに書いたカードか（word_explanations の鍵と同じ）。
  -- 候補（kind = 'candidate'）は鍵を持たない（空の文字列）。
  explain_lang text not null default '',
  l1 text not null default '',
  -- card = カード全体 / candidate = 候補の意味と読みだけ。
  kind text not null default 'card',
  -- 共有の行に書いてよい所だけ（意味・読み・品詞・級・分類・例文・例文訳・解説）。
  card jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (language, headword, explain_lang, l1)
);

alter table public.generated_cards
  drop constraint if exists generated_cards_kind_check;
alter table public.generated_cards
  add constraint generated_cards_kind_check check (kind in ('card', 'candidate'));

create index if not exists generated_cards_created_at_idx
  on public.generated_cards (created_at);

alter table public.generated_cards enable row level security;

-- 決まり（policy）は置かない = ブラウザからは何もできない。サーバの鍵は RLS を通らない。
revoke all on public.generated_cards from public, anon, authenticated;
grant all on public.generated_cards to service_role;

comment on table public.generated_cards is
  'サーバが作った語の中身の控え。共有の words / word_explanations にはここから書く'
  '（画面の送った文は書かない）。service_role だけが触る。src/lib/generated-cards.ts。';
