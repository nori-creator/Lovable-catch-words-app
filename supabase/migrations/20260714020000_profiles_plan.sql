-- Phase C 土台: 課金プラン。サーバー(service role)だけが変更できる —
-- authenticated には SELECT のみ GRANT し、UPDATE 権限は与えない
-- (updateMyProfile の zod 許可リストにも plan は含めない、二重防御)。
alter table public.profiles
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'pro'));

-- profiles は列単位GRANT運用(2026-07-12の意思決定ログ参照)。新列には
-- 権限が付かないので、自分の行の読み取り用に SELECT のみ明示付与する。
grant select (plan) on public.profiles to authenticated;
