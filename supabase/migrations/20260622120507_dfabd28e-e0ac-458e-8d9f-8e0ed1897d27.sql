
-- profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  native_language TEXT NOT NULL DEFAULT 'ja',
  ui_language TEXT NOT NULL DEFAULT 'ja',
  target_language TEXT NOT NULL DEFAULT 'zh-TW',
  level_goal TEXT NOT NULL DEFAULT 'TOCFL-2',
  pronunciation_strictness TEXT NOT NULL DEFAULT 'normal',
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- categories
CREATE TABLE public.categories (
  key TEXT PRIMARY KEY,
  label_ja TEXT NOT NULL,
  icon_emoji TEXT NOT NULL DEFAULT '📦',
  sort_order INT NOT NULL DEFAULT 100
);
GRANT SELECT ON public.categories TO authenticated, anon;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_select_all" ON public.categories FOR SELECT USING (true);

-- words
CREATE TABLE public.words (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  language TEXT NOT NULL DEFAULT 'zh-TW',
  headword TEXT NOT NULL,
  reading_zhuyin TEXT,
  pinyin TEXT,
  meaning_ja TEXT NOT NULL,
  part_of_speech TEXT,
  level TEXT,
  category_key TEXT REFERENCES public.categories(key),
  example_sentence TEXT,
  example_translation TEXT,
  source TEXT NOT NULL DEFAULT 'seed',
  silhouette_emoji TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (language, headword)
);
GRANT SELECT, INSERT ON public.words TO authenticated;
GRANT SELECT ON public.words TO anon;
GRANT ALL ON public.words TO service_role;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "words_select_all" ON public.words FOR SELECT USING (true);
CREATE POLICY "words_insert_auth" ON public.words FOR INSERT TO authenticated WITH CHECK (true);

-- stickers
CREATE TABLE public.stickers (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE RESTRICT,
  language TEXT NOT NULL DEFAULT 'zh-TW',
  object_image_url TEXT,
  cutout_image_url TEXT,
  selfie_image_url TEXT,
  caption TEXT,
  location_name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stickers TO authenticated;
GRANT ALL ON public.stickers TO service_role;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stickers_select_own" ON public.stickers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "stickers_insert_own" ON public.stickers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stickers_update_own" ON public.stickers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stickers_delete_own" ON public.stickers FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX stickers_user_idx ON public.stickers(user_id, created_at DESC);

-- updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
