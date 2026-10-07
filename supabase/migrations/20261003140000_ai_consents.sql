-- 外部の AI へ送る前の同意の記録（2026-10-03）。
-- Lovable が同じ内容を drizzle/migrations/0003_20261003140000_ai_consents.sql にも書いた（中身は同じ）。
--
-- App Store Review Guideline 5.1.2(i)（第三者の AI へ個人データを送る前にはっきり同意を
-- もらう）と、個人情報保護法 28 条（外国にある第三者への提供の同意）のため。
-- Web 版は確認の画面（components/AiConsentDialog.tsx）、iOS 版は AIConsentView で聞き、
-- サーバの関数（recordAiConsent）がここに書く。AI を呼ぶ関数は、今の版に同意した行が
-- 無ければ断る（src/lib/ai-consent.server.ts の assertAiConsent）。
--
-- - 同意するたびに1行足す（いつ・どの版に同意したか）。取り消しは revoked_at を入れる。
-- - 書くのはサーバの鍵（service_role）だけ。本人は自分の行を読めるだけ（日時を書き換えない）。
-- - 退会（auth.users の削除）で一緒に消える。
-- 何度流しても同じ結果になる。

create table if not exists public.ai_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 同意した内容の版（src/lib/ai-consent.ts の AI_CONSENT_VERSION / iOS の AIConsent.currentVersion）。
  version integer not null,
  agreed_at timestamptz not null default now(),
  -- 取り消した時刻（同意中は null）。
  revoked_at timestamptz,
  -- どこで同意したか（web / ios / guest = 登録前に端末で同意し、登録後に聞き直して記録）。
  source text not null default 'web',
  created_at timestamptz not null default now()
);

alter table public.ai_consents drop constraint if exists ai_consents_version_check;
alter table public.ai_consents add constraint ai_consents_version_check check (version >= 1);
alter table public.ai_consents drop constraint if exists ai_consents_source_check;
alter table public.ai_consents
  add constraint ai_consents_source_check check (source in ('web', 'ios', 'guest'));

create index if not exists ai_consents_user_idx
  on public.ai_consents (user_id, agreed_at desc);

alter table public.ai_consents enable row level security;

revoke all on public.ai_consents from public, anon, authenticated;
grant select on public.ai_consents to authenticated;
grant all on public.ai_consents to service_role;

-- 本人は自分の行を読めるだけ。足す・直す・消す決まり（policy）は置かない
-- = ブラウザからは書けない。サーバの鍵は RLS を通らない。
drop policy if exists ai_consents_select_own on public.ai_consents;
create policy ai_consents_select_own on public.ai_consents
  for select to authenticated using (auth.uid() = user_id);

comment on table public.ai_consents is
  '外部の AI へ送る前の同意の記録（版・同意した時刻・取り消した時刻）。'
  'サーバの鍵だけが書く。src/lib/ai-consent.server.ts。';

-- drizzle 側の写し（同じ内容）: drizzle/migrations/0003_20261003140000_ai_consents.sql
