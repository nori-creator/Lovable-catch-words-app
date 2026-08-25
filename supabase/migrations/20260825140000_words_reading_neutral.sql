-- 2026-08-25
-- 保存した語の**読みを言語に依らない形**にする（第4段）。
--
-- ## なぜ要るか
-- `dictionary_entries` は 20260825090000 で `reading_primary` / `reading_alt`
-- を持った（英語は米式/英式の IPA）。ところが**利用者が保存する `words` は
-- 直っていない** — 列は `reading_zhuyin` と `pinyin` の2つだけ。
--
-- このまま英語を学習言語に足すと、種辞書に IPA が在っても、カードに写した
-- 瞬間に**行き場が無くなる**。逃げ道として `pinyin` に IPA を入れると、
-- 「pinyin という名前の列に拼音でない物が入っている」状態になり、
-- 拼音として読む所（読み上げ・検索・注音との対）が静かに壊れる。
--
-- ## 追記だけ
-- 古い2列は**消さない**。本番の 149 行はそちらに入っている。
-- 読む側（`phonetic.tsx` の `pickReadingOf`）は新しい列を先に見て、
-- 無ければ古い列に落ちる。この移行が当たる前でもアプリは動く
-- （英語の語に読みが出ないだけ）。
--
-- ## 台湾華語の行は触らない
-- backfill で `reading_primary` に注音を写すこともできるが、**やらない**。
-- 2箇所に同じ物が入ると、片方だけ直す事故が起きる。古い言語は古い列を
-- 使い続け、新しい言語だけが新しい列を使う。

alter table public.words
  -- 第一の読み。台湾華語は注音（旧 `reading_zhuyin` を使い続ける）、
  -- 英語は米式の IPA。
  add column if not exists reading_primary text,
  -- 第二の読み。台湾華語は拼音（旧 `pinyin`）、英語は英式の IPA。
  add column if not exists reading_alt text;
