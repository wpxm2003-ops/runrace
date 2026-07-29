import { localJson } from "./safeStorage";
import type { WorkoutFinishSnapshot } from "./workoutTrack";
import type { GhostRaceResult } from "./ghostRace";
import type { NsmSessionLogBody } from "./api/types";

/**
 * 종료됐지만 서버 저장 성공을 아직 확인 못 한 운동 — 로컬에 보관해 POST 도중 앱이 죽거나
 * 사용자가 다른 화면으로 이동해도 유실되지 않게 한다.
 *
 * useWorkoutSession의 진행 중 세션 저장소(sessionStorage, "runrace_workout")와는 목적이 다르다 —
 * 그건 "진행 중 복원"용이고 이건 "종료했지만 서버 확인 못 받음 복원"용이라 localStorage를 쓴다
 * (Android WebView 프로세스가 죽어도 sessionStorage와 달리 살아남는다).
 *
 * 슬롯은 1개뿐이다 — 두 번째 실패가 첫 번째 미해결 실패를 덮어쓸 수 있다(둘 다 저장 실패가
 * 연달아 나는 드문 경우). 흔한 단일 실패 시나리오를 고치는 게 목적이라 감수한다.
 */
export type PendingWorkoutSave = {
  /** 저장 시점의 Firebase UID — 같은 기기에서 계정을 전환해도 다른 사용자의 실패한 런(GPS 경로 포함)이 복원되지 않게 한다. */
  ownerUid: string;
  snapshot: WorkoutFinishSnapshot;
  ghostWorkoutId: number | null;
  ghostResult: GhostRaceResult | null;
  ghostLabel: string | null;
  showNsmCta: boolean;
  nsmLog: NsmSessionLogBody | null;
};

const store = localJson<PendingWorkoutSave>("runrace_workout_pending_save");

export function savePendingWorkoutSave(data: PendingWorkoutSave): void {
  store.set(data);
}

/** 방금 저장에 성공한 스냅샷이 보관 중이던 것과 같을 때만 지운다(다른 미해결 실패를 덮어쓰지 않게). */
export function clearPendingWorkoutSaveIfMatches(clientWorkoutId: string): void {
  const current = store.get();
  if (!current || current.snapshot.clientWorkoutId === clientWorkoutId) {
    store.remove();
  }
}

/**
 * uid가 저장된 소유자와 일치할 때만 반환한다. 다른 계정 소유 데이터는 지우지 않고 그대로
 * 둔다 — 원래 소유자가 나중에 같은 기기로 재로그인하면 여전히 복구할 수 있어야 한다.
 */
export function loadPendingWorkoutSave(uid: string): PendingWorkoutSave | null {
  const current = store.get();
  if (!current || current.ownerUid !== uid) return null;
  return current;
}
