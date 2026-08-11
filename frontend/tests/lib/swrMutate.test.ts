import { describe, expect, it } from "vitest";
import { mutate as defaultMutate } from "swr";
import {
  appMutate,
  bindAppCache,
  bindAppMutate,
  getAppCacheKeys,
} from "@/lib/swrMutate";

/**
 * 앱은 SWRConfig 커스텀 provider를 쓰므로 "swr"의 전역 mutate는 앱 캐시에 닿지 않는다.
 * invalidate* 헬퍼가 쓰는 appMutate가 바인더 주입값으로 교체되는지(live binding) 고정한다.
 */
describe("swrMutate", () => {
  it("바인딩 전에는 swr 기본 mutate를 가리킨다", () => {
    expect(appMutate).toBe(defaultMutate);
  });

  it("bindAppMutate 주입 후 appMutate가 주입된 mutator로 위임된다", async () => {
    const calls: unknown[][] = [];
    const injected = ((...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(undefined);
    }) as typeof defaultMutate;

    bindAppMutate(injected);
    try {
      const key = ["challenge", 7, "workouts", "uid-1"];
      await appMutate(key);
      expect(calls).toEqual([[key]]);
    } finally {
      bindAppMutate(defaultMutate);
    }
  });

  it("reads keys from the bound app cache provider", () => {
    const key = "$inf$@\"challenges-page\",null,\"ko\",\"active\",0,";
    const cache = new Map<string, never>([[key, undefined as never]]);
    bindAppCache(cache);
    try {
      expect(getAppCacheKeys()).toEqual([key]);
    } finally {
      bindAppCache(null);
    }
  });
});
