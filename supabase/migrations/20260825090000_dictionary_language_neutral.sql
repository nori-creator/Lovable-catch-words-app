-- 2026-08-25
-- 種辞書を**言語に依らない形**にする（第3段）。
--
-- ## なぜ要るか
-- `dictionary_entries` は台湾華語しか想定していない形になっている:
--
--   zhuyin / pinyin  … 注音と拼音。英語には無い（代わりに米式/英式の IPA）
--   meaning_ja       … 日本語の意味。**台湾の学習者には中文が要る**
--   tocfl_level      … TOCFL の級。英語は CEFR
--   taiwan_usage     … 「台湾での使われ方」。英語にもある概念だが名前が合わない
--
-- 英語版のために列を足す。**古い列は消さない** — 本番の 7,281 行を壊さない。
-- 読む側は新しい列を先に見て、無ければ古い列に落ちる。
--
-- ## 意味は言語ごとに持つ
-- `meaning_ja` を「読む人の言語の意味」に読み替えると、日本語の人と台湾の人が
-- 同じ行を取り合う（`words` で実際に起きた形。`word_explanations` を作った
-- 理由と同じ）。**表ではなく列の中で分ける**:
--
--   meanings = {"ja": "自転車", "zh-TW": "腳踏車", "en": "a wheeled vehicle…"}
--
-- 種辞書は「誰かが最初に払う」物ではなく最初から全部入っているので、
-- `word_explanations` のように行を分けるまでもない。jsonb で足りる。
--
-- ## 追記だけ
-- この移行が当たる前でもアプリは動く（英語の語が引けないだけ）。

alter table public.dictionary_entries
  -- 読み。台湾華語は注音/拼音、英語は米式/英式の IPA。
  add column if not exists reading_primary text,
  add column if not exists reading_alt text,
  -- 読む人の言語ごとの意味。`{"ja": "…", "zh-TW": "…", "en": "…"}`
  add column if not exists meanings jsonb not null default '{}'::jsonb,
  -- 級（1〜6）。どの体系かは `language` で決まる（TOCFL / CEFR）。
  add column if not exists level_step int,
  -- 活用。英語だけ（`{"plural": "bicycles", "past": "bicycled", …}`）。
  add column if not exists forms jsonb,
  -- 頻度の順位（COCA を先に、無ければ BNC）。小さいほどよく使う。
  add column if not exists freq_rank int,
  -- 検定の印（`{toefl,ielts,cet4,…}`）。図鑑の「この資格まであと何語」に使う。
  add column if not exists exam_tags text[],
  -- 使われ方。`taiwan_usage` の言語に依らない名前。
  add column if not exists usage_register text;

-- 級は6段の中だけ。**名前を付けて足す** — 名前を付けないと Postgres が
-- 決めてしまい、後で広げるときに「たぶんこの名前」で撃つことになる。
alter table public.dictionary_entries
  drop constraint if exists dictionary_entries_level_step_valid;
alter table public.dictionary_entries
  add constraint dictionary_entries_level_step_valid
  check (level_step is null or (level_step >= 1 and level_step <= 6));

alter table public.dictionary_entries
  drop constraint if exists dictionary_entries_usage_register_valid;
alter table public.dictionary_entries
  add constraint dictionary_entries_usage_register_valid
  check (usage_register is null or usage_register in ('common', 'written', 'spoken', 'rare'));

-- 取り込んだ辞書由来の行に付ける印。既にある「検証済み / AI生成」に足す。
-- **広げるだけ** — 既存の 'verified' / 'ai' はそのまま通る。
alter table public.dictionary_entries
  drop constraint if exists dictionary_entries_source_check;
alter table public.dictionary_entries
  add constraint dictionary_entries_source_check
  check (source in ('verified', 'ai', 'dict'));

-- 英語の語は 25,000 行を超える。`meaning_ja` は台湾華語の行にしか無いので、
-- **必須をやめる**。制約をゆるめるだけで、入っている値は1つも触らない。
alter table public.dictionary_entries alter column meaning_ja drop not null;

-- ---------------------------------------------------------------------------
-- いま入っている 7,281 行を新しい列へ写す（1回だけ・上書きしない）
-- ---------------------------------------------------------------------------
-- **`tocfl_level = 7` は級ではなく「級外」。**
-- 本番を数えたら 7 が 2,662行（全体の37%）あった。打ち間違いではなく、
-- 辞書を貯める側が「6級より上」の意味で入れてきた決めごとで、
-- `parseLevelStep` も 7 を `LEVEL_OUT` に読む。つじつまは合っている。
--
-- `level_step` は 1〜6 しか持たない（`LEVEL_INDEXES` と同じ）。7 をそのまま
-- 入れると検査制約に弾かれるし、入れられるようにすると「級」と「級外」が
-- 同じ列で混ざって、どちらの意味か分からなくなる。**級外は null にする。**
-- 台湾華語の行は `tocfl_level` が残っているので、読む側は
-- `coalesce(level_step, tocfl_level)` を `parseLevelStep` に通せば
-- 級外も「分からない」も今までどおり区別できる。
update public.dictionary_entries
   set reading_primary = coalesce(reading_primary, zhuyin),
       reading_alt     = coalesce(reading_alt, pinyin),
       level_step      = coalesce(level_step, nullif(least(tocfl_level, 7), 7)),
       usage_register  = coalesce(usage_register, taiwan_usage)
 where reading_primary is null
    or reading_alt is null
    or level_step is null
    or usage_register is null;

-- 意味は jsonb へ。**既に入っている物を潰さない**（`||` は右が勝つので、
-- 空の時だけ入るように左右を置く）。
update public.dictionary_entries
   set meanings = jsonb_build_object('ja', meaning_ja) || meanings
 where meaning_ja is not null
   and meaning_ja <> ''
   and not (meanings ? 'ja');

-- ---------------------------------------------------------------------------
-- 索引
--
-- 英語版で 25,000 行を引くので、引き方に合わせて足す。
--   ・見出しで引く            … 既にある `(language, headword)`
--   ・「この級の未取得の語」   … 図鑑のシルエット
--   ・「頻度上位から」        … 復習の候補
-- ---------------------------------------------------------------------------
create index if not exists dictionary_entries_level_idx
  on public.dictionary_entries (language, level_step);
create index if not exists dictionary_entries_freq_idx
  on public.dictionary_entries (language, freq_rank);

comment on column public.dictionary_entries.meanings is
  '読む人の言語ごとの意味。{"ja": "…", "zh-TW": "…", "en": "…"}。'
  '古い meaning_ja は残してあるが、読む側はこちらを先に見ること。';
comment on column public.dictionary_entries.level_step is
  '級（1〜6）。体系は language で決まる（zh-TW=TOCFL / en=CEFR）。'
  '値の意味は src/lib/level-scale.ts の LEVEL_INDEXES と必ず同じにすること。';
comment on column public.dictionary_entries.source is
  'verified=人が確認 / ai=AI生成 / dict=取り込んだ辞書。'
  'dict の出所は notes に書く（ECDICT・CMUdict・CEFR-J）。';
