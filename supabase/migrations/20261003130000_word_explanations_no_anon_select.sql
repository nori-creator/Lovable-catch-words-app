-- 読む人ごとの解説（word_explanations）を、ログインしていない人（anon）から読めなくする。
-- （2026-10-03 監査 H1）
--
-- 20260824120000_word_explanations.sql は「共有キャッシュなので読むのは全員」として
-- anon にも SELECT を与えていた。ところがこの表には、その人の記録から作った例文が
-- 入り得た（`runSectionRegen` が一言・場所・日記を材料にしていた。コードは同じ回で直した）。
-- 鍵（anon key）はアプリに入っているので、誰でも全部の行を読めた。
--
-- アプリは anon でこの表を読まない（読むのはすべてログインした人の権限の server fn か、
-- サーバの鍵: `getWordExplanation` / `getReaderMeanings` / `fillReaderMeanings` /
-- `tts-share.ts`）。チュートリアル（ゲスト）の道もこの表に触らない。
--
-- 何度流しても同じ結果になる。

revoke select on public.word_explanations from anon;

-- 読む決まりも、ログインした人だけに絞る（権限と二重に守る）。
drop policy if exists word_explanations_select_all on public.word_explanations;
create policy word_explanations_select_all
  on public.word_explanations for select
  to authenticated
  using (true);
