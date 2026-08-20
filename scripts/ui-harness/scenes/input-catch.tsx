/**
 * 打ち込みキャッチの面。
 *
 * **この画面はここまで場面が1つも無かった。** オーナーが2度
 * 「単語の文字入力がエラーが出て、機能してない」と言った画面がここで、
 * そのとき出ていたのは英語の1行だった。壊れた姿を機械が一度も
 * 撮っていなかったことと無関係ではない。
 *
 * 実物の `InputCatchFace` をそのまま描く。似たHTMLをこちらに書き写さない。
 * シートの枠(帯・題・閉じる印)は**インラインの `style`** で組む —
 * `@source "../src"` なので雛形にしか無いクラスは生成されず、
 * ここに Tailwind を書くと**絵の上だけ崩れる**。
 */
import { InputCatchFace } from "@/components/InputCatchSheet";

/** シートの枠。実物と同じ寸法感だけを与える。 */
function SheetFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "1.25rem",
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid color-mix(in oklab, var(--border) 60%, transparent)",
          padding: "0.5rem 0.75rem",
        }}
      >
        <span style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
          ⌨ 入力キャッチ
        </span>
        <span
          style={{
            display: "inline-flex",
            height: "2.75rem",
            width: "2.75rem",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "9999px",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        >
          ✕
        </span>
      </div>
      <div style={{ padding: "1rem" }}>{children}</div>
    </div>
  );
}

/**
 * 4通り撮る。
 *
 * - `empty`   … 開いた直後。押せない送信ボタンがどう見えるか
 * - `typed`   … 打った後。状況欄の言い方が語かフレーズかで変わる
 * - `loading` … 探している間
 * - `error`   … **失敗したとき。** ここが英語の1行だった面
 */
export function InputCatchScene({ q }: { q: URLSearchParams }) {
  const variant = q.get("variant") ?? "empty";
  const typed = variant !== "empty";
  return (
    <SheetFrame>
      <InputCatchFace
        text={typed ? "遙控器" : ""}
        onText={() => {}}
        scene={typed ? "エアコンのリモコン" : ""}
        onScene={() => {}}
        isPhrase={false}
        error={
          variant === "error"
            ? "カードの形が整いませんでした。もう一度お試しください。(category_key: 一覧の外の値)"
            : null
        }
        loading={variant === "loading"}
        onSubmit={() => {}}
        showMic={false}
        voiceHints={false}
        listening={false}
        onToggleRecord={() => {}}
      />
    </SheetFrame>
  );
}
