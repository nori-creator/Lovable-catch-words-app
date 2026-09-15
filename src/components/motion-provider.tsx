import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MOTION,
  MOTION_ATTR,
  MOTION_STORAGE_KEY,
  parseMotionChoice,
  resolveMotion,
  type MotionChoice,
  type MotionMode,
} from "@/lib/motion-pref";

/**
 * 「動きを見せるか」の選択を持ち回る所。**`<html data-motion>` を書くのはここだけ。**
 *
 * 最初の1枚は `__root.tsx` の描画前スクリプトが書く（水和を待つと、
 * 動きを減らしている人が一瞬だけ動く絵を見ることになる）。ここが引き継ぐのは
 * **その後**：本人が設定画面で選び直したときと、端末の設定がアプリを開いた
 * ままで変わったとき（Android のバッテリーセーバーが入る瞬間など）。
 */
type MotionCtx = {
  /** 本人の選択。 */
  choice: MotionChoice;
  /** 端末がいま `reduce` を返しているか。**設定画面で理由を見せるのに使う。** */
  osReduces: boolean;
  /** 実際の姿（選択と端末を混ぜた結果）。 */
  mode: MotionMode;
  setChoice: (next: MotionChoice) => void;
};

const Ctx = createContext<MotionCtx | null>(null);

function readStored(): MotionChoice {
  try {
    return parseMotionChoice(localStorage.getItem(MOTION_STORAGE_KEY));
  } catch {
    return DEFAULT_MOTION;
  }
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<MotionChoice>(DEFAULT_MOTION);
  const [osReduces, setOsReduces] = useState(false);

  // 保存されている選択を拾い直す。サーバでは `localStorage` が無いので、
  // 水和の後に一度だけ。描画前スクリプトが同じ物を読んで属性を入れている
  // ので、ここで値が変わっても**見た目は動かない**。
  useEffect(() => {
    setChoiceState(readStored());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsReduces(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const mode = resolveMotion(choice, osReduces);

  useEffect(() => {
    document.documentElement.dataset[MOTION_ATTR] = mode;
  }, [mode]);

  const setChoice = useCallback((next: MotionChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, next);
    } catch {
      // 保存できなくても、この回だけは効かせる（内緒のタブなど）。
    }
  }, []);

  const value = useMemo(
    () => ({ choice, osReduces, mode, setChoice }),
    [choice, osReduces, mode, setChoice],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 設定画面から使う。Provider の外では既定のまま、変更は効かない。 */
export function useMotion(): MotionCtx {
  return (
    useContext(Ctx) ?? {
      choice: DEFAULT_MOTION,
      osReduces: false,
      mode: "full",
      setChoice: () => {},
    }
  );
}
