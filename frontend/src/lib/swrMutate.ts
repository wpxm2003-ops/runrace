"use client";

import { mutate as defaultMutate } from "swr";
import type { Cache, ScopedMutator } from "swr";

/**
 * 앱 캐시에 바인딩된 mutate.
 *
 * 앱 전체가 SWRConfig 커스텀 provider(localStorage 영구 캐시) 안에서 동작하므로,
 * "swr"에서 import한 전역 mutate는 SWR 기본 캐시에 묶여 앱 훅에 전혀 닿지 않는다
 * (조용한 no-op — 실내런 승인 후 참여자 운동기록이 갱신되지 않던 원인).
 * AppShell의 SwrMutateBinder가 provider 캐시의 mutate를 {@link bindAppMutate}로 주입하고,
 * invalidate* 헬퍼들은 appMutate를 통해 실제 앱 캐시를 무효화한다.
 *
 * `export let`인 이유: ScopedMutator는 오버로드 인터페이스라 래퍼 함수로 감싸면
 * 타입 단언 없이는 시그니처를 보존할 수 없다. ES 모듈 live binding 덕에 import한
 * 쪽에서도 주입 이후의 값을 읽는다.
 */
export let appMutate: ScopedMutator = defaultMutate;
let appCache: Pick<Cache, "keys"> | null = null;

export function bindAppMutate(mutator: ScopedMutator): void {
  appMutate = mutator;
}

export function bindAppCache(cache: Pick<Cache, "keys"> | null): void {
  appCache = cache;
}

/** Snapshot serialized keys from the same custom provider used by appMutate. */
export function getAppCacheKeys(): string[] {
  return appCache ? Array.from(appCache.keys()) : [];
}
