/**
 * 迎える面（ログイン）。**入れたばかりの人が最初に見る面**なのに、
 * ルートのファイルに直書きで一度も機械で見ていなかった。
 *
 * 通信と行き先はルート側（`AuthPage`）が持っていて、`AuthView` は
 * 受け取った関数を呼ぶだけ。ここではその関数を空にして、面だけを描く。
 */
import { useState } from "react";
import { AuthView } from "@/components/screens/AuthScreen";
import { ResetPasswordView } from "@/components/screens/ResetPasswordScreen";

export function AuthScene({ q }: { q: URLSearchParams }) {
  const [mode, setMode] = useState<"signin" | "signup">(
    q.get("variant") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState(q.get("email") === "1" ? "nori@example.com" : "");
  const [password, setPassword] = useState("");
  const p = q.get("pending");
  const pending = p === "google" || p === "apple" ? p : null;
  return (
    <AuthView
      mode={mode}
      setMode={setMode}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      // `?pending=google` / `?pending=apple` … 押した後、Google・Apple の画面へ移るまでの面。
      loading={pending !== null}
      pending={pending}
      onEmail={(e) => e.preventDefault()}
      onGoogle={() => {}}
      onApple={() => {}}
      initialShowEmail={q.get("email") === "1"}
    />
  );
}

/**
 * パスワードの再設定（オーナー指示 2026-09-30「パスワード忘れた時にリセットできるようにして」）。
 * `?state=sent` … 送った後 / `?state=update` … メールのリンクから戻って新しいパスワードを決める面。
 */
export function ResetPasswordScene({ q }: { q: URLSearchParams }) {
  const state = q.get("state");
  const [email, setEmail] = useState("nori@example.com");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(state === "sent" ? "nori@example.com" : null);
  return (
    <ResetPasswordView
      mode={state === "update" ? "update" : "request"}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      loading={false}
      sentTo={sentTo}
      onRequest={(e) => {
        e.preventDefault();
        setSentTo(email);
      }}
      onUpdate={(e) => e.preventDefault()}
      onResend={() => setSentTo(null)}
    />
  );
}
