const KEY = "runrace_access_token";

export function storeAccessToken(token: string): void {
  if (typeof window !== "undefined") localStorage.setItem(KEY, token);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function clearAccessToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
