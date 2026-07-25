-- 図鑑カテゴリーの不具合修正 (2026-07-23):
-- upsertWord は categories テーブルに存在しないキーを 'other' に落とす実装。
-- ところが表には 20 キーしか無く、コード側(CATEGORY_KEYS)は 54 キーを使うため、
-- body / kitchenware / tool / medicine / document / person / jewelry などに
-- 分類された語がすべて「その他」に潰れていた(「ほとんどその他になる」の原因)。
-- ラベルと絵文字は dex.tsx の prettifyCategory と一致させている。
insert into categories (key, label_ja, icon_emoji, sort_order) values
  ('transport','交通','🚆',21),
  ('flower','花','🌸',22),
  ('sign','看板','🪧',23),
  ('shop','お店','🏪',24),
  ('kitchenware','調理器具','🍳',25),
  ('tool','道具','🔧',26),
  ('shoes','靴','👟',27),
  ('bag','バッグ','👜',28),
  ('jewelry','ジュエリー','💍',29),
  ('book','本','📚',30),
  ('gadget','ガジェット','🖱️',31),
  ('toy','おもちゃ','🧸',32),
  ('game','ゲーム','🎮',33),
  ('sport','スポーツ','⚽',34),
  ('instrument','楽器','🎸',35),
  ('sky','空','☀️',36),
  ('water','水','💧',37),
  ('mountain','山','⛰️',38),
  ('body','体の部位','🖐️',39),
  ('face','顔','😊',40),
  ('hand','手','🖐️',41),
  ('clothing_part','服の部分','👔',42),
  ('person','人','🧑',43),
  ('family','家族','👨‍👩‍👧',44),
  ('job','仕事','💼',45),
  ('art','アート','🎨',46),
  ('decoration','装飾','🎊',47),
  ('character','文字','🔤',48),
  ('symbol','記号','🔣',49),
  ('color','色','🎨',50),
  ('shape','形','🔷',51),
  ('money','お金','💰',52),
  ('document','書類','📄',53),
  ('medicine','薬・日用品','💊',54)
on conflict (key) do nothing;
