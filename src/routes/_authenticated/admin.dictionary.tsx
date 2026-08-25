import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "@/lib/target-lang";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  checkIsAdmin,
  importDictionaryEntries,
  searchDictionaryEntries,
  type DictionaryImportRow,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/dictionary")({
  head: () => ({ meta: [{ title: "辞書管理 — Catchwords" }] }),
  component: DictionaryAdminPage,
});

// Minimal CSV parser supporting quoted fields and escaped quotes.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        if (row.some((v) => v.length > 0)) rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  return rows;
}

/**
 * CSV の見出しの読み替え。
 *
 * **古い名前も受け続ける。** 台湾華語の辞書は `zhuyin` / `pinyin` /
 * `tocfl_level` の名前で入れてあるので、その CSV が明日から通らなく
 * なると、入れ直せなくなる。
 */
const HEADER_ALIASES: Record<string, keyof DictionaryImportRow> = {
  headword: "headword",
  // 読み。台湾華語は注音/拼音、英語は米式/英式の IPA。
  reading_primary: "reading_primary",
  zhuyin: "reading_primary",
  ipa_us: "reading_primary",
  reading_alt: "reading_alt",
  pinyin: "reading_alt",
  ipa_uk: "reading_alt",
  // 意味。`meanings` は JSON、`meaning_ja` は古い1言語の欄。
  meanings: "meanings",
  meaning_ja: "meaning_ja",
  meaning: "meaning_ja",
  pos: "pos",
  // 級。`level_step` が新しい名前で、`tocfl_level` は古い名前。
  level_step: "level_step",
  level: "level_step",
  tocfl_level: "tocfl_level",
  tocfl: "tocfl_level",
  cefr: "level_step",
  freq_rank: "freq_rank",
  freq: "freq_rank",
  exam_tags: "exam_tags",
  exams: "exam_tags",
  forms: "forms",
  usage_register: "usage_register",
  taiwan_usage: "taiwan_usage",
  usage: "taiwan_usage",
  source: "source",
  entry_type: "entry_type",
  type: "entry_type",
  scene_tags: "scene_tags",
  tags: "scene_tags",
  notes: "notes",
};

