import { useState } from "react";
import { Loader2, Search, Upload, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { searchImageCandidates, fetchImageAsDataUrl, type ImageCandidate } from "@/lib/images.functions";
import { Button } from "@/components/ui/button";

type Props = {
  query: string;
  onPicked: (dataUrl: string) => void;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ImagePicker({ query, onPicked }: Props) {
  const searchFn = useServerFn(searchImageCandidates);
  const fetchFn = useServerFn(fetchImageAsDataUrl);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImageCandidate[]>([]);
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    setLoading(true);
    setSearched(true);
    try {
      const { candidates } = await searchFn({ data: { query, language: "zh-TW" } });
      setCandidates(candidates);
    } catch (e) {
      console.error(e);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }

  async function pickCandidate(c: ImageCandidate) {
    setPicking(c.url);
    try {
      // Unsplash URLs need server-side fetch (CORS). data: URLs (AI) can be used as-is.
      if (c.url.startsWith("data:")) {
        onPicked(c.url);
      } else {
        const { dataUrl } = await fetchFn({ data: { url: c.url } });
        onPicked(dataUrl);
      }
    } catch (e) {
      console.error(e);
      setPicking(null);
    }
  }

  async function onUpload(file: File) {
    const url = await fileToDataUrl(file);
    onPicked(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={runSearch} disabled={loading || !query} className="lift flex-1">
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
          「{query}」の画像を探す
        </Button>
        <label className="lift inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent">
          <Upload className="h-4 w-4" />
          <span>自分の写真</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      </div>

      {searched && !loading && candidates.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
          画像が見つかりませんでした。別のキーワードで試すか、自分の写真をアップロードしてください。
        </p>
      )}

      {candidates.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {candidates.map((c) => (
            <button
              key={c.url}
              type="button"
              onClick={() => pickCandidate(c)}
              disabled={picking !== null}
              className="lift relative aspect-square overflow-hidden rounded-2xl border border-border bg-secondary"
            >
              <img src={c.thumb} alt="候補" className="h-full w-full object-cover" loading="lazy" />
              <div className="absolute right-1 top-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-white backdrop-blur">
                {c.source === "ai" ? (
                  <span className="inline-flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />AI</span>
                ) : (
                  "Unsplash"
                )}
              </div>
              {picking === c.url && (
                <div className="absolute inset-0 grid place-items-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
              {c.credit && (
                <div className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[9px] text-white">
                  © {c.credit.name}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
