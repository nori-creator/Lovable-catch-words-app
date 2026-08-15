/**
 * ハーネス専用の `@tanstack/react-router` の差し替え。
 *
 * ## なぜ要るか
 * 復習・ホームのように、**画面の中身がルートのファイルに書かれている**ものは、
 * ルーターの実体が無いと import すらできない。だが検査したいのはその中身
 * (押せる大きさ・読める濃さ・焦点)であって、道順ではない。
 *
 * ## 何を差し替えて、何を差し替えないか
 * 差し替えるのは**行き先の仕組みだけ**。`Link` は `<a>` として描く —
 * 見た目に関わる className と中身はそのまま渡すので、**描かれる markup は
 * 本物と同じ**。ここで見た目を作り替えたら、この検査の意味が消える。
 */
import type { ReactNode } from "react";

export function Link({
  to,
  children,
  ...rest
}: {
  to?: string;
  children?: ReactNode;
  [k: string]: unknown;
}) {
  return (
    <a href={typeof to === "string" ? to : "#"} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  );
}

/** 行き先を変える関数。ハーネスでは何もしない。 */
export function useNavigate() {
  return () => {};
}

/** ルートの定義。ハーネスでは中身を描くだけなので、印だけ返す。 */
export function createFileRoute() {
  return (opts: unknown) => ({ ...(opts as object), __harnessRoute: true });
}

export function useRouter() {
  return { navigate: () => {}, history: { back: () => {} } };
}

export function useSearch() {
  return {};
}

export function useParams() {
  return {};
}
