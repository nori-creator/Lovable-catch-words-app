import { createFileRoute, redirect } from "@tanstack/react-router";
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

const HEADER_ALIASES: Record<string, keyof DictionaryImportRow> = {
  headword: "headword",
  zhuyin: "zhuyin",
  pinyin: "pinyin",
  meaning_ja: "meaning_ja",
  meaning: "meaning_ja",
  pos: "pos",
  tocfl_level: "tocfl_level",
  tocfl: "tocfl_level",
  taiwan_usage: "taiwan_usage",
  usage: "taiwan_usage",
  source: "source",
  entry_type: "entry_type",
  type: "entry_type",
  scene_tags: "scene_tags",
  tags: "scene_tags",
  notes: "notes",
};

function csvToRows(csv: string): DictionaryImportRow[] {
  const table = parseCSV(csv.trim());
  if (table.length < 2) throw new Error("CSVにヘッダー行 + 1行以上必要です");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const keys = header.map((h) => HEADER_ALIASES[h] ?? null);
  if (!keys.includes("headword") || !keys.includes("meaning_ja")) {
    throw new Error("CSVヘッダーに headword と meaning_ja が必要です");
  }
  return table.slice(1).map((cols, idx) => {
    const row: Partial<DictionaryImportRow> = {};
    keys.forEach((k, i) => {
      if (!k) return;
      const v = (cols[i] ?? "").trim();
      if (!v) return;
      if (k === "tocfl_level") {
        const n = Number(v);
        if (!Number.isNaN(n)) row.tocfl_level = n;
      } else if (k === "scene_tags") {
        row.scene_tags = v.split(/[|;]/).map((s) => s.trim()).filter(Boolean);
      } else {
        (row as Record<string, unknown>)[k] = v;
      }
    });
    if (!row.headword || !row.meaning_ja) {
      throw new Error(`行 ${idx + 2}: headword または meaning_ja が空`);
    }
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
  const [importResult, setImportResult] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{
      id: string;
      headword: string;
      zhuyin: string | null;
      pinyin: string | null;
      meaning_ja: string;
      pos: string | null;
      tocfl_level: number | null;
      source: string;
      entry_type: string;
    }>
  >([]);

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    try {
      const rows = csvToRows(csv);
      const res = await importFn({ data: { rows } });
      setImportResult(`✅ ${res.inserted}件 投入完了(全体: ${res.totalRows ?? "?"}件)`);
      toast.success(`${res.inserted}件 投入しました`);
      setCsv("");
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
        <div className="p-6 text-sm text-muted-foreground">確認中...</div>
      </AppShell>
    );
  }

  if (adminError || !adminData?.isAdmin) {
    return (
      <AppShell>
        <div className="p-6 space-y-2">
          <h1 className="text-lg font-semibold">アクセス権がありません</h1>
          <p className="text-sm text-muted-foreground">
            この画面は管理者のみが利用できます。
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-6 space-y-8 max-w-3xl">
        <header>
          <h1 className="text-xl font-bold">辞書管理</h1>
          <p className="text-sm text-muted-foreground">
            dictionary_entries への CSV 一括投入と検索確認
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">CSV 投入</h2>
          <p className="text-xs text-muted-foreground">
            ヘッダー行必須。認識する列:{" "}
            <code>
              headword, zhuyin, pinyin, meaning_ja, pos, tocfl_level, taiwan_usage, source,
              entry_type, scene_tags, notes
            </code>
            (<code>headword</code> と <code>meaning_ja</code> は必須。
            <code>scene_tags</code> は <code>|</code> か <code>;</code> 区切り)。同じ
            <code> (language, headword, entry_type) </code>は upsert されます。
          </p>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={`headword,zhuyin,pinyin,meaning_ja,pos,tocfl_level\n芒果,ㄇㄤˊ ㄍㄨㄛˇ,mángguǒ,マンゴー,名詞,1`}
            rows={10}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importing || !csv.trim()}>
              {importing ? "投入中..." : "投入する"}
            </Button>
            <Button variant="outline" onClick={() => setCsv("")} disabled={importing}>
              クリア
            </Button>
          </div>
          {importResult && <p className="text-sm">{importResult}</p>}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">検索確認</h2>
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
              <div className="p-3 text-sm text-muted-foreground">結果なし</div>
            )}
            {results.map((r) => (
              <div key={r.id} className="p-3 text-sm flex flex-wrap gap-x-3 gap-y-1">
                <span className="font-medium">{r.headword}</span>
                {r.zhuyin && <span className="text-muted-foreground">{r.zhuyin}</span>}
                {r.pinyin && <span className="text-muted-foreground">{r.pinyin}</span>}
                <span>→ {r.meaning_ja}</span>
                {r.pos && <span className="text-xs text-muted-foreground">[{r.pos}]</span>}
                {r.tocfl_level && (
                  <span className="text-xs text-muted-foreground">L{r.tocfl_level}</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
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
