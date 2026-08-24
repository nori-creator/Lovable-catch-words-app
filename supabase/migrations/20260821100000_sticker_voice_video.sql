-- 2026-08-21
-- 札に「一言の自撮り動画」を1本持たせる。
--
-- オーナーの決定(2026-08-21): 「動画は supabase に上げる **B案**」
-- (= 列を足して、写真と同じ扱いで残す)
--
-- ## なぜ列を足すか
-- A案(端末だけ)は機種変で消える。思い出として残す物なので弱い。
-- C案(列を足さず決め打ちの path を探しに行く)は移行が要らない代わりに、
-- 「在るかどうか」を毎回ストレージに訊きに行くことになり、
-- **一覧を開くたびに札の数だけ問い合わせる**。写真と同じ形で持つのが素直。
--
-- ## 追記だけ
-- 既存の63枚は null のまま。読む側は列が無くても落ちない形にしてあるので、
-- この移行が当たる前でもアプリは動く(一言の動画が撮れないだけ)。
--
-- ## 中身ではなく path を入れる
-- 他の絵と同じで、`stickers` バケットの中の場所だけを持つ。
-- 見せるときに署名付きURLを作る(`src/lib/stickers.functions.ts`)。
-- 置き場所の決め方は `src/lib/voice-video.ts` の `voiceVideoPath` が唯一の正。

alter table public.stickers add column if not exists voice_video_url text;

comment on column public.stickers.voice_video_url is
  'その札に添えた一言の自撮り動画(stickers バケットの中の path)。'
  '札ごとに1本で、撮り直すと上書きされる。null = まだ撮っていない。'
  '置き場所の決め方は src/lib/voice-video.ts の voiceVideoPath と'
  '必ず同じにすること。';
