"use client";

import { pathBoundsKey, splitPathAtGaps, type LatLng } from "@/lib/workoutTrack";
import { latLngBounds } from "leaflet";
import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 };

function toTuple(p: LatLng): [number, number] {
  return [p.lat, p.lng];
}

function MapResize() {
  const map = useMap();

  useEffect(() => {
    const fix = () => map.invalidateSize();
    fix();
    const t1 = window.setTimeout(fix, 100);
    const t2 = window.setTimeout(fix, 400);

    const el = map.getContainer().parentElement;
    const ro =
      el && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => fix())
        : null;
    if (ro && el) ro.observe(el);

    window.addEventListener("resize", fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
      window.removeEventListener("resize", fix);
    };
  }, [map]);

  return null;
}

function MapFollower({
  position,
  follow,
  pathLength,
}: {
  position: LatLng | null;
  follow: boolean;
  pathLength: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;
    if (follow) {
      map.setView([position.lat, position.lng], map.getZoom(), {
        animate: true,
        duration: 0.35,
      });
      return;
    }
    // follow=false: 경로가 2점 이상이면 FitPathBounds가 전체 경로에 맞춤
    if (pathLength < 2) {
      map.setView([position.lat, position.lng], 17, { animate: false });
      map.invalidateSize();
    }
  }, [position, follow, pathLength, map]);

  return null;
}

type WorkoutMapProps = {
  path: LatLng[];
  position: LatLng | null;
  follow: boolean;
};

function FitPathBounds({ path, enabled }: { path: LatLng[]; enabled: boolean }) {
  const map = useMap();
  const boundsKey = pathBoundsKey(path);

  useEffect(() => {
    if (!enabled || path.length < 2) return;
    const bounds = latLngBounds(path.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [36, 36] });
    map.invalidateSize();
  }, [boundsKey, enabled, map, path]);

  return null;
}

export default function LeafletWorkoutMap({ path, position, follow }: WorkoutMapProps) {
  const center = position ?? path[0] ?? DEFAULT_CENTER;

  // 연속 두 점 사이 거리가 비정상적으로 크면(백그라운드로 추적이 끊긴 구간) 점선으로 표시한다.
  // path가 바뀔 때만 재계산 — 경로 변화 없는 리렌더에서 Polyline 재diff 방지.
  const { solidLines, gapLines } = useMemo(() => {
    const segments = splitPathAtGaps(path);
    return {
      solidLines: segments.solidLines.map((line) => line.map(toTuple)),
      gapLines: segments.gapLines.map((line) => line.map(toTuple)),
    };
  }, [path]);

  return (
    <div className="absolute inset-0 z-0">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={17}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapResize />
        <MapFollower position={position} follow={follow} pathLength={path.length} />
        <FitPathBounds path={path} enabled={!follow} />
        {solidLines.map((line, i) => (
          <Polyline
            key={`s${i}`}
            positions={line}
            pathOptions={{ color: "#18181b", weight: 5, opacity: 0.9 }}
          />
        ))}
        {gapLines.map((line, i) => (
          <Polyline
            key={`g${i}`}
            positions={line}
            pathOptions={{ color: "#a1a1aa", weight: 3, opacity: 0.8, dashArray: "6 8" }}
          />
        ))}
        {position ? (
          <CircleMarker
            center={[position.lat, position.lng]}
            radius={8}
            pathOptions={{
              color: "#18181b",
              fillColor: "#3b82f6",
              fillOpacity: 1,
              weight: 3,
            }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
