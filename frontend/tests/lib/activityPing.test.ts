import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiFetch }));

import { localDateKey, pingDailyActivity } from "@/lib/activityPing";

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

const user = (uid: string) => ({ uid }) as unknown as User;

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ localDate: "2026-11-25", recorded: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("기기 현지 날짜 키", () => {
  it("yyyy-MM-dd로 0을 채운다", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 10, 25, 0, 0))).toBe("2026-11-25");
  });
});

describe("일일 활성 핑", () => {
  const morning = new Date(2026, 10, 25, 8, 0);
  const evening = new Date(2026, 10, 25, 22, 0);
  const nextDay = new Date(2026, 10, 26, 0, 1);

  it("플랫폼을 담아 보내고, 401이어도 로그인 화면으로 보내지 않는다", async () => {
    await pingDailyActivity(user("u1"), "android_app", morning);

    expect(apiFetch).toHaveBeenCalledWith("/api/activity/ping", expect.objectContaining({
      method: "POST",
      body: { platform: "android_app" },
      redirectOn401: false,
    }));
  });

  it("같은 날 포그라운드 복귀로 다시 불려도 한 번만 보낸다", async () => {
    await pingDailyActivity(user("u1"), "web", morning);
    await pingDailyActivity(user("u1"), "web", evening);

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("날짜가 바뀌면 다시 보낸다", async () => {
    await pingDailyActivity(user("u1"), "web", morning);
    await pingDailyActivity(user("u1"), "web", nextDay);

    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("같은 날이라도 계정이 바뀌면 그 계정으로 보낸다", async () => {
    await pingDailyActivity(user("u1"), "web", morning);
    await pingDailyActivity(user("u2"), "web", evening);

    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("동시에 여러 번 불려도(부팅 + 복귀 이벤트) 요청은 하나다", async () => {
    let resolve: (value: unknown) => void = () => {};
    apiFetch.mockReturnValueOnce(new Promise((r) => (resolve = r)));

    const first = pingDailyActivity(user("u1"), "android_app", morning);
    const second = pingDailyActivity(user("u1"), "android_app", morning);
    resolve({ recorded: true });
    await Promise.all([first, second]);

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("실패하면 표시를 남기지 않아 다음 복귀 때 다시 시도하고, 예외를 밖으로 던지지 않는다", async () => {
    apiFetch.mockRejectedValueOnce(new Error("offline"));

    await expect(pingDailyActivity(user("u1"), "web", morning)).resolves.toBeUndefined();
    await pingDailyActivity(user("u1"), "web", evening);

    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("저장소가 막힌 환경(프라이빗 모드)에서도 앱 흐름을 막지 않는다", async () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    });

    await expect(pingDailyActivity(user("u1"), "web", morning)).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
