import type { User } from "firebase/auth";
import { getStoredAuthUid } from "@/lib/accessToken";
import { appMutate } from "@/lib/swrMutate";
import { reportClientError } from "./errors";
import { SWR_ERROR_RETRY } from "./swrConfig";

const onSwrError = (error: unknown) => {
  void reportClientError({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    kind: "swr",
  });
};

/** 캐시 키용 uid — 로그인 uid → 저장 토큰 uid → 익명 폴백(기본 null). */
export function cacheUid(
  user?: User | null,
  anonymous: string | null = null,
): string | null {
  return user?.uid ?? getStoredAuthUid() ?? anonymous;
}

/** [prefix, id, ...] 키 캐시 무효화. id 생략 시 prefix 전체. */
export function invalidateByPrefix(prefix: string, id?: string | number) {
  void appMutate(
    (key) => Array.isArray(key) && key[0] === prefix && (id === undefined || key[1] === id),
  );
}

export const BASE_CONFIG = {
  revalidateOnMount: true,
  revalidateOnFocus: false,
  keepPreviousData: true,
  dedupingInterval: 3000,
  onError: onSwrError,
  ...SWR_ERROR_RETRY,
};

export const COLD_CONFIG = { ...BASE_CONFIG, revalidateOnFocus: false };

export const LIVE_CONFIG = {
  revalidateOnMount: true,
  revalidateOnFocus: true,
  keepPreviousData: true,
  dedupingInterval: 0,
  onError: onSwrError,
  ...SWR_ERROR_RETRY,
};

export const SWR_INFINITE_CONFIG = {
  revalidateFirstPage: true,
  revalidateOnFocus: true,
  keepPreviousData: true,
  persistSize: true,
  dedupingInterval: 0,
  ...SWR_ERROR_RETRY,
};
