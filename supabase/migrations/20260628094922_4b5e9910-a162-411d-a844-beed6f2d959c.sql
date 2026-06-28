ALTER TABLE public.words ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS album_bg text NOT NULL DEFAULT 'paper';