/** JSON の欄（`meanings` / `forms`）。壊れていたら空にして行は残す。 */
function parseJsonCell(v: string): Record<string, string> | null {
  try {
    const o = JSON.parse(v) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(o as Record<string, unknown>)) {
      if (typeof val === "string" && val.trim()) out[k] = val;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** CSV を行に。**外に出しているのは試験のため** — 生成した CSV が本当に
 * この関数を通るかを、生成の側ではなく取り込みの側で確かめる。 */
export function csvToRows(csv: string): DictionaryImportRow[] {
  const table = parseCSV(csv.trim());
  if (table.length < 2) throw new Error("CSVにヘッダー行 + 1行以上必要です");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const keys = header.map((h) => HEADER_ALIASES[h] ?? null);
  // **意味の欄は `meanings` でも `meaning_ja` でもよい。** 英語の辞書は
  // 読む人の言語ごとに `meanings` を持つので、`meaning_ja` は空になる。
  if (!keys.includes("headword")) throw new Error("CSVヘッダーに headword が必要です");
  if (!keys.includes("meaning_ja") && !keys.includes("meanings")) {
    throw new Error("CSVヘッダーに meanings か meaning_ja のどちらかが必要です");
  }
  const NUM: (keyof DictionaryImportRow)[] = ["level_step", "tocfl_level", "freq_rank"];
  const LIST: (keyof DictionaryImportRow)[] = ["scene_tags", "exam_tags"];
  const JSONCELL: (keyof DictionaryImportRow)[] = ["meanings", "forms"];
  // **1行ずつ投げない。** 25,000行のうち1行が空なだけで全部が止まると、
  // 貼った人は1件ずつ潰すことになる。中身の検査は server 側の門
  // (`partitionByLanguage`)がやって、落ちた行を数と実例で返す。
  return table.slice(1).map((cols) => {
    const row: Partial<DictionaryImportRow> = {};
    keys.forEach((k, i) => {
      if (!k) return;
      const v = (cols[i] ?? "").trim();
      if (!v) return;
      if (NUM.includes(k)) {
        const n = Number(v);
        if (!Number.isNaN(n)) (row as Record<string, unknown>)[k] = n;
      } else if (LIST.includes(k)) {
        (row as Record<string, unknown>)[k] = v
          .split(/[|;]/)
          .map((x) => x.trim())
          .filter(Boolean);
      } else if (JSONCELL.includes(k)) {
        const o = parseJsonCell(v);
        if (o) (row as Record<string, unknown>)[k] = o;
      } else {
        (row as Record<string, unknown>)[k] = v;
      }
    });
    return row as DictionaryImportRow;
  });
}

function DictionaryAdminPage() {
  const isAdminFn = useServerFn(checkIsAdmin);
  const importFn = useServerFn(importDictionaryEntries);
  const searchFn = useServerFn(searchDictionaryEntries);

  const {
    data: adminData,
    isLoading: adminLoading,
    error: adminError,
  } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
    retry: false,
  });

  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  /**
   * **どの言語の辞書として入れるか。** 決め打たない。
   * ここが固定だと、英語の CSV を貼っても台湾華語として入る
   * （オーナー指示「決して英語と台湾華語混ざらないように」）。
   */
  const [language, setLanguage] = useState<string>(DEFAULT_TARGET_LANGUAGE);
  /** 言語が合わずに落ちた行（先頭20件）。 */
  const [rejected, setRejected] = useState<{ row: number; headword: string; reason: string }[]>([]);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{
      id: string;
      headword: string;
      zhuyin: string | null;
      pinyin: string | null;
      /**
       * **null を許す。** 2026-08-25 の移行で、意味は読む人の言語ごとに
       * `meanings` (jsonb) が持つようになり、`meaning_ja` は
       * 「日本語の意味」を指す古い列になった。英語の辞書は
       * `meanings` に入るので、この列は空のことがある。
       */
      meaning_ja: string | null;
      pos: string | null;
      tocfl_level: number | null;
      source: string;
      entry_type: string;
    }>
  >([]);

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    setRejected([]);
    try {
      const rows = csvToRows(csv);
      const res = await importFn({ data: { rows, language } });
      const lost =
        res.rejectedCount > 0 ? ` / ⚠️ ${res.rejectedCount}件は言語が合わず入れていません` : "";
      setImportResult(
        `✅ ${res.inserted}件 投入完了(${res.language} / 全体: ${res.totalRows ?? "?"}件)${lost}`,
      );
      setRejected(res.rejectedSample);
      toast.success(`${res.inserted}件 投入しました`);
      // **落ちた行が在るときは中身を消さない。** 消すと、何を直せばいいか
      // 確かめる材料が無くなる。
      if (res.rejectedCount === 0) setCsv("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportResult(`❌ ${msg}`);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }

  async function handleSearch() {
    try {
      const res = await searchFn({ data: { q } });
      setResults(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (adminLoading) {
    return (
      <AppShell>
        <div className="p-6 text-body text-muted-foreground">確認中...</div>
      </AppShell>
    );
  }

  if (adminError || !adminData?.isAdmin) {
    return (
      <AppShell>
        <div className="p-6 space-y-2">
          <h1 className="text-headline font-semibold">アクセス権がありません</h1>
          <p className="text-body text-muted-foreground">この画面は管理者のみが利用できます。</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-6 space-y-8 max-w-3xl">
        <header>
          <h1 className="text-title font-bold">辞書管理</h1>
          <p className="text-body text-muted-foreground">
            dictionary_entries への CSV 一括投入と検索確認
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-body font-semibold">CSV 投入</h2>

          {/* **言語を必ず選ばせる。** ここが決め打ちだったので、英語の CSV を
              貼っても台湾華語として入っていた。選び間違えても中身のほうが
              門を通れないが、まず選ぶ所を見えるようにする。 */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Label className="text-footnote font-semibold">どの言語の辞書として入れるか</Label>
            <div className="flex flex-wrap gap-2">
              {TARGET_LANGUAGES.map((code) => (
                <Button
                  key={code}
                  type="button"
                  variant={language === code ? "default" : "outline"}
                  onClick={() => setLanguage(code)}
                  disabled={importing}
                >
                  {code === DEFAULT_TARGET_LANGUAGE ? "台湾華語" : "英語"}
                  <span className="ml-1.5 font-mono text-caption opacity-70">{code}</span>
                </Button>
              ))}
            </div>
            <p className="text-caption text-muted-foreground">
              選んだ言語の見出し語**でない行は入りません**。繁体字は英語の投入を通らず、
              英語の語は台湾華語の投入を通りません。落ちた行は下に出ます。
            </p>
          </div>

          <p className="text-footnote text-muted-foreground">
            ヘッダー行必須。認識する列:{" "}
            <code>
              headword, reading_primary(=zhuyin/ipa_us), reading_alt(=pinyin/ipa_uk),
              meanings(JSON), meaning_ja, pos, level_step(=tocfl_level), freq_rank, exam_tags,
              forms(JSON), usage_register, taiwan_usage, source, entry_type, scene_tags, notes
            </code>
            (<code>headword</code> と、<code>meanings</code> か <code>meaning_ja</code>{" "}
            のどちらかが必須。
            <code>scene_tags</code> と <code>exam_tags</code> は <code>|</code> か <code>;</code>{" "}
            区切り)。同じ
            <code> (language, headword, entry_type) </code>は upsert されます。 1回あたり{" "}
            <strong>5,000行</strong>まで。
          </p>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={`headword,zhuyin,pinyin,meaning_ja,pos,tocfl_level\n芒果,ㄇㄤˊ ㄍㄨㄛˇ,mángguǒ,マンゴー,名詞,1`}
            rows={10}
            className="font-mono text-footnote"
          />
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importing || !csv.trim()}>
              {importing ? "投入中..." : "投入する"}
            </Button>
            <Button variant="outline" onClick={() => setCsv("")} disabled={importing}>
              クリア
            </Button>
          </div>
          {importResult && <p className="text-body">{importResult}</p>}
          {rejected.length > 0 && (
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <p className="text-footnote font-semibold">
                言語が合わずに入れなかった行（先頭{rejected.length}件）
              </p>
              <ul className="mt-1.5 space-y-0.5 font-mono text-caption text-muted-foreground">
                {rejected.map((r) => (
                  <li key={`${r.row}-${r.headword}`}>
                    {r.row}行目: {r.headword} — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-body font-semibold">検索確認</h2>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="q" className="sr-only">
                検索
              </Label>
              <Input
                id="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="headword / pinyin / 意味"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>検索</Button>
          </div>
          <div className="border rounded-md divide-y">
            {results.length === 0 && (
              <div className="p-3 text-body text-muted-foreground">結果なし</div>
            )}
            {results.map((r) => (
              <div key={r.id} className="p-3 text-body flex flex-wrap gap-x-3 gap-y-1">
                <span lang="zh-Hant" className="font-medium">
                  {r.headword}
                </span>
                {r.zhuyin && <span className="text-muted-foreground">{r.zhuyin}</span>}
                {r.pinyin && <span className="text-muted-foreground">{r.pinyin}</span>}
                {/* 空の行は「意味が無い」ではなく「この列には無い」。
                    印だけ出して、行そのものは隠さない。 */}
                <span>→ {r.meaning_ja ?? "—"}</span>
                {r.pos && <span className="text-footnote text-muted-foreground">[{r.pos}]</span>}
                {r.tocfl_level && (
                  <span className="text-footnote text-muted-foreground">L{r.tocfl_level}</span>
                )}
                <span className="text-footnote text-muted-foreground ml-auto">
                  {r.source} / {r.entry_type}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
