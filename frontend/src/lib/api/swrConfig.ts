import { isRetryableApiError } from "./apiError";

/** SWR 공통: 4xx는 재시도 안 함, 5xx·네트워크만 최대 2회 */
export const SWR_ERROR_RETRY = {
  shouldRetryOnError: isRetryableApiError,
  errorRetryCount: 2,
  errorRetryInterval: 3000,
} as const;
