import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { nativeNavigate } from "./nativeNav";
import { AUTH_HINT_KEY } from "./AuthProvider";
import { clearAccessToken } from "./accessToken";

function loginRedirectUrl(returnTo?: string) {
  const ret =
    returnTo ??
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/");
  return `/login?return=${encodeURIComponent(ret)}`;
}

export function redirectToLogin(returnTo?: string) {
  if (typeof window === "undefined") return;
  nativeNavigate(loginRedirectUrl(returnTo), { replace: true });
}

export function isAuthError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("401") ||
    msg.includes("로그인이 필요") ||
    msg.includes("Unauthenticated") ||
    msg.includes("invalid_token") ||
    msg.includes("missing_bearer_token")
  );
}

export function handleAuthFailure(err: unknown, returnTo?: string): boolean {
  if (!isAuthError(err)) return false;
  redirectToLogin(returnTo);
  return true;
}

export async function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_HINT_KEY);
    clearAccessToken();
  }
  await signOut(auth);
  if (typeof window !== "undefined") {
    nativeNavigate("/");
  }
}
