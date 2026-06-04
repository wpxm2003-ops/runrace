import { User } from "firebase/auth";
import { redirectToLogin } from "@/lib/auth";

/** 웹(EC2+Nginx): 비우면 /api. APK: 반드시 http://<서버IP> 전체 URL */
function resolveApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (raw === undefined) {
    return "http://localhost:8081";
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return "";
  }
  return trimmed.replace(/\/$/, "");
}

const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

/** 인증 없이 POST 요청을 보낸다 (카카오 로그인 등 공개 엔드포인트용). */
export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text.trim() ? (JSON.parse(text) as T) : (undefined as T);
}

/** forceRefresh=true일 때만 securetoken.googleapis.com 갱신 요청 */
async function authHeaders(user: User, forceRefresh = false) {
  const idToken = await user.getIdToken(forceRefresh);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  };
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function publicFetch<T>(
  path: string,
  user?: User | null,
): Promise<T> {
  const url = apiUrl(path);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (user) {
    Object.assign(headers, await authHeaders(user));
  }

  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }

  return parseResponse<T>(res);
}

export async function apiFetch<T>(
  path: string,
  opts: {
    method?: string;
    user?: User | null;
    body?: unknown;
    redirectOn401?: boolean;
    returnTo?: string;
  } = {},
): Promise<T> {
  const redirectOn401 = opts.redirectOn401 !== false;
  const url = apiUrl(path);

  if (!opts.user) {
    if (redirectOn401) {
      redirectToLogin(opts.returnTo);
    }
    throw new Error("로그인이 필요합니다.");
  }

  const method = opts.method ?? "GET";
  const body = opts.body ? JSON.stringify(opts.body) : undefined;

  let headers = await authHeaders(opts.user);
  let res = await fetch(url, { method, headers, body, cache: "no-store" });

  if (res.status === 401) {
    headers = await authHeaders(opts.user, true);
    res = await fetch(url, { method, headers, body, cache: "no-store" });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      if (redirectOn401) {
        redirectToLogin(opts.returnTo);
      }
      throw new Error(`API 401: ${text} (로그인이 필요합니다.)`);
    }
    throw new Error(`API ${res.status}: ${text}`);
  }

  return parseResponse<T>(res);
}
