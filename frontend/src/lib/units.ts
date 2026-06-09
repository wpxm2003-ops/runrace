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

/** 미터+초 → 선택 단위 기준 페이스("m'ss"" / 단위당). 단위가 마일이면 min/mi. */
export function formatPace(distanceM: number, elapsedSec: number, unit: DistanceUnit): string {
  if (distanceM < 10 || elapsedSec < 1) return "-";
  const per = unit === "mi" ? METERS_PER_MI : METERS_PER_KM;
  const secPerUnit = elapsedSec / (distanceM / per);
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}
