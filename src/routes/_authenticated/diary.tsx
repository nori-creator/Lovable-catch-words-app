import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getDiary, generateDiary, updateDiary, shareDiary, type DiaryRow } from "@/lib/diary.functions";
import { listMyStickers } from "@/lib/stickers.functions";
import { BookText, Languages, Pencil, Share2, Sparkles, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/diary")({
  head: () => ({
    meta: [
      { title: "日記 — Catchwords" },
      { name: "description", content: "今日キャッチした言葉から、AIが学習言語で振り返り日記を作ります。" },
    ],
  }),
  component: DiaryPage,
});

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function DiaryPage() {
  const date = todayStr();
  const qc = useQueryClient();
  const fetchDiary = useServerFn(getDiary);
  const gen = useServerFn(generateDiary);
  const update = useServerFn(updateDiary);
  const share = useServerFn(shareDiary);
  const fetchStickers = useServerFn(listMyStickers);

  const { data: diary, isLoading } = useQuery({
    queryKey: ["diary", date],
    queryFn: () => fetchDiary({ data: { date } }),
  });
  const { data: stickers } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
  });
  const todayStickers = (stickers ?? []).filter(
    (s) => new Date(s.created_at).toISOString().slice(0, 10) === date,
  );

  const generateMut = useMutation({
    mutationFn: () => gen({ data: { date } }),
    onSuccess: (d) => qc.setQueryData(["diary", date], d),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "生成に失敗しました"),
  });

  return (
    <AppShell title="日記">
      <section className="mb-4">
        <div className="flex items-center gap-2">
          <BookText className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">きょうの振り返り</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {date}・今日の言葉から、台湾華語の日記をAIが書きます。
        </p>
      </section>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-secondary" />
      ) : generateMut.isPending ? (
        <GeneratingState count={todayStickers.length} />
      ) : !diary ? (
        <EmptyDiary
          count={todayStickers.length}
          onGenerate={() => generateMut.mutate()}
        />
      ) : (
        <DiaryCard
          diary={diary}
          stickers={todayStickers}
          onSave={async (patch) => {
            const updated = await update({ data: { date, ...patch } });
            qc.setQueryData(["diary", date], updated);
          }}
          onRegenerate={() => generateMut.mutate()}
          onShare={async (sticker_id, visibility) => {
            await share({ data: { date, sticker_id, visibility } });
            qc.setQueryData(["diary", date], { ...diary, visibility });
            toast.success("フィードにシェアしました");
            qc.invalidateQueries({ queryKey: ["feed"] });
          }}
        />
      )}
    </AppShell>
  );
}

