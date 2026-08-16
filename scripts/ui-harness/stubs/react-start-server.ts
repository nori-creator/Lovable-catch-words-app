/**
 * `@tanstack/react-start/server` のハーネス用の差し替え。
 * 読み込まれるのは import の連鎖の都合(認証ミドルウェアが辿られる)で、
 * ブラウザでは**呼ばれない**。呼ばれたら、黙って進まずに落とす —
 * 「サーバーの都合がハーネスに紛れ込んだ」ことを隠さないため。
 */
export function getRequest(): never {
  throw new Error("ハーネスではサーバーの Request は無い");
}
