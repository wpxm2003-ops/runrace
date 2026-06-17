import type { ReactNode, SVGProps } from "react";
import { pathBounds } from "@/lib/pathBounds";

export type PathPoint = { lat: number; lng: number };

/**
 * 위경도 경로를 주어진 박스(width×height, padding)에 맞춰 화면 좌표로 정규화한다.
 * 종횡비를 유지(min scale)하고 박스 중앙에 배치한다. 빈 경로면 빈 배열.
 */
export function normalizePath(
  points: PathPoint[],
  width: number,
  height: number,
  padding: number,
): [number, number][] {
  if (points.length === 0) return [];
  const { minLat, maxLat, minLng, maxLng } = pathBounds(points);
  const latRange = maxLat - minLat || 1e-6;
  const lngRange = maxLng - minLng || 1e-6;
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;
  const scale = Math.min(drawW / lngRange, drawH / latRange);
  const offX = (drawW - lngRange * scale) / 2;
  const offY = (drawH - latRange * scale) / 2;
  return points.map((p) => [
    padding + offX + (p.lng - minLng) * scale,
    padding + offY + (maxLat - p.lat) * scale,
  ]);
}

type RoutePathProps = {
  path: PathPoint[];
  width: number;
  height: number;
  padding: number;
  /** 네온 경로 선 두께 [글로우, 중간, 코어] */
  strokeWidths: [number, number, number];
  /** 시작점 반지름 */
  startRadius: number;
  /** 종료점 반지름 */
  endRadius: number;
  /** 종료점 외곽선 두께 */
  endStrokeWidth: number;
  /** svg 래퍼 속성(className 또는 width/height·aria 등) */
  svgProps?: SVGProps<SVGSVGElement>;
  /** 경로가 비었을 때 대체 렌더(기본: 아무것도 안 그림) */
  empty?: ReactNode;
};

/**
 * 다크 배경 전용 네온 러닝 경로 SVG. 스토리 저장 카드(큰 사이즈)와
 * 공유 페이지 미리보기(작은 사이즈)가 두께·반지름만 달리해서 공유한다.
 */
export function RoutePath({
  path,
  width,
  height,
  padding,
  strokeWidths,
  startRadius,
  endRadius,
  endStrokeWidth,
  svgProps,
  empty = null,
}: RoutePathProps) {
  const pts = normalizePath(path, width, height, padding);
  if (pts.length === 0) return <>{empty}</>;

  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];
  const [glow, mid, core] = strokeWidths;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} {...svgProps}>
      <path d={d} fill="none" stroke="#22C55E" strokeWidth={glow} strokeLinecap="round" strokeLinejoin="round" opacity="0.10" />
      <path d={d} fill="none" stroke="#34D399" strokeWidth={mid} strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
      <path d={d} fill="none" stroke="#4ADE80" strokeWidth={core} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx} cy={sy} r={startRadius} fill="#4ADE80" />
      <circle cx={ex} cy={ey} r={endRadius} fill="#FFFFFF" stroke="#4ADE80" strokeWidth={endStrokeWidth} />
    </svg>
  );
}
