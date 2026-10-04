import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **画面に日本語を直に書かない**（オーナー指示 2026-09-27「どこにも言語を
 * 混ぜない」）。
 *
 * 画面の文字は `i18n.tsx` の表から引く。直に書いた日本語は、英語や繁體中文で
 * 使う人の画面にそのまま出る。ここは**今ある分を数えて固定**し、増えたら落とす
 * （減らすのは歓迎。減ったら下の表の数も下げる）。
 *
 * 数えないもの: コメント、`ja:` の鍵、ページの説明（`content:` / `description:`
 * — 検索エンジン向けで画面には出ない）。
 */
const ROOTS = ["src/components", "src/routes"];
const KANA = /[ぁ-ゟァ-ヺ]/;

/**
 * いま残っている所（ファイル → 行数）。
 * - 規約・プライバシー・特商法の表記は日本語版そのもの（英語版・繁體中文版と並べて持つ）
 * - admin.* と scan.tsx の計測欄は開発者だけが見る画面
 */
const KNOWN: Record<string, number> = {
  "src/components/screens/AdminDictionaryScreen.tsx": 23,
  "src/routes/_authenticated/admin.metrics.tsx": 36,
  // 利用者ごとの情報（開発者だけ、2026-09-27）。全体のグラフと比較を足した（2026-09-28）。
  // 写真の保存の失敗の回数（2026-09-30、開発者だけ）。裏の処理の失敗の回数（2026-10-01、開発者だけ）。
  // 2026-10-02 グラフを細かくした（日ごと・週ごと・記憶の段・予定・時間帯・曜日・滞在・AI の
  // 種類の見出しと単位、一覧の「最後に使った順」の注）。開発者だけが見る画面のまま。
  // 2026-10-03 中身を components/AdminUsersViews.tsx へ移した（route から出す物が recharts を
  // 最初に読む塊へ引き込んでいた）。route に残るのは「管理者専用」の1行だけ。
  "src/components/AdminUsersViews.tsx": 138,
  "src/routes/_authenticated/admin.users.tsx": 1,
  "src/components/screens/ScanScreen.tsx": 4,
  // 設定の開発者欄「文字検索のAI画像」（管理者だけが見る。2026-09-28 main から）。
  "src/components/screens/SettingsScreen.tsx": 12,
  // 法務文書の**日本語版そのもの**（2026-10-03 に route から components/legal/ へ移し、
  // 繁體中文版を足した。英語・繁體中文の版は別のファイルで、ここには数えられない）。
  // 外部事業者・広告・保存期間・有料プランの条項を書き直したので行数が増えた。
  // 2026-10-03 iPhone アプリの扱い（声で調べる・AI への送信の同意・端末の中の保存）、外国の
  // 事業者の国と制度、安全管理の措置、地域ごとの追加事項、App Store の条項を足した。
  "src/components/legal/privacy-ja.tsx": 148,
  "src/components/legal/terms-ja.tsx": 79,
  // 特商法の表記の日本語の見出しと固定の文（3言語の表の ja の列。ja: の鍵の形でないので数える）。
  "src/components/legal/TokushohoDocument.tsx": 20,
  // 運営者の欄の日本語の見出し（同上、3言語の表の ja の列）。
  "src/components/legal/operator.tsx": 4,
  // サポートの頁の日本語の見出しと案内（3言語の表の ja の列。2026-10-03）。
  "src/components/legal/SupportDocument.tsx": 12,
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return p.endsWith(".tsx") && !p.includes(".test.") ? [p] : [];
  });
}

export function countJapaneseLines(src: string): number {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1));
  const lines = noBlock.split("\n");
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\/\/.*$/, "");
    if (!KANA.test(l)) continue;
    if (/^\s*ja:/.test(l) || /(^|[\s{,])(content|description):/.test(l)) continue;
    const prev = (lines[i - 1] ?? "").trim();
    if (/^(content|description):\s*$/.test(prev)) continue;
    n++;
  }
  return n;
}

describe("画面に日本語を直に書かない", () => {
  it("数え方: コメント・ja の鍵・ページの説明は数えない", () => {
    expect(countJapaneseLines(`// ここはコメント\nconst a = 1;`)).toBe(0);
    expect(countJapaneseLines(`x = { ja: "日本語" }`)).toBe(0);
    expect(countJapaneseLines(`{ name: "description",\n  content:\n  "説明",\n}`)).toBe(0);
    expect(countJapaneseLines(`<p>こんにちは</p>`)).toBe(1);
  });

  it("直に書いた日本語が増えていない", () => {
    const now: Record<string, number> = {};
    for (const root of ROOTS) {
      for (const f of walk(root)) {
        const n = countJapaneseLines(fs.readFileSync(f, "utf8"));
        if (n > 0) now[f] = n;
      }
    }
    const grew = Object.entries(now).filter(([f, n]) => n > (KNOWN[f] ?? 0));
    expect(grew, "画面の文字は i18n.tsx の表へ。表示用でないなら KNOWN に理由と一緒に足す").toEqual(
      [],
    );
  });
});
