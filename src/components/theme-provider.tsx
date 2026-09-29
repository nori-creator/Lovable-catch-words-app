import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

/**
 * 何も選んでいない人に出すテーマ。**ライト**（オーナー指示 R20「今ログインするとデフォルトで
 * ダークモードになってるから、デフォルトはライトモードにして。ダークモードはユーザーが指定しない
 * 限り、ON にしないで」）。
 *
 * 端末の設定（`system`）にも従わない — 端末が暗い設定の人でも、本人がアプリの設定で
 * 「ダーク」か「端末に合わせる」を押すまでは明るい画面。控え（localStorage）に入るのは
 * 設定の釦を**押した時だけ**（`setTheme`）なので、控えにある値は本人が選んだ物。
 * 下の描画前スクリプト（`src/routes/__root.tsx`）も同じ値を読む。
 */
export const DEFAULT_THEME: Theme = "light";

interface ThemeCtx {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function resolve(t: Theme): "light" | "dark" {
  if (t === "system") {
    // サーバでは端末の設定が分からない。**`DEFAULT_THEME` に倒す** —
    // ここだけ "light" を返していたので、既定が dark なのに最初の絵は
    // 明るい、という食い違いを自分で作っていた。
    if (typeof window === "undefined") return resolve(DEFAULT_THEME);
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return t;
}

/**
 * 端末に控えたテーマを読む。**描画前スクリプトと同じ鍵・同じ既定**。
 * 片方だけ直ると、また最初の1枚だけ色が違う画面になる。
 */
export const THEME_STORAGE_KEY = "theme";

export function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [resolved, setResolved] = useState<"light" | "dark">(resolve(DEFAULT_THEME));

  // Read stored value once on client
  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  // Apply class whenever theme changes; also react to system changes
  useEffect(() => {
    const r = resolve(theme);
    setResolved(r);
    const root = document.documentElement;
    root.classList.toggle("dark", r === "dark");

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        const nr = mq.matches ? "dark" : "light";
        setResolved(nr);
        root.classList.toggle("dark", nr === "dark");
      };
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
