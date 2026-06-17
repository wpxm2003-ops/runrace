const TOKEN_KEY = "runrace_access_token";
const UID_KEY = "runrace_auth_uid";

export function storeAccessToken(token: string, uid: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(UID_KEY, uid);
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Firebase UID — user 객체 없이도 SWR 키를 즉시 확정하기 위해 저장한다. */
export function getStoredAuthUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(UID_KEY);
}

export function clearAccessToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(UID_KEY);
  }
}