function GeneratingState({ count }: { count: number }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-lg shadow-primary/10">
      <Sparkles className="mx-auto mb-3 h-7 w-7 animate-pulse text-primary" />
      <p className="text-sm font-medium">AIが今日の{count}個の言葉から日記を綴っています…</p>
      <div className="mx-auto mt-4 max-w-xs space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-full bg-secondary"
            style={{ animationDelay: `${i * 120}ms`, width: `${100 - i * 12}%`, marginInline: "auto" }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyDiary({ count, onGenerate }: { count: number; onGenerate: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
      <BookText className="mx-auto mb-2 h-7 w-7 text-primary" />
      <p className="text-base font-semibold">まだ今日の日記がありません</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
        日記はこのアプリのメイン機能です。今日の出来事と言葉を、未来の自分のために残しましょう。
      </p>
      {count === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          まず街でひとつ言葉をキャッチすると、日記を作れます。
        </p>
      ) : (
        <button
          onClick={onGenerate}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4" /> AIで振り返り日記を作る
        </button>
      )}
    </div>
  );
}

type TodaySticker = { id: string; cutout_url: string | null; word: { headword: string } };

function DiaryCard({
  diary,
  stickers,
  onSave,
  onRegenerate,
  onShare,
}: {
  diary: DiaryRow;
  stickers: TodaySticker[];
  onSave: (patch: Partial<Pick<DiaryRow, "body_target" | "body_translation" | "one_liner" | "status">>) => Promise<void>;
  onRegenerate: () => void;
  onShare: (stickerId: string, visibility: "private" | "friends" | "public") => Promise<void>;
}) {
  const [showTranslation, setShowTranslation] = useState(true);
  const [editing, setEditing] = useState(false);
  const [bodyTarget, setBodyTarget] = useState(diary.body_target ?? "");
  const [bodyTranslation, setBodyTranslation] = useState(diary.body_translation ?? "");
  const [oneLiner, setOneLiner] = useState(diary.one_liner ?? "");
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStickerId, setShareStickerId] = useState<string | null>(stickers[0]?.id ?? null);
  const [shareVisibility, setShareVisibility] = useState<"friends" | "public">("friends");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setBodyTarget(diary.body_target ?? "");
    setBodyTranslation(diary.body_translation ?? "");
    setOneLiner(diary.one_liner ?? "");
  }, [diary]);

  async function saveEdits() {
    setSaving(true);
    try {
      await onSave({ body_target: bodyTarget, body_translation: bodyTranslation });
      setEditing(false);
      toast.success("日記を更新しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function saveOneLiner() {
    try {
      await onSave({ one_liner: oneLiner });
      toast.success("一言感想を保存しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }

  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-primary/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">
          {diary.place_label ?? "きょうの記録"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTranslation((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
          >
            <Languages className="h-3.5 w-3.5" /> {showTranslation ? "訳を隠す" : "訳を表示"}
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
          >
            <Pencil className="h-3.5 w-3.5" /> 編集
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">本文（台湾華語）</label>
            <textarea
              value={bodyTarget}
              onChange={(e) => setBodyTarget(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">日本語訳</label>
            <textarea
              value={bodyTranslation}
              onChange={(e) => setBodyTranslation(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveEdits}
              disabled={saving}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-xl border border-border px-4 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{diary.body_target}</p>
          {showTranslation && diary.body_translation && (
            <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
              {diary.body_translation}
            </p>
          )}
        </div>
      )}

      {/* 一言感想（メイン機能なので強く推奨） */}
      <div className="mt-5 rounded-2xl bg-secondary/50 p-4">
        <label className="text-xs font-medium">
          きょうの一言感想 <span className="text-muted-foreground">（おすすめ・スキップ可）</span>
        </label>
        <input
          value={oneLiner}
          onChange={(e) => setOneLiner(e.target.value)}
          onBlur={() => oneLiner !== (diary.one_liner ?? "") && saveOneLiner()}
          placeholder="今日いちばん心に残ったことは？"
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShareOpen((v) => !v)}
          disabled={stickers.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 active:scale-[0.98] disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" /> シェア
        </button>
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          <Sparkles className="h-4 w-4" /> 作り直す
        </button>
        {diary.status === "final" ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3.5 w-3.5" /> 確定済み
          </span>
        ) : (
          <button
            onClick={() => onSave({ status: "final" }).then(() => toast.success("日記を確定しました"))}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            確定する
          </button>
        )}
      </div>

      {shareOpen && (
        <div className="mt-4 rounded-2xl border border-border bg-background p-4">
          <p className="mb-2 text-xs font-medium">どのステッカーと一緒に投稿しますか？</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stickers.map((s) => (
              <button
                key={s.id}
                onClick={() => setShareStickerId(s.id)}
                className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border-2 bg-secondary ${
                  shareStickerId === s.id ? "border-primary" : "border-transparent"
                }`}
              >
                {s.cutout_url ? (
                  <img src={s.cutout_url} alt={s.word.headword} className="h-full w-full object-contain p-1" />
                ) : (
                  <span className="text-xl">📦</span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">公開範囲</span>
            {(["friends", "public"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setShareVisibility(v)}
                className={`rounded-full px-3 py-1 text-xs ${
                  shareVisibility === v ? "bg-primary text-primary-foreground" : "border border-border"
                }`}
              >
                {v === "friends" ? "友達" : "公開"}
              </button>
            ))}
          </div>
          <button
            disabled={!shareStickerId || sharing}
            onClick={async () => {
              if (!shareStickerId) return;
              setSharing(true);
              try {
                await onShare(shareStickerId, shareVisibility);
                setShareOpen(false);
              } finally {
                setSharing(false);
              }
            }}
            className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? "シェア中…" : "この内容でシェア"}
          </button>
        </div>
      )}
    </article>
  );
}
