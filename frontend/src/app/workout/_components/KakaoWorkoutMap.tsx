"use client";

import { pathBoundsKey, splitPathAtGaps, type LatLng } from "@/lib/workoutTrack";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Map, Polyline, CustomOverlayMap, useKakaoLoader } from "react-kakao-maps-sdk";

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 };

function fitPathBounds(map: kakao.maps.Map, path: LatLng[]) {
  if (path.length < 2) return;
  const bounds = new kakao.maps.LatLngBounds();
  path.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
  map.setBounds(bounds, 36, 36, 36, 36);
}

type WorkoutMapProps = {
  path: LatLng[];
  position: LatLng | null;
  follow: boolean;
};

export default function KakaoWorkoutMap({ path, position, follow }: WorkoutMapProps) {
  const [loading, error] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "",
  });

  const mapRef = useRef<kakao.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const center = position ?? path[0] ?? DEFAULT_CENTER;
  const boundsKey = pathBoundsKey(path);

  const { solidLines, gapLines } = useMemo(() => splitPathAtGaps(path), [path]);

  const scheduleFitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || follow || path.length < 2) return;
    fitPathBounds(map, path);
    const id = window.requestAnimationFrame(() => fitPathBounds(map, path));
    const t1 = window.setTimeout(() => fitPathBounds(map, path), 100);
    const t2 = window.setTimeout(() => fitPathBounds(map, path), 400);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [follow, path]);

  // follow 모드: 현재 위치로 카메라 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position || loading) return;
    if (follow) {
      map.panTo(new kakao.maps.LatLng(position.lat, position.lng));
    }
  }, [position, follow, loading]);

  // follow=false: 경로 전체가 보이도록 fitBounds (기록·상세 보기)
  useEffect(() => {
    if (loading || follow || path.length < 2) return;
    return scheduleFitBounds();
  }, [boundsKey, follow, loading, path.length, scheduleFitBounds]);

  // 카드 레이아웃 확정 후에도 전체 경로가 보이도록 재조정
  useEffect(() => {
    if (follow || path.length < 2) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => scheduleFitBounds());
    ro.observe(el);
    return () => ro.disconnect();
  }, [boundsKey, follow, path.length, scheduleFitBounds]);

  if (loading || error) {
    return <div className="absolute inset-0 z-0 bg-zinc-100" />;
  }

  return (
    <div ref={containerRef} className="absolute inset-0 z-0">
      <Map
        center={{ lat: center.lat, lng: center.lng }}
        level={follow ? 3 : undefined}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
        onCreate={(map) => {
          mapRef.current = map;
          if (!follow && path.length >= 2) {
            fitPathBounds(map, path);
            window.requestAnimationFrame(() => fitPathBounds(map, path));
            window.setTimeout(() => fitPathBounds(map, path), 100);
            window.setTimeout(() => fitPathBounds(map, path), 400);
          }
        }}
      >
        {solidLines.map((line, i) => (
          <Polyline
            key={`s${i}`}
            path={line.map((p) => ({ lat: p.lat, lng: p.lng }))}
            strokeWeight={5}
            strokeColor="#18181b"
            strokeOpacity={0.9}
            strokeStyle="solid"
          />
        ))}
        {gapLines.map((line, i) => (
          <Polyline
            key={`g${i}`}
            path={line.map((p) => ({ lat: p.lat, lng: p.lng }))}
            strokeWeight={3}
            strokeColor="#a1a1aa"
            strokeOpacity={0.8}
            strokeStyle="shortdot"
          />
        ))}
        {position && (
          <CustomOverlayMap position={{ lat: position.lat, lng: position.lng }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                backgroundColor: "#3b82f6",
                border: "3px solid #18181b",
                transform: "translate(-50%, -50%)",
              }}
            />
          </CustomOverlayMap>
        )}
      </Map>
    </div>
  );
}
