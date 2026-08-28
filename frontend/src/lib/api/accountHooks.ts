import useSWR from "swr";
import type { User } from "firebase/auth";
import { reportClientError } from "./errors";
import { fetchMe } from "./auth";
import { fetchNotificationSetting } from "./push";
import { fetchLiveProgressSetting } from "./challenges";
import { SWR_ERROR_RETRY } from "./swrConfig";

const onError = (error: unknown) => {
  void reportClientError({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    kind: "swr",
  });
};

const COLD_CONFIG = {
  revalidateOnMount: true,
  revalidateOnFocus: false,
  keepPreviousData: true,
  dedupingInterval: 3000,
  onError,
  ...SWR_ERROR_RETRY,
};

const LIVE_CONFIG = { ...COLD_CONFIG, revalidateOnFocus: true, dedupingInterval: 0 };

/** 내 프로필·사용자별 환경설정은 계정 도메인 전용 훅으로 분리한다. */
export function useMe(user: User | null) {
  return useSWR(
    user ? (["me", user.uid] as const) : null,
    () => fetchMe(user!),
    LIVE_CONFIG,
  );
}

/** 푸시 수신 설정 — 내정보 토글용. */
export function useNotificationSetting(user: User | null) {
  return useSWR(
    user ? (["notification-setting", user.uid] as const) : null,
    () => fetchNotificationSetting(user!),
    COLD_CONFIG,
  );
}

/** 실시간 진행률 공유 설정(공개/크루 두 축) — 내정보 토글용. */
export function useLiveProgressSetting(user: User | null) {
  return useSWR(
    user ? (["live-progress-setting", user.uid] as const) : null,
    () => fetchLiveProgressSetting(user!),
    COLD_CONFIG,
  );
}
