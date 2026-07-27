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

function toTuple(point: LatLng): [number, number] {
  return [point.lat, point.lng];
}

function MapResize() {
  const map = useMap();

  useEffect(() => {
    const resize = () => map.invalidateSize();
    resize();
    const firstTimer = window.setTimeout(resize, 100);
    const secondTimer = window.setTimeout(resize, 400);
    const parent = map.getContainer().parentElement;
    const observer =
      parent && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resize)
        : null;

    if (parent) observer?.observe(parent);
    window.addEventListener("resize", resize);

    return () => {
      clearTimeout(firstTimer);
      clearTimeout(secondTimer);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
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
    } else if (pathLength < 2) {
      map.setView([position.lat, position.lng], 17, { animate: false });
      map.invalidateSize();
    }
  }, [position, follow, pathLength, map]);

  return null;
}

function FitPathBounds({ path, enabled }: { path: LatLng[]; enabled: boolean }) {
  const map = useMap();
  const boundsKey = pathBoundsKey(path);

  useEffect(() => {
    if (!enabled || path.length < 2) return;
    const bounds = latLngBounds(path.map(toTuple));
    map.fitBounds(bounds, { padding: [36, 36] });
    map.invalidateSize();
  }, [boundsKey, enabled, map, path]);

  return null;
}

type WorkoutMapProps = {
  path: LatLng[];
  position: LatLng | null;
  follow: boolean;
};

export default function LeafletWorkoutMap({
  path,
  position,
  follow,
}: WorkoutMapProps) {
  const center = position ?? path[0] ?? DEFAULT_CENTER;
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
        {solidLines.map((line, index) => (
          <Polyline
            key={`solid-${index}`}
            positions={line}
            pathOptions={{ color: "#18181b", weight: 5, opacity: 0.9 }}
          />
        ))}
        {gapLines.map((line, index) => (
          <Polyline
            key={`gap-${index}`}
            positions={line}
            pathOptions={{
              color: "#a1a1aa",
              weight: 3,
              opacity: 0.8,
              dashArray: "6 8",
            }}
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
