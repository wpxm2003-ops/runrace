/** 경로 위경도 경계 박스. */
export type PathBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/**
 * 경로의 위경도 최소/최대를 단일 순회로 계산한다.
 * `Math.min(...lats)` 스프레드는 점이 많은 트랙에서 콜스택 한계를 넘길 수 있어 reduce 방식으로 대체한다.
 * 빈 배열이면 모든 값이 ±Infinity이므로 호출부에서 비어있지 않음을 보장해야 한다.
 */
export function pathBounds(path: { lat: number; lng: number }[]): PathBounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of path) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}
