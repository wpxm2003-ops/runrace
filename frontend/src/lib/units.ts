/** 거리 단위 변환·표시. 측정/저장은 항상 미터(또는 km) canonical, 표시 단계에서만 변환한다. */

export type DistanceUnit = "km" | "mi";

const METERS_PER_KM = 1000;
const METERS_PER_MI = 1609.344;
const KM_PER_MI = 1.609344;

/** 미터 → 선택 단위 거리 문자열 (소수 2자리 + 단위 라벨). 예: "1.23 km" / "0.76 mi" */
export function formatDistance(distanceM: number, unit: DistanceUnit): string {
  const per = unit === "mi" ? METERS_PER_MI : METERS_PER_KM;
  return `${(distanceM / per).toFixed(2)} ${unit}`;
}

/** km 값(레이스 목표·누적 거리 등 이미 km인 값) → 선택 단위 숫자 문자열(단위 미포함, 소수 2자리). */
export function formatDistanceAmount(km: string | number, unit: DistanceUnit): string {
  const n = typeof km === "string" ? Number(km) : km;
  if (!Number.isFinite(n)) return String(km);
  const value = unit === "mi" ? n / KM_PER_MI : n;
  return value.toFixed(2);
}

/** 레이스 목표 최대값(canonical km). 백엔드 validateRoomInput과 일치. */
export const GOAL_MAX_KM = 1000;

/** 불필요한 끝자리 0을 없앤 숫자 문자열. */
function trimNum(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}

/** 레이스 목표 표시: 선택 단위로 변환 + 단위 라벨(소수 끝자리 0 제거). */
export function formatGoalDistance(km: number, unit: DistanceUnit): string {
  const v = unit === "mi" ? km / KM_PER_MI : km;
  return `${trimNum(v, 1)} ${unit}`;
}

/** 목표 입력(선택 단위 문자열) → canonical km 숫자. 유효하지 않으면 NaN. */
export function goalKmFromInput(value: string, unit: DistanceUnit): number {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return NaN;
  return unit === "mi" ? v * KM_PER_MI : v;
}

/** canonical km 목표 → 입력칸 표시 문자열(선택 단위, 끝자리 0 제거). */
export function goalInputFromKm(km: number, unit: DistanceUnit): string {
  const v = unit === "mi" ? km / KM_PER_MI : km;
  return trimNum(v, unit === "mi" ? 1 : 3);
}

/** 목표 최대값(=GOAL_MAX_KM km)을 선택 단위로. 입력 클램프·안내에 사용. */
export function goalMaxInUnit(unit: DistanceUnit): number {
  return unit === "mi" ? Math.floor((GOAL_MAX_KM / KM_PER_MI) * 10) / 10 : GOAL_MAX_KM;
}

/** 사용자가 선택 단위로 입력한 거리 → 미터(반올림). 유효하지 않으면 NaN. */
export function metersFromInput(value: string, unit: DistanceUnit): number {
  const per = unit === "mi" ? METERS_PER_MI : METERS_PER_KM;
  return Math.round(parseFloat(value) * per);
}

/** 사용자가 선택 단위로 입력한 거리 → km 숫자(거리 동기화용). */
export function kmFromInput(value: string, unit: DistanceUnit): number {
  const v = Number(value);
  return unit === "mi" ? v * KM_PER_MI : v;
}

/** 미터+초 → 선택 단위 기준 페이스("m'ss"" / 단위당). 단위가 마일이면 min/mi. */
export function formatPace(distanceM: number, elapsedSec: number, unit: DistanceUnit): string {
  if (distanceM < 10 || elapsedSec < 1) return "-";
  const per = unit === "mi" ? METERS_PER_MI : METERS_PER_KM;
  const secPerUnit = elapsedSec / (distanceM / per);
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}
