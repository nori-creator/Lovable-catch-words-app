-- 1) words: 署名した本人の行だけ足せるようにする。
--    以前は「ログインしていれば誰でも何でも足せる」だけの検査だった。
--    created_by は BEFORE INSERT トリガ enforce_words_source が auth.uid()
--    を入れるので、通常の追加はそのまま通る。
DROP POLICY IF EXISTS "words_insert_authenticated" ON public.words;
CREATE POLICY "words_insert_own" ON public.words
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- 2) profiles: 「全部通す」をやめ、本人の行か、公開の相手だけに絞る。
--    表示名・写真は他の学習者に見せる必要があるが、まだ設定を終えていない
--    (onboarded = false) 人は一覧に出さない。
DROP POLICY IF EXISTS "profiles_select_public_or_own" ON public.profiles;
CREATE POLICY "profiles_select_public_or_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR onboarded = true);