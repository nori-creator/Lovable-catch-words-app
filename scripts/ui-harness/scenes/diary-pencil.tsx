import { useEffect, useRef, useState } from "react";
import { DIARY_FONTS, ensureDiaryFontCss, type DiaryFontId } from "@/lib/diary-fonts";
import { useT } from "@/lib/i18n";
import { createPencilDiary, type PencilDiary } from "./diary-pencil/engine";

/**
 * **日記を書くと、鉛筆で書かれる**（オーナー指示 2026-09-28 R13）。中身は `diary-pencil/engine.ts`。
 * 下の欄に書いて「書く」を押すと、手が鉛筆で右のページに1字ずつ書く。字体は日記の字体から選べる。
 */
const SAMPLE =
  "今日は夜市で初めて「珍珠奶茶」を自分で頼めた。半糖少冰、と言ったら店員さんが笑ってくれた。";

export function DiaryPencilScene() {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<PencilDiary | null>(null);
  const [text, setText] = useState(SAMPLE);
  const [font, setFont] = useState<DiaryFontId>("hand");
  useEffect(() => {
    ensureDiaryFontCss();
    const el = canvas.current;
    if (!el) return;
    const e = createPencilDiary(el);
    engine.current = e;
    e?.write(SAMPLE, "hand");
    return () => e?.dispose();
  }, []);
  return (
    <div className="fixed inset-0 bg-black">
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full"
        aria-label="鉛筆で日記を書く"
      />
      <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/85 to-transparent p-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-10">
        <div className="flex gap-1.5 overflow-x-auto">
          {DIARY_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFont(f.id);
                engine.current?.write(text, f.id);
              }}
              className="h-9 shrink-0 rounded-full px-3 text-footnote font-semibold"
              style={{
                background: font === f.id ? "#0a84ff" : "rgba(255,255,255,0.14)",
                color: "#fff",
                fontFamily: f.family,
              }}
            >
              {t(f.key)}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-2xl bg-white/95 p-2.5 text-body text-black"
            aria-label="日記"
          />
          <button
            type="button"
            onClick={() => engine.current?.write(text, font)}
            className="h-11 shrink-0 rounded-full bg-primary px-4 font-semibold text-primary-foreground"
          >
            書く
          </button>
        </div>
      </div>
    </div>
  );
}
