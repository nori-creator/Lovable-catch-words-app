/**
 * 迎える面（ログイン）。**入れたばかりの人が最初に見る面**なのに、
 * ルートのファイルに直書きで一度も機械で見ていなかった。
 *
 * 通信と行き先はルート側（`AuthPage`）が持っていて、`AuthView` は
 * 受け取った関数を呼ぶだけ。ここではその関数を空にして、面だけを描く。
 */
import { useState } from "react";
import { AuthView } from "@/routes/auth";

export function AuthScene({ q }: { q: URLSearchParams }) {
  const [mode, setMode] = useState<"signin" | "signup">(
    q.get("variant") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <AuthView
      mode={mode}
      setMode={setMode}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      loading={false}
      onEmail={(e) => e.preventDefault()}
      onGoogle={() => {}}
      onApple={() => {}}
    />
  );
}
