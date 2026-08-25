-- 2026-08-24
-- 解説を「その語 × 解説の言語 × 母語」の**共有キャッシュ**に分ける。
--
-- ## なぜ要るか — 開くたびに解説を作り直して上書きし合っていた
--
-- `words` は `(language, headword)` で**全ユーザー共有**の1行。ところが解説
-- (`words.extras`)は**読む人の言語と母語で中身が変わる物**なのに、そこに
-- 載っていた。`src/components/StickerSheet.tsx` はこう書いてある:
--
--     const wrongLanguage = !!ex && (ex.explain_lang || "ja") !== uiLang;
--     const wrongL1       = !!ex && (ex.explain_l1   || "ja") !== nativeLang;
--     if (!isEmpty && !missingNewFields && !wrongLanguage && !wrongL1) return;
--
-- 表示言語か母語が違う人が開くと、**カードを開くたびに解説を丸ごと作り直して
-- 上書き**する。日本語の人と韓国語の人が同じ「腳踏車」を持っていたら、
-- 互いに開くたび永久に作り直し合う。
--
--   ・遅い   … 開くたびAI待ち
--   ・高い   … 同じ語のAI呼び出しが利用者数×言語数ぶん永久に発生
--   ・不正確 … 同じ語の解説が開くたび揺れる(4択の選択肢まで揺れた前例あり)
--
-- コード自身が宿題として書き残していた:
--
--   「根本的には『解説の言語』がユーザーごとの持ち物なのに共有の行に載って
--    いるのが問題で、そこを直すには列を足す必要がある(いま流せない)。」
--
-- 英語版を足すとこれが倍になる(台湾人=zh-TW と 日本人=ja が同じ "bicycle" の
-- 行を取り合う)。だから**英語より先にここを直す**。
--
-- ## 分けると、増えるほど速く・安くなる
-- 解説が組み合わせごとの共有キャッシュになるので、誰か1人が最初に払えば
-- **同じ組み合わせの全員が以後ゼロ秒・ゼロ円**。いまは利用者が増えるほど
-- 遅く・高くなっていた。向きが逆になる。
--
-- ## 追記だけ
-- `words.meaning_ja` と `words.extras` は**残す**。本番の139語を壊さない。
-- 読む側が新しい表を先に見て、無ければ古い列に落ちる形にする。
-- この移行が当たる前でもアプリは動く(いままでどおり動くだけ)。

create table if not exists public.word_explanations (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references public.words(id) on delete cascade,
  -- 解説を書いた言語。UI の表示言語と同じ("ja" / "en" / "zh-TW")。
  explain_lang text not null,
  -- 誰の母語向けに書いたか。発音のコツと語順の説明はここで中身が変わる。
  l1 text not null,
  -- 読む人の言語での意味。`words.meaning_ja` の後継。
  meaning text not null default '',
  -- 例文の訳。これも読む人の言語なので、共有の行には置けない。
  example_translation text,
  -- 解説の本体(`src/lib/extras.ts` の ExtrasSchema)。
  extras jsonb not null default '{}'::jsonb,
  -- どこから来た解説か。**画面に必ず出す**(既にある「検証済み/AI生成」の印)。
  --   seed     … 取り込んだ辞書由来
  --   verified … 人が確かめた
  --   ai       … AIが書いた
  source text not null default 'ai' check (source in ('seed', 'verified', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (word_id, explain_lang, l1)
);

-- 引くのは常に「この語の、この言語の、この母語向け」。3つ揃いの索引。
create index if not exists word_explanations_lookup_idx
  on public.word_explanations (word_id, explain_lang, l1);

comment on table public.word_explanations is
  '語の解説を「語 × 解説の言語 × 母語」で持つ共有キャッシュ。'
  'words は全ユーザー共有の1行なので、読む人によって変わる物をそこに置くと'
  '開くたびに作り直して上書きし合う。分けた理由は移行ファイルの上部に詳しい。';

comment on column public.word_explanations.source is
  'seed=取り込んだ辞書 / verified=人が確認 / ai=AI生成。'
  '値の集合は src/lib/word-explanation.ts の EXPLANATION_SOURCES と'
  '必ず同じにすること。';

-- ---------------------------------------------------------------------------
-- 読み書きの権限
--
-- **共有キャッシュなので、読むのは全員。書くのは server だけ。**
-- 誰かの端末から直に書けると、1人が壊した解説が全員に配られる。
-- 生成は必ず server fn(`generateCard`)を通す。
-- ---------------------------------------------------------------------------
alter table public.word_explanations enable row level security;

grant select on public.word_explanations to authenticated, anon;
grant all on public.word_explanations to service_role;
revoke insert, update, delete, truncate on public.word_explanations from authenticated, anon;

drop policy if exists word_explanations_select_all on public.word_explanations;
create policy word_explanations_select_all
  on public.word_explanations for select
  using (true);

-- 端末から書けないことを RLS でも言っておく(権限と二重に守る)。
drop policy if exists word_explanations_no_client_write on public.word_explanations;
create policy word_explanations_no_client_write
  on public.word_explanations for all to authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- いま入っている解説を1回だけ写す
--
-- `words.extras` の `explain_lang` / `explain_l1` が、その解説が誰向けに
-- 書かれたかを既に持っている。空なら旧データ = 日本語話者向けの日本語
-- (`StickerSheet.tsx` の `|| "ja"` と同じ既定)。
--
-- **`on conflict do nothing`。** 移行を二度当てても、後から入った新しい
-- 解説を古い写しで潰さない。
-- ---------------------------------------------------------------------------
insert into public.word_explanations
  (word_id, explain_lang, l1, meaning, example_translation, extras, source)
select
  w.id,
  coalesce(nullif(w.extras->>'explain_lang', ''), 'ja'),
  coalesce(nullif(w.extras->>'explain_l1', ''), 'ja'),
  coalesce(w.meaning_ja, ''),
  w.example_translation,
  coalesce(w.extras, '{}'::jsonb),
  -- 既存はすべて AI 由来。人が確かめた印は付いていない。
  'ai'
from public.words w
where w.meaning_ja is not null and w.meaning_ja <> ''
on conflict (word_id, explain_lang, l1) do nothing;
