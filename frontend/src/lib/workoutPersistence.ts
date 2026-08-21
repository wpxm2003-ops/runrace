import type { IdleAnchor, LatLng } from "./workoutTrack";
import { localJson, sessionJson } from "./safeStorage";

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

// A locked Android WebView can be reclaimed by the OS. sessionStorage dies with
// that renderer, while localStorage survives and lets the saved session resume
// after the app is opened again. Keep a one-time sessionStorage fallback so an
// in-progress workout from the previous app version is not discarded on update.
const store = localJson<PersistedWorkout>("runrace_workout");
const legacySessionStore = sessionJson<PersistedWorkout>("runrace_workout");

/**
 * 다른 런의 스냅샷이 이 시간 안에 갱신됐으면 아직 쓰이는 중으로 본다(저장 주기 10초의 여섯 배).
 *
 * <p>"침묵 = 닫힘"은 아니다 — 브라우저는 백그라운드 탭의 타이머를 분 단위로 늦추므로,
 * 오래 가려져 있던 탭도 침묵한다. 그 경우 새 런이 자리를 가져가고 원래 탭은 이후 저장이
 * 거부된다(라이브 기록은 계속되지만 새로고침 후 복구는 못 한다). 화면에 떠 있는 쪽이
 * 자리를 갖는 편이 낫다고 보고 이 손실을 받아들인다.
 */
const SNAPSHOT_CLAIM_TTL_MS = 60_000;

/**
 * 진행 중 스냅샷을 저장한다.
 *
 * <p>키는 하나뿐인데 웹은 탭을 여러 개 열 수 있다(안드로이드 앱은 WebView가 하나라 해당
 * 없음). 그냥 덮어쓰면 두 탭이 각자 운동 중일 때 10초마다 서로의 기록을 밀어내, 둘 다
 * 새로고침 후 복구가 어긋난다. 먼저 자리를 잡은 런이 살아있는 동안에는 다른 런이
 * 덮지 않는다 — 나중 런은 라이브로는 정상 동작하되 복구 대상이 되지 않을 뿐이다.
 *
 * <p>읽기와 쓰기 사이의 경쟁까지 막지는 못한다. localStorage에는 비교·교환이 없어서,
 * 두 탭이 거의 동시에 시작하면 둘 다 "빈 자리"를 읽고 나중 쓰기가 이긴다. 창이 한 틱이라
 * 실사용 영향은 미미하고, 대안은 저장소를 통째로 바꾸는 것뿐이다.
 */
export function saveWorkout(data: Omit<PersistedWorkout, "savedAt">): void {
  const now = Date.now();
  const existing = store.get();
  if (
    existing != null
    && existing.runStartedAt !== data.runStartedAt
    && now - existing.savedAt < SNAPSHOT_CLAIM_TTL_MS
  ) {
    return;
  }
  store.set({ ...data, savedAt: now });
}

function loadWorkout(): PersistedWorkout | null {
  let data = store.get();
  if (!data) {
    const legacy = legacySessionStore.get();
    if (legacy) {
      // Do not erase the old session if a privacy mode or storage quota blocks
      // the migration. Returning it still preserves the existing in-memory tab.
      store.set(legacy);
      const migrated = store.get();
      if (migrated) {
        legacySessionStore.remove();
        data = migrated;
      } else {
        data = legacy;
      }
    }
  }
  if (!data) return null;
  if (Date.now() - data.savedAt > MAX_AGE_MS) {
    clearWorkout();
    return null;
  }
  return data;
}

/**
 * 만료된 스냅샷을 인증과 무관하게 즉시 버린다.
 *
 * <p>만료 검사는 {@link loadWorkout} 안에서만 돌았고, 그 함수는 인증이 확정되고
 * 소유자가 일치할 때만 호출된다. 그래서 로그아웃 상태로 열거나 다른 계정으로 로그인하면
 * 24시간이 지난 정밀 GPS 경로가 계속 남아 있었다 — 문서상 보존 기간과 실제가 달랐다.
 * 앱이 뜰 때 한 번 호출해 소유자와 무관하게 정리한다.
 *
 * <p>앱을 다시 열지 않는 경우까지 막을 수는 없다(브라우저 저장소에는 만료 개념이 없다).
 * 그쪽은 안드로이드 자동 백업 제외(allowBackup=false)로 유출 경로만 끊어 뒀다.
 */
export function purgeExpiredWorkout(): void {
  const data = store.get() ?? legacySessionStore.get();
  if (data == null) return;
  if (Date.now() - data.savedAt > MAX_AGE_MS) clearWorkout();
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

/**
 * 저장된 세션을 지운다.
 *
 * <p>{@code runStartedAt}을 주면 그 런의 스냅샷일 때만 지운다. localStorage로 옮긴 뒤로는
 * 모든 탭이 키 하나를 공유하므로, 한 탭에서 운동을 끝내며 무조건 지우면 다른 탭에서
 * 진행 중이던 런의 스냅샷까지 함께 날아가 새로고침 후 복구가 불가능해진다.
 * (안드로이드 앱은 WebView가 하나라 해당 없지만 웹은 탭을 여러 개 열 수 있다.)
 */
export function clearWorkout(runStartedAt?: number): void {
  if (runStartedAt != null) {
    const saved = store.get();
    if (saved != null && saved.runStartedAt !== runStartedAt) return;
  }
  store.remove();
  legacySessionStore.remove();
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
