import type { IdleAnchor, LatLng } from "./workoutTrack";
import { sessionJson } from "./safeStorage";

export type PersistedWorkout = {
  /** 운동 시작 시점의 Firebase UID. 다른 계정으로는 복원·저장할 수 없다. */
  ownerUid: string;
  status: "running" | "paused";
  path: LatLng[];
  /**
   * 라이브 누적 거리(안티치트로 가산이 차단된 구간 제외).
   * 경로에서 재계산하면 차단 구간·추적 끊김이 직선으로 합산돼 부풀므로 값 자체를 저장한다.
   * 구버전 스냅샷엔 없을 수 있다.
   */
  distanceM?: number;
  runStartedAt: number;    // Date.now() when running began
  pausedAccumMs: number;   // total accumulated pause time in ms
  pauseStartedAt: number | null; // timestamp when current pause began
  /** 방치 자동 일시정지 판정 앵커. 구버전 스냅샷에는 없을 수 있다. */
  idleAnchor?: IdleAnchor;
  /** (구버전 스냅샷 전용) 마지막으로 실제 이동이 확인된 시각 — 앵커 복원 폴백에만 쓴다. */
  lastMovementAt?: number;
  /** 현재 일시정지가 방치 감지로 자동 전환된 것인지(배너·종료 시각 보정용). */
  autoPaused?: boolean;
  savedAt: number;         // Date.now() when this snapshot was written
};

/** 24시간 지난 세션은 버린다. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const store = sessionJson<PersistedWorkout>("runrace_workout");

export function saveWorkout(data: Omit<PersistedWorkout, "savedAt">): void {
  store.set({ ...data, savedAt: Date.now() });
}

function loadWorkout(): PersistedWorkout | null {
  const data = store.get();
  if (!data) return null;
  if (Date.now() - data.savedAt > MAX_AGE_MS) {
    clearWorkout();
    return null;
  }
  return data;
}

/**
 * 저장 시점의 Firebase UID가 현재 인증 사용자와 정확히 일치할 때만 복원한다.
 *
 * 다른 계정 데이터와 ownerUid가 없던 구버전 저장본은 지우지 않고 숨긴다. 소유자를
 * 추측해 현재 계정에 붙이면 이 함수가 막으려는 계정 간 GPS 오귀속을 다시 만들 수 있다.
 */
export function loadWorkoutForOwner(ownerUid: string): PersistedWorkout | null {
  const data = loadWorkout();
  return data?.ownerUid === ownerUid ? data : null;
}

export function clearWorkout(): void {
  store.remove();
}

/**
 * 유령 선택 — 러닝 본체(path 등)와 별개 저장소.
 * 백그라운드 전환으로 WebView가 재구성돼도(런 자체는 위 store가 복원) 고른 유령을 잃지 않게
 * id만 저장해두고, 복귀 시 상세를 다시 조회해 복원한다.
 */
const ghostStore = sessionJson<{ workoutId: number }>("runrace_workout_ghost");

export function saveGhostSelection(workoutId: number): void {
  ghostStore.set({ workoutId });
}

export function loadGhostSelection(): number | null {
  return ghostStore.get()?.workoutId ?? null;
}

export function clearGhostSelection(): void {
  ghostStore.remove();
}
