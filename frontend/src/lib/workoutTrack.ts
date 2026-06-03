export type LatLng = { lat: number; lng: number };

export type WorkoutStatus = "idle" | "running" | "paused";

export type WorkoutFinishSnapshot = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
};

const MIN_MOVE_METERS = 4;
const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function pathDistanceMeters(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineMeters(points[i - 1], points[i]);
  }
  return sum;
}

export function shouldAppendPoint(prev: LatLng | null, next: LatLng): boolean {
  if (!prev) return true;
  return haversineMeters(prev, next) >= MIN_MOVE_METERS;
}

export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatPaceMinPerKm(distanceM: number, elapsedSec: number): string {
  if (distanceM < 10 || elapsedSec < 1) return "-";
  const secPerKm = elapsedSec / (distanceM / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

/** 거리(km) 기준 대략 칼로리 (체중 65kg 러닝 가정) */
export function estimateCalories(distanceM: number): number {
  const km = distanceM / 1000;
  return Math.round(km * 65);
}

/** http://IP 등 비보안 페이지에서는 Geolocation API 사용 불가 */
export function geolocationBlockedReason(): string | null {
  if (typeof window === "undefined") return null;
  if (!navigator.geolocation) {
    return "이 기기에서는 위치(GPS) 기능을 사용할 수 없습니다.";
  }
  if (!window.isSecureContext) {
    return "GPS는 HTTPS(보안 접속)에서만 사용할 수 있습니다. http://IP 주소로는 브라우저가 위치를 막습니다. 도메인에 SSL을 붙이거나 localhost에서 테스트해 주세요.";
  }
  return null;
}

export function geolocationErrorMessage(err: GeolocationPositionError): string {
  const blocked = geolocationBlockedReason();
  if (blocked) return blocked;
  const msg = err.message || "";
  if (/secure origins/i.test(msg)) {
    return "GPS는 HTTPS(보안 접속)에서만 사용할 수 있습니다. 서버에 SSL(HTTPS)을 설정해 주세요.";
  }
  if (err.code === err.PERMISSION_DENIED) {
    return "위치 권한이 거부되었습니다. 브라우저 설정에서 이 사이트의 위치를 허용해 주세요.";
  }
  if (err.code === err.TIMEOUT) {
    return "위치 확인 시간이 초과되었습니다. GPS를 켠 뒤 다시 시도해 주세요.";
  }
  return msg || "위치를 가져올 수 없습니다.";
}
