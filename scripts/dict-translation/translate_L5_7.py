#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Catchwords 辞書 レベル5〜7 日本語訳 一括生成スクリプト
=====================================================
使い方(Claude Codeのターミナルで):
  1. このファイルと catchwords-dict-ALL-master.csv を同じフォルダに置く
  2. 環境変数を設定:  export GEMINI_API_KEY="あなたのキー"
  3. 実行:            python3 translate_L5_7.py
  4. 出力: catchwords-dict-L5-7-import-part1.csv, part2.csv...(管理ページに1つずつ貼る)
          catchwords-dict-L5-7-review.csv(英語照合つき目視チェック用)
          needs_review.csv(自動チェックに引っかかった要確認行)

ハルシネーション対策(3層):
  A) CEDICT英語訳(en_ref)をプロンプトに同梱 → Geminiは翻訳の「答え合わせ」を見ながら訳す
  B) 応答はJSON形式限定・件数一致・ID一致を機械検証。不一致はリトライ(最大3回)
  C) 疑わしい行(空・見出し語と同じ・英語のまま等)を needs_review.csv に自動隔離
"""
import csv, json, os, sys, time, urllib.request

API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-3.1-flash-lite"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
BATCH = 50          # 1回のAPI呼び出しで訳す語数
CHUNK = 1000        # 出力CSVを何行ごとにファイル分割するか(管理ページ貼り付け用)
MASTER = "catchwords-dict-ALL-master.csv"

def call_gemini(items):
    """items: [{id, headword, pinyin, pos, en}] → {id: 日本語訳}"""
    lines = [f"{it['id']}\t{it['headword']}\t{it['pinyin']}\t{it['pos']}\t{it['en'] or '(参考訳なし)'}" for it in items]
    prompt = (
        "あなたは台湾華語→日本語の辞書編集者です。以下の各行(ID\\t単語\\t拼音\\t品詞\\t英語参考訳)について、"
        "日本語学習者向けの簡潔な訳語(15字以内目安、複数語義は/区切り)を作ってください。\n"
        "厳守: 英語参考訳と矛盾しないこと。参考訳がない語は慎重に。日本語の漢字をそのまま流用せず意味で訳すこと。\n"
        "出力はJSON配列のみ: [{\"id\": 数値, \"ja\": \"訳\"}, ...]。説明文・コードブロック記号は禁止。\n\n"
        + "\n".join(lines)
    )
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
    }).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as res:
        data = json.loads(res.read())
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    arr = json.loads(text)
    return {int(x["id"]): str(x["ja"]).strip() for x in arr}

def suspicious(head, ja, en):
    if not ja: return "空"
    if ja == head: return "見出し語と同一"
    if all(ord(c) < 128 for c in ja): return "英語のまま"
    if len(ja) > 40: return "長すぎ"
    return ""

def main():
    if not API_KEY:
        sys.exit("GEMINI_API_KEY が設定されていません。 export GEMINI_API_KEY=... を実行してください")
    rows = list(csv.DictReader(open(MASTER, encoding="utf-8")))
    done = {r["headword"]: r for r in rows if r["meaning_ja"]}          # L1-4(訳済み)
    todo = [r for r in rows if not r["meaning_ja"]]
    # 同一バッチ内の重複headwordを統合(DBのupsert衝突防止)
    seen = {}
    merged_todo = []
    for r in todo:
        h = r["headword"]
        if h in seen:
            old = seen[h]
            old["zhuyin"] += " / " + r["zhuyin"]; old["pinyin"] += " / " + r["pinyin"]
            if r["pos"] not in old["pos"]: old["pos"] += "/" + r["pos"]
            old["notes"] = "多音字/多義語: 複数の発音・意味を統合"
        else:
            seen[h] = r; merged_todo.append(r)
    todo = merged_todo
    print(f"翻訳対象: {len(todo)}語(重複統合後) / バッチ数: {(len(todo)+BATCH-1)//BATCH}")

    results, flagged = [], []
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i+BATCH]
        items = [{"id": j, "headword": r["headword"], "pinyin": r["pinyin"],
                  "pos": r["pos"], "en": r.get("en_ref", "")} for j, r in enumerate(chunk)]
        got = None
        for attempt in range(3):
            try:
                got = call_gemini(items)
                if len(got) == len(items): break
                print(f"  件数不一致({len(got)}/{len(items)})、リトライ {attempt+1}")
            except Exception as e:
                print(f"  エラー: {e} リトライ {attempt+1}"); time.sleep(5 * (attempt + 1))
        if not got:
            print(f"バッチ {i//BATCH+1} 失敗。スキップして続行(後で needs_review 参照)")
            for r in chunk: flagged.append({**r, "flag": "API失敗"})
            continue
        for j, r in enumerate(chunk):
            ja = got.get(j, "")
            flag = suspicious(r["headword"], ja, r.get("en_ref", ""))
            r["meaning_ja"] = ja
            r["source"] = "ai"
            if flag: flagged.append({**r, "flag": flag})
            else: results.append(r)
        print(f"バッチ {i//BATCH+1}/{(len(todo)+BATCH-1)//BATCH} 完了 (累計 {len(results)}語)")
        time.sleep(1.2)   # 無料枠のRPM制限対策

    # L1-4と同形の語は統合行に(upsert上書き対策)
    final = []
    for r in results:
        h = r["headword"]
        if h in done:
            old = done[h]
            r["meaning_ja"] = f"{old['meaning_ja']} / {r['meaning_ja']}"
            r["zhuyin"] = f"{old['zhuyin']} / {r['zhuyin']}"; r["pinyin"] = f"{old['pinyin']} / {r['pinyin']}"
            r["tocfl_level"] = old["tocfl_level"]
            r["notes"] = "多音字/多義語: 複数の発音・意味を統合"
        final.append(r)

    cols = ["headword","meaning_ja","zhuyin","pinyin","pos","tocfl_level","taiwan_usage","source","entry_type","scene_tags","notes"]
    for p in range(0, len(final), CHUNK):
        n = p // CHUNK + 1
        with open(f"catchwords-dict-L5-7-import-part{n}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(final[p:p+CHUNK])
    with open("catchwords-dict-L5-7-review.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols+["en_ref"], extrasaction="ignore"); w.writeheader(); w.writerows(final)
    if flagged:
        with open("needs_review.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols+["en_ref","flag"], extrasaction="ignore"); w.writeheader(); w.writerows(flagged)
    print(f"\n完了: 訳成功 {len(final)}語 / 要確認 {len(flagged)}語")
    print(f"出力ファイル: import-part1〜{(len(final)+CHUNK-1)//CHUNK}, review, needs_review")

if __name__ == "__main__":
    main()
