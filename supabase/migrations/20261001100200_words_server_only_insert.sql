-- 共有の語（words）を、ブラウザから**足せない**ようにする（2026-10-01）。
--
-- **`upsertWord` がサーバの権限で足す版（stickers.functions.ts）を公開した後に流す。**
-- 本番 DB には 2026-10-02 に適用済み（公開の確認の後）。適用までは docs/pending-migrations/ に置いていた。
-- 先に流すと、古い版のアプリは語を足せず、撮った語が保存できなくなる。
--
-- 閉じる理由: words は (language, headword) で全員が同じ行を見る。ブラウザから
-- 足せると、アプリを通さずに中身を決めた行を先に置けてしまい、後から同じ語を撮った
-- 全員がその行を見る。

drop policy if exists words_insert_own on public.words;
revoke insert on public.words from authenticated;
