-- apple_tokens に「token を出した相手（client_id）」を足す（2026-10-05）。
-- Lovable が同じ内容を drizzle/migrations/0005_apple_tokens_client_id.sql にも書いた（中身は同じ）。
--
-- iOS 版の「Apple でサインイン」（ASAuthorizationAppleIDCredential）の authorizationCode は
-- iOS の bundle id（com.nori.catchwords）に向けて出る。それを引き換えた refresh token は、
-- 退会の取り消し（https://appleid.apple.com/auth/revoke）でも client_id = bundle id で送らないと
-- Apple が invalid_client で断る（App Store Review Guideline 5.1.1(v) / TN3194）。
-- そこで行ごとに、どの client_id に出た token かを覚える。
--
-- - null = Web（Supabase の Apple ログインの Services ID。APPLE_SERVICES_ID）。これまでの行はすべて null。
-- - iOS の行は bundle id（src/lib/apple-token.functions.ts の storeAppleAuthCode が置く）。
-- - 読み書きはこれまでどおりサーバの鍵（service_role）だけ（RLS・権限は変えない）。
-- 何度流しても同じ結果になる。

alter table public.apple_tokens add column if not exists client_id text;

comment on column public.apple_tokens.client_id is
  'token を出した Apple の client_id。null = Web の Services ID、iOS は bundle id。'
  'src/lib/apple-revoke.server.ts。';