-- 2026-08-02
-- 1日の復習上限。以前は「開くたびに新しい単語が無限に出る」状態で、
-- 終わりが見えず復習が苦行になっていた(NORI指摘)。
--   review_daily_limit  : 1日に出す最大枚数(0 = 無制限)
--   review_stage_focus  : どの記憶段階を優先して出すか
--       'all'      = 期限が来たものを均等に
--       'weak'     = 忘れかけ(記憶率が低いもの)を優先
--       'new'      = 覚えたての回数が少ないものを優先
alter table public.profiles
  add column if not exists review_daily_limit integer not null default 20,
  add column if not exists review_stage_focus text not null default 'all';

-- 上限は現実的な範囲に閉じ込める(0=無制限、最大200)。
alter table public.profiles
  drop constraint if exists profiles_review_daily_limit_range;
alter table public.profiles
  add constraint profiles_review_daily_limit_range
  check (review_daily_limit >= 0 and review_daily_limit <= 200);

alter table public.profiles
  drop constraint if exists profiles_review_stage_focus_valid;
alter table public.profiles
  add constraint profiles_review_stage_focus_valid
  check (review_stage_focus in ('all', 'weak', 'new'));

comment on column public.profiles.review_daily_limit is
  'Max cards shown per local day. 0 = unlimited.';
comment on column public.profiles.review_stage_focus is
  'Which memory stage to prioritise when picking due cards: all | weak | new.';
