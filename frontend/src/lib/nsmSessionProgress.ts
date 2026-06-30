// NSM 런 중 렙 진행상태 영속화 — 탭 이탈/리마운트로 가이드가 0렙으로 리셋되지 않도록.
// 런 자체(distance/elapsed)는 useWorkoutSession이 복원하므로, 렙 baseline도 같이 복원해야 일관된다.

const KEY = "nsm_rep_progress_v1";

export type NsmProgress = {
  started: boolean;
  repIndex: number;
  phase: "work" | "rest" | "done";
  /** 현재 렙 시작 시점의 누적 거리(m) — 런의 distanceM과 같은 기준. */
  baseDist: number;
  /** 현재 렙 시작 시점의 경과초 — 런의 elapsedSec과 같은 기준. */
  baseSec: number;
  /** 휴식 종료 목표 경과초. */
  restEnd: number;
};

export function loadNsmProgress(): NsmProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as NsmProgress) : null;
  } catch {
    return null;
  }
}

export function saveNsmProgress(p: NsmProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage 불가 환경 무시 */
  }
}

export function clearNsmProgress(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}
