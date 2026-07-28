/** 페이스·속도·완주 시간 계산 유틸. 시간은 초, 거리는 km canonical. 표시는 units.ts 포맷터 사용. */

const KM_PER_MI = 1.609344;

/** 공식 레이스 거리(km). */
export const RACE_DISTANCES_KM = {
  k5: 5,
  k10: 10,
  half: 21.0975,
  full: 42.195,
} as const;

/** km/h → 초/km 페이스. 0 이하·비유한 값은 NaN. */
export function paceSecFromSpeedKmh(kmh: number): number {
  if (!Number.isFinite(kmh) || kmh <= 0) return NaN;
  return 3600 / kmh;
}

/** 초/km 페이스 → km/h. 0 이하·비유한 값은 NaN. */
export function speedKmhFromPaceSec(secPerKm: number): number {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return NaN;
  return 3600 / secPerKm;
}

/** km/h → mph. */
export function mphFromKmh(kmh: number): number {
  return kmh / KM_PER_MI;
}

/** 거리(km) + 총 시간(초) → 초/km 페이스. 유효하지 않으면 NaN. */
export function paceSecFromFinish(distanceKm: number, finishSec: number): number {
  if (!(distanceKm > 0) || !(finishSec > 0)) return NaN;
  return finishSec / distanceKm;
}

/** 거리(km) + 페이스(초/km) → 완주 시간(초). 유효하지 않으면 NaN. */
export function finishSecFromPace(distanceKm: number, paceSecPerKm: number): number {
  if (!(distanceKm > 0) || !(paceSecPerKm > 0)) return NaN;
  return distanceKm * paceSecPerKm;
}

/**
 * 초 → "H:MM:SS"(1시간 미만은 분 무패딩 "M:SS", 예: 303초 → "5:03"). 비정상 값은 "-".
 *
 * ⚠️ 시간 포맷터는 이 프로젝트에 둘이고 **1시간 미만일 때 출력이 다르다**. 새로 만들지 말고 둘 중 하나를 골라 써라.
 * - `formatHms`(여기): 분 무패딩 — 기록·계산 결과용(페이스 계산기, 트레드밀, 개인 최고 기록, 비교 카드).
 * - {@link import("./workoutTrack").formatDuration}: 분 0패딩 "MM:SS" — 운동 시간 표시용(기록 목록·공유 카드 등 10곳).
 * 둘을 하나로 합치려면 화면 표기가 바뀌므로 순수 리팩토링이 아니다(별도 결정 필요).
 */
export function formatHms(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "-";
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 구간 통과 지점(km) 목록: 15km 초과는 5km 간격, 그 외 1km 간격 + 최종 지점. */
export function splitPointsKm(distanceKm: number): number[] {
  if (!(distanceKm > 0) || !Number.isFinite(distanceKm)) return [];
  const step = distanceKm > 15 ? 5 : 1;
  const points: number[] = [];
  for (let d = step; d < distanceKm; d += step) points.push(d);
  points.push(distanceKm);
  return points;
}
