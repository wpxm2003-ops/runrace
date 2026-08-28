import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiUrl,
  apiFetch,
  exchangeFirebaseTokenForJwt,
  publicFetch,
} from "@/lib/api/client";
import {
  getAccessToken,
  getStoredAuthUid,
  storeAccessToken,
} from "@/lib/accessToken";

const firebaseAuth = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
}));
const capacitorState = vi.hoisted(() => ({ native: false }));

vi.mock("@/lib/auth", () => ({ redirectToLogin: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ auth: firebaseAuth }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => capacitorState.native },
}));

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function fakeUser(uid: string) {
  return {
    uid,
    getIdToken: vi.fn().mockResolvedValue(`firebase-${uid}`),
  } as unknown as User;
}

function okJson(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { protocol: "http:" } });
  vi.stubGlobal("localStorage", new MemoryStorage());
  firebaseAuth.currentUser = null;
  capacitorState.native = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("API base URL 환경 판정", () => {
  it("Capacitor localhost WebView에서는 설정된 절대 API 주소를 보존한다", () => {
    capacitorState.native = true;
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.runrace.test");
    vi.stubGlobal("window", {
      location: { protocol: "http:", origin: "http://localhost" },
    });

    expect(apiUrl("/api/me")).toBe("https://api.runrace.test/api/me");
  });

  it("일반 웹의 교차 출처 API 주소는 같은 출처 프록시 경로로 바꾼다", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.runrace.test");
    vi.stubGlobal("window", {
      location: { protocol: "https:", origin: "https://runrace.test" },
    });

    expect(apiUrl("/api/me")).toBe("/api/me");
  });
});

describe("API JWT 소유자 검증", () => {
  it("전달된 사용자와 저장 UID가 다르면 다른 계정 JWT 대신 해당 Firebase 토큰을 쓴다", async () => {
    storeAccessToken("jwt-user-b", "user-b");
    const userA = fakeUser("user-a");
    const fetchMock = vi.fn().mockResolvedValue(okJson());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/test", { user: userA });

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer firebase-user-a");
    expect(userA.getIdToken).toHaveBeenCalledWith(false);
  });

  it("401 재시도도 다른 계정 JWT를 지우거나 사용하지 않는다", async () => {
    storeAccessToken("jwt-user-b", "user-b");
    const userA = fakeUser("user-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(okJson());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/test", { user: userA });

    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    const retryHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders.Authorization).toBe("Bearer firebase-user-a");
    expect(retryHeaders.Authorization).toBe("Bearer firebase-user-a");
    expect(getAccessToken()).toBe("jwt-user-b");
    expect(getStoredAuthUid()).toBe("user-b");
  });

  it("선택 인증 공개 조회도 전달 사용자와 다른 저장 JWT를 쓰지 않는다", async () => {
    storeAccessToken("jwt-user-b", "user-b");
    const userA = fakeUser("user-a");
    const fetchMock = vi.fn().mockResolvedValue(okJson());
    vi.stubGlobal("fetch", fetchMock);

    await publicFetch("/api/public-test", userA);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer firebase-user-a");
  });

  it("토큰 교환 중 계정이 바뀌면 늦게 온 응답이 현재 계정 JWT를 덮지 않는다", async () => {
    storeAccessToken("jwt-user-b", "user-b");
    firebaseAuth.currentUser = { uid: "user-b" };
    const userA = fakeUser("user-a");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson({
      accessToken: "late-jwt-user-a",
      firebaseUid: "user-a",
    })));

    await exchangeFirebaseTokenForJwt(userA);

    expect(getAccessToken()).toBe("jwt-user-b");
    expect(getStoredAuthUid()).toBe("user-b");
  });

  it("401 뒤 Firebase 토큰 갱신이 멈춰도 AbortSignal로 대기를 끝낸다", async () => {
    storeAccessToken("expired-jwt", "user-a");
    const never = new Promise<string>(() => {});
    const userA = {
      uid: "user-a",
      getIdToken: vi.fn().mockReturnValue(never),
    } as unknown as User;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const request = apiFetch("/api/test", { user: userA, signal: controller.signal });
    await vi.waitFor(() => expect(userA.getIdToken).toHaveBeenCalledWith(true));
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
