import { User } from "firebase/auth";
import { redirectToLogin } from "@/lib/auth";
import { getAccessToken, storeAccessToken, clearAccessToken } from "@/lib/accessToken";
import { compressImageForUpload } from "@/lib/compressImage";
import { ApiError } from "./apiError";

/** 웹(EC2+Nginx): 비우면 /api. 로컬 dev: 빈 문자열 → Next.js rewrite 프록시(/api/*) 경유 */
function resolveApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  let base: string;
  if (raw === undefined) {
    base = "";
  } else {
    const trimmed = raw.trim();
    base = trimmed === "" ? "" : trimmed.replace(/\/$/, "");
  }

  // HTTPS 페이지에서 http:// API는 Mixed Content로 차단 → Nginx /api 프록시 사용
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    base.startsWith("http://")
  ) {
    return "";
  }

  return base;
}

export function apiUrl(path: string): string {
  const apiBaseUrl = resolveApiBaseUrl();
  if (!path.startsWith("/")) {
    return `${apiBaseUrl}/${path}`;
  }
  return `${apiBaseUrl}${path}`;
}

/** 인증 없이 POST 요청을 보낸다 (카카오 로그인 등 공개 엔드포인트용). */
export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  await throwIfNotOk(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text.trim() ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * 저장된 자체 JWT를 우선 사용한다. 없거나 forceRefresh이면 Firebase 토큰으로 폴백.
 * forceRefresh=true는 JWT 만료 후 재발급 경로에서만 사용한다.
 */
async function authHeaders(user: User, forceRefresh = false) {
  if (!forceRefresh) {
    const stored = getAccessToken();
    if (stored) {
      return { "Content-Type": "application/json", Authorization: `Bearer ${stored}` };
    }
  }
  const idToken = await user.getIdToken(forceRefresh);
  return { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` };
}

/**
 * Firebase 토큰을 백엔드(/api/auth/login)에 보내 자체 JWT를 발급받아 저장한다.
 * 토큰 교환의 단일 출처(로그인 동기화·만료 재발급 공용). 에러는 호출부가 처리한다(여기선 삼키지 않음).
 */
export async function exchangeFirebaseTokenForJwt(user: User, forceRefresh = false): Promise<void> {
  const firebaseToken = await user.getIdToken(forceRefresh);
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${firebaseToken}` },
    cache: "no-store",
  });
  if (res.ok) {
    const data = (await res.json()) as { accessToken?: string; firebaseUid?: string };
    if (data.accessToken && data.firebaseUid) storeAccessToken(data.accessToken, data.firebaseUid);
  }
}

/** JWT 만료(401) 시 Firebase 토큰으로 새 JWT를 발급받아 저장한다. */
async function refreshAccessToken(user: User): Promise<{ "Content-Type": string; Authorization: string }> {
  clearAccessToken();
  try {
    await exchangeFirebaseTokenForJwt(user, true);
  } catch {}
  return await authHeaders(user, false);
}

/** 이미지 multipart 업로드 공용 코어. 응답에서 responseField(url|key)를 꺼내 반환한다. */
export async function uploadMultipart(
  path: string,
  file: File,
  user: User,
  responseField: "url" | "key",
  opts?: { precompressed?: boolean },
): Promise<string> {
  const token = await user.getIdToken();
  const uploadFile = opts?.precompressed ? file : await compressImageForUpload(file);
  const formData = new FormData();
  formData.append("file", uploadFile);
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 413) throw new Error("upload_too_large");
    throw new Error(await res.text().catch(() => String(res.status)));
  }
  const data = await res.json();
  const value = data?.[responseField];
  if (typeof value !== "string" || !value) throw new Error("upload_invalid_response");
  return value;
}

/** HTML 응답(nginx 오류 페이지 등)을 간결한 문자열로 변환한다. */
function cleanErrorText(status: number, text: string): string {
  if (text.trimStart().startsWith("<")) {
    return status >= 500 ? "서버 오류" : `오류 ${status}`;
  }
  return text;
}

/** 응답이 실패면 본문을 읽어 ApiError를 던진다(401 등 특수 처리가 없는 단순 경로용). */
async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new ApiError(res.status, `API ${res.status}: ${cleanErrorText(res.status, text)}`);
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // 저장된 JWT가 있으면 user 객체 없이도 인증 헤더를 즉시 구성한다.
  // → 콜드 스타트에서 Firebase 초기화 전에도 인증된 fetch 가능.
  const storedToken = getAccessToken();
  if (storedToken) {
    headers.Authorization = `Bearer ${storedToken}`;
  } else if (user) {
    Object.assign(headers, await authHeaders(user));
  }

  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  await throwIfNotOk(res);
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
    throw new ApiError(401, "로그인이 필요합니다.");
  }

  const method = opts.method ?? "GET";
  const body = opts.body ? JSON.stringify(opts.body) : undefined;

  let headers = await authHeaders(opts.user);
  let res = await fetch(url, { method, headers, body, cache: "no-store" });

  if (res.status === 401) {
    // JWT 만료 → Firebase로 새 JWT 발급 후 재시도
    headers = await refreshAccessToken(opts.user);
    res = await fetch(url, { method, headers, body, cache: "no-store" });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      if (redirectOn401) {
        redirectToLogin(opts.returnTo);
      }
      throw new ApiError(401, `API 401: ${cleanErrorText(401, text)} (로그인이 필요합니다.)`);
    }
    throw new ApiError(res.status, `API ${res.status}: ${cleanErrorText(res.status, text)}`);
  }

  return parseResponse<T>(res);
}
