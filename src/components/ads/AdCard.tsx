import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

declare global {
  interface Window {
    /** AdSense の受け口。読み込み前は配列（積んでおくと、読み込み後に順に処理される）。 */
    adsbygoogle?: { push: (v: object) => unknown } | object[];
  }
}

/**
 * **広告の枠（Web 版・Google AdSense）**（オーナー指示 2026-10-03「アプリ内の広告が動く
 * 機能するようにしたい。」）。出すかどうかは呼ぶ側（`useWebAds`）が決める。ここは見た目と、
 * AdSense への「この枠を埋めて」の1回だけの依頼。
 *
 * - **「広告」の印**を必ず付ける（利用者がアプリの札と取り違えない）。
 * - **高さを先に取っておく**（`minHeight`）。広告が届いた時に下の札が押し下げられない。
 * - **埋まらなかったら畳む**（AdSense が `data-ad-status="unfilled"` を付ける）。空の箱を残さない。
 * - アプリの札と同じ角丸・縁・地の色（`bg-card`）。暗いテーマでも同じ札に見える。
 * - 押せる物の真横に置かない（呼ぶ側が上下に間を取る。`my-*`）。下のタブ帯は覆わない
 *   （画面に貼り付けず、一覧の流れの中に置く）。
 * - 依頼（`push`）は**枠1つにつき1回**。React の StrictMode や描き直しで2回送ると、
 *   AdSense が「空いている枠が無い」と例外を出す。印は DOM の要素そのものに付ける
 *   （StrictMode は同じ要素で付け外しを2回するので、ref の値だけでは足りない）。
 */
export function AdCard({
  client,
  slot,
  format = "auto",
  minHeight = 120,
  framed = true,
  className = "",
}: {
  client: string;
  slot: string;
  /** `auto` = レスポンシブのディスプレイ広告。`fluid` = 一覧の中の形（レイアウトキーが要る）。 */
  format?: "auto" | "fluid";
  /** 先に取っておく高さ（px）。 */
  minHeight?: number;
  /** 札の縁を付けるか（縦の一覧の行の中では付けない）。 */
  framed?: boolean;
  className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLModElement>(null);
  const [unfilled, setUnfilled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.dataset.cwPushed && !el.dataset.adsbygoogleStatus) {
      el.dataset.cwPushed = "1";
      try {
        const q = (window.adsbygoogle = window.adsbygoogle || []);
        q.push({});
      } catch (e) {
        // 広告が出ないだけ（利用者のデータには触れない）。開発者の確認用に残す。
        console.warn("[ads] push failed", e);
      }
    }
    const check = () => setUnfilled(el.getAttribute("data-ad-status") === "unfilled");
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => mo.disconnect();
  }, []);
  return (
    <aside
      aria-label={t("ads.label")}
      hidden={unfilled}
      data-ad-card=""
      className={`${framed ? "rounded-2xl border border-border bg-card p-3 shadow-sm" : ""} ${className}`}
    >
      <p className="mb-1.5 text-caption font-semibold text-muted-foreground">{t("ads.label")}</p>
      <ins
        ref={ref}
        className="adsbygoogle"
        // `<ins>` は既定で下線が付く（広告の中の字に線が入らないように消す）。
        style={{ display: "block", minHeight, textDecoration: "none" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  );
}
