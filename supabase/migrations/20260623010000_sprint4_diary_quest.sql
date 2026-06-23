-- Sprint 4: AI振り返り日記 ＋ デイリークエスト

-- 0) profiles にプレミアム判定フラグ（Checker分岐・将来の撮影制限の土台）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

-- 1) diaries（1ユーザー1日1本）
CREATE TABLE public.diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  body_target text,            -- 学習言語（台湾華語）本文
  body_translation text,       -- 日本語訳
  one_liner text,              -- ユーザーの一言感想（任意・スキップ可）
  mood text,                   -- 任意（絵文字等）
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','friends','public')),
  sticker_ids uuid[] NOT NULL DEFAULT '{}',
  place_label text,
  generated_by_ai boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diaries TO authenticated;
GRANT ALL ON public.diaries TO service_role;
ALTER TABLE public.diaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diaries visible" ON public.diaries FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'friends' AND public.are_mutual_followers(auth.uid(), user_id))
  );
CREATE POLICY "diaries insert own" ON public.diaries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "diaries update own" ON public.diaries FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "diaries delete own" ON public.diaries FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER diaries_updated BEFORE UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX diaries_user_date_idx ON public.diaries (user_id, entry_date DESC);

-- 2) quests（1ユーザー1日1件・遅延生成）
CREATE TABLE public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_date date NOT NULL,
  type text NOT NULL DEFAULT 'count' CHECK (type IN ('color','category','count','review')),
  title text NOT NULL,
  description text,
  criteria jsonb NOT NULL DEFAULT '{}',  -- 例: {"color":"red"} / {"category_key":"fruit"}
  target_count integer NOT NULL DEFAULT 1,
  progress integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  reward text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quests TO authenticated;
GRANT ALL ON public.quests TO service_role;
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quests own read" ON public.quests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "quests own insert" ON public.quests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "quests own update" ON public.quests FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "quests own delete" ON public.quests FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER quests_updated BEFORE UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX quests_user_date_idx ON public.quests (user_id, quest_date DESC);
