// An explicit sign-in is an existing learner's entry, even if an older account
// never set profiles.onboarded. This is UI routing only, never authentication.
const returningUsers = new Set<string>();
const key = (userId: string) => `cw:returning-signin:${userId}`;

export function rememberReturningSignin(userId: string) {
  returningUsers.add(userId);
  try {
    sessionStorage.setItem(key(userId), "1");
  } catch {
    // In-memory routing still works when browser storage is unavailable.
  }
}

export function hasReturningSignin(userId: string): boolean {
  if (returningUsers.has(userId)) return true;
  try {
    return sessionStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}
