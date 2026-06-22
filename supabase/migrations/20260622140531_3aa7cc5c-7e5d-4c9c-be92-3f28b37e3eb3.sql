-- 1) stickers にvisibilityを追加
ALTER TABLE public.stickers
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private','friends','public'));

-- 2) follows
CREATE TABLE public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows self read" ON public.follows FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);
CREATE POLICY "follows self write" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows self delete" ON public.follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

-- helper: mutual follow check (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.are_mutual_followers(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows f1
    JOIN public.follows f2
      ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
    WHERE f1.follower_id = _a AND f1.following_id = _b
  );
$$;

-- 3) posts
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id uuid REFERENCES public.stickers(id) ON DELETE SET NULL,
  caption text,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('private','friends','public')),
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts visible" ON public.posts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'friends' AND public.are_mutual_followers(auth.uid(), user_id))
  );
CREATE POLICY "posts insert own" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "posts update own" ON public.posts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "posts delete own" ON public.posts FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER posts_updated BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX posts_user_created_idx ON public.posts (user_id, created_at DESC);
CREATE INDEX posts_visibility_created_idx ON public.posts (visibility, created_at DESC);

-- helper to check post visibility for likes/comments policies
CREATE OR REPLACE FUNCTION public.can_see_post(_post_id uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = _post_id AND (
      p.user_id = _user
      OR p.visibility = 'public'
      OR (p.visibility = 'friends' AND public.are_mutual_followers(_user, p.user_id))
    )
  );
$$;

-- 4) post_likes
CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes visible if post visible" ON public.post_likes FOR SELECT TO authenticated
  USING (public.can_see_post(post_id, auth.uid()));
CREATE POLICY "likes insert own" ON public.post_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_see_post(post_id, auth.uid()));
CREATE POLICY "likes delete own" ON public.post_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_post_like_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER post_likes_count_ins AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_like_count();
CREATE TRIGGER post_likes_count_del AFTER DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_like_count();

-- 5) post_comments
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments visible if post visible" ON public.post_comments FOR SELECT TO authenticated
  USING (public.can_see_post(post_id, auth.uid()));
CREATE POLICY "comments insert own" ON public.post_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_see_post(post_id, auth.uid()));
CREATE POLICY "comments delete own" ON public.post_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_post_comment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER post_comments_count_ins AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_comment_count();
CREATE TRIGGER post_comments_count_del AFTER DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_comment_count();
CREATE INDEX post_comments_post_idx ON public.post_comments (post_id, created_at);

-- 6) notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('like','comment','follow')),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications own select" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications own update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications own delete" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

-- trigger to create notifications
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  SELECT user_id INTO target FROM public.posts WHERE id = NEW.post_id;
  IF target IS NOT NULL AND target <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (target, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER post_likes_notify AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  SELECT user_id INTO target FROM public.posts WHERE id = NEW.post_id;
  IF target IS NOT NULL AND target <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (target, NEW.user_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER post_comments_notify AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END; $$;
CREATE TRIGGER follows_notify AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();
