-- 単語帳の取り込み(オーナー指摘 2026-08-20)
--
--   「単語帳の取り込みは単語帳を写真撮ったら、そこにある単語のカードを
--    一括で作成でき、復習も図鑑の単語とは別に、単語帳を選択すると
--    単語帳で取り込んだものを SRS で復習できるように。」
--
-- ## なぜ図鑑(stickers)に混ぜないか
-- 図鑑は「街で出会って**自分で撮った**物」の記録という約束で作ってある。
-- 単語帳から取り込んだ語には写真も場所も無いので、混ぜると図鑑の意味が
-- 変わる(そして写真の無い札が並ぶ)。**復習側の本棚**として別に持つ。
--
-- ## SRS の算法は共有し、置き場所だけ分ける
-- 間隔の計算は `src/lib/srs.ts` の `nextSrs` をそのまま使う。ここに
-- 別の計算を書くと、同じ「復習」が2種類の理屈で動くことになる。
-- 列は `reviews` と同じ名前にして、読み替えを要らなくする。
--
-- 追記のみ。既存の表には触れない。

CREATE TABLE public.wordbooks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wordbook_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wordbook_id uuid NOT NULL REFERENCES public.wordbooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  headword text NOT NULL,
  reading_zhuyin text,
  pinyin text,
  meaning_ja text,
  -- SRS(図鑑とは別に回す)。既定は `reviews` と揃える。
  ease numeric NOT NULL DEFAULT 2.5,
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 同じ単語帳に同じ語を二度入れない(撮り直しで重複が増えるのを防ぐ)。
  UNIQUE (wordbook_id, headword)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordbooks TO authenticated;
GRANT ALL ON public.wordbooks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordbook_entries TO authenticated;
GRANT ALL ON public.wordbook_entries TO service_role;

ALTER TABLE public.wordbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wordbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordbooks_select_own" ON public.wordbooks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "wordbooks_insert_own" ON public.wordbooks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "wordbooks_update_own" ON public.wordbooks
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "wordbooks_delete_own" ON public.wordbooks
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "wordbook_entries_select_own" ON public.wordbook_entries
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "wordbook_entries_insert_own" ON public.wordbook_entries
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "wordbook_entries_update_own" ON public.wordbook_entries
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "wordbook_entries_delete_own" ON public.wordbook_entries
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX wordbooks_user_created_idx ON public.wordbooks (user_id, created_at DESC);
CREATE INDEX wordbook_entries_book_due_idx ON public.wordbook_entries (wordbook_id, due_at);
CREATE INDEX wordbook_entries_user_due_idx ON public.wordbook_entries (user_id, due_at);
