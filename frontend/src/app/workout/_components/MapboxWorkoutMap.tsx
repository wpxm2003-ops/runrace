"use client";

import { ghostPositionAtElapsed, ghostTrailAtElapsed } from "@/lib/ghostRace";
import { pathBoundsKey, splitPathAtGaps, type LatLng } from "@/lib/workoutTrack";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import mapboxgl, {
  type GeoJSONSource,
} from "mapbox-gl";
import { useEffect, useMemo, useRef } from "react";

import "mapbox-gl/dist/mapbox-gl.css";

const DEFAULT_CENTER: [number, number] = [126.978, 37.5665];
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
/** 카카오 지도 level 3과 비슷한 배율. */
const DEFAULT_ZOOM = 16;

const SOURCE_IDS = {
  route: "workout-route",
  gaps: "workout-route-gaps",
  position: "workout-position",
  ghostRoute: "ghost-route",
  ghostTrail: "ghost-trail",
  ghostPosition: "ghost-position",
} as const;

type WorkoutMapProps = {
  path: LatLng[];
  position: LatLng | null;
  follow: boolean;
  ghostPath?: LatLng[] | null;
  ghostElapsedMs?: number;
};

type MapData = {
  route: FeatureCollection<LineString>;
  gaps: FeatureCollection<LineString>;
  position: FeatureCollection<Point>;
  ghostRoute: FeatureCollection<LineString>;
  ghostTrail: FeatureCollection<LineString>;
  ghostPosition: FeatureCollection<Point>;
};

function coordinates(point: LatLng): [number, number] {
  return [point.lng, point.lat];
}

function lineCollection(lines: LatLng[][]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: lines
      .filter((line) => line.length >= 2)
      .map((line): Feature<LineString> => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: line.map(coordinates) },
      })),
  };
}

function pointCollection(point: LatLng | null): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: point
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: coordinates(point) },
          },
        ]
      : [],
  };
}

function addMapData(map: mapboxgl.Map, data: MapData) {
  map.addSource(SOURCE_IDS.route, { type: "geojson", data: data.route });
  map.addSource(SOURCE_IDS.gaps, { type: "geojson", data: data.gaps });
  map.addSource(SOURCE_IDS.ghostRoute, { type: "geojson", data: data.ghostRoute });
  map.addSource(SOURCE_IDS.ghostTrail, { type: "geojson", data: data.ghostTrail });
  map.addSource(SOURCE_IDS.position, { type: "geojson", data: data.position });
  map.addSource(SOURCE_IDS.ghostPosition, { type: "geojson", data: data.ghostPosition });

  map.addLayer({
    id: SOURCE_IDS.ghostRoute,
    type: "line",
    source: SOURCE_IDS.ghostRoute,
    paint: {
      "line-color": "#7c3aed",
      "line-width": 3,
      "line-opacity": 0.42,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: SOURCE_IDS.ghostTrail,
    type: "line",
    source: SOURCE_IDS.ghostTrail,
    paint: { "line-color": "#7c3aed", "line-width": 5, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: SOURCE_IDS.route,
    type: "line",
    source: SOURCE_IDS.route,
    paint: { "line-color": "#18181b", "line-width": 5, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: SOURCE_IDS.gaps,
    type: "line",
    source: SOURCE_IDS.gaps,
    paint: {
      "line-color": "#a1a1aa",
      "line-width": 3,
      "line-opacity": 0.8,
      "line-dasharray": [2, 2.5],
    },
  });
  map.addLayer({
    id: SOURCE_IDS.ghostPosition,
    type: "circle",
    source: SOURCE_IDS.ghostPosition,
    paint: {
      "circle-radius": 7,
      "circle-color": "#7c3aed",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });
  map.addLayer({
    id: SOURCE_IDS.position,
    type: "circle",
    source: SOURCE_IDS.position,
    paint: {
      "circle-radius": 8,
      "circle-color": "#3b82f6",
      "circle-stroke-color": "#18181b",
      "circle-stroke-width": 3,
    },
  });
}

function updateMapData(map: mapboxgl.Map, data: MapData) {
  if (!map.loaded()) return;
  for (const [key, sourceId] of Object.entries(SOURCE_IDS)) {
    (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data[key as keyof MapData]);
  }
}

export default function MapboxWorkoutMap({
  path,
  position,
  follow,
  ghostPath,
  ghostElapsedMs = 0,
}: WorkoutMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const latestDataRef = useRef<MapData | null>(null);
  const latestViewportRef = useRef({ path, position, follow });
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();

  const data = useMemo<MapData>(() => {
    const segments = splitPathAtGaps(path);
    const currentGhostPosition =
      ghostPath && ghostPath.length > 0
        ? ghostPositionAtElapsed(ghostPath, ghostElapsedMs)
        : null;
    const currentGhostTrail =
      ghostPath && ghostPath.length > 0
        ? ghostTrailAtElapsed(ghostPath, ghostElapsedMs)
        : [];

    return {
      route: lineCollection(segments.solidLines),
      gaps: lineCollection(segments.gapLines),
      position: pointCollection(position),
      ghostRoute: lineCollection(ghostPath ? [ghostPath] : []),
      ghostTrail: lineCollection([currentGhostTrail]),
      ghostPosition: pointCollection(currentGhostPosition),
    };
  }, [path, position, ghostPath, ghostElapsedMs]);

  latestDataRef.current = data;
  latestViewportRef.current = { path, position, follow };

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    const initialViewport = latestViewportRef.current;
    const initialCenter = initialViewport.position
      ? coordinates(initialViewport.position)
      : initialViewport.path[0]
        ? coordinates(initialViewport.path[0])
        : DEFAULT_CENTER;
    const map = new mapboxgl.Map({
      accessToken: token,
      container: containerRef.current,
      style: MAP_STYLE,
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      if (!latestDataRef.current) return;
      addMapData(map, latestDataRef.current);
      const viewport = latestViewportRef.current;
      if (viewport.follow && viewport.position) {
        map.jumpTo({ center: coordinates(viewport.position), zoom: DEFAULT_ZOOM });
      } else if (viewport.path.length >= 2) {
        const bounds = viewport.path.reduce(
          (nextBounds, point) => nextBounds.extend(coordinates(point)),
          new mapboxgl.LngLatBounds(
            coordinates(viewport.path[0]),
            coordinates(viewport.path[0]),
          ),
        );
        map.fitBounds(bounds, { padding: 36, duration: 0 });
      }
      map.resize();
    });

    const parent = containerRef.current.parentElement;
    const observer =
      parent && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => map.resize())
        : null;
    if (parent) observer?.observe(parent);

    return () => {
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) updateMapData(map, data);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position || !map.loaded()) return;
    if (follow) {
      map.easeTo({ center: coordinates(position), duration: 350 });
    } else if (path.length < 2) {
      map.jumpTo({ center: coordinates(position), zoom: DEFAULT_ZOOM });
      map.resize();
    }
  }, [position, follow, path.length]);

  const boundsKey = pathBoundsKey(path);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || follow || path.length < 2 || !map.loaded()) return;

    const bounds = path.reduce(
      (nextBounds, point) => nextBounds.extend(coordinates(point)),
      new mapboxgl.LngLatBounds(coordinates(path[0]), coordinates(path[0])),
    );
    map.fitBounds(bounds, { padding: 36, duration: 0 });
    map.resize();
  }, [boundsKey, follow, path]);

  // mapbox-gl이 컨테이너에 .mapboxgl-map(position: relative)을 덧씌워 Tailwind의
  // absolute와 충돌하므로, 위치는 바깥 래퍼가 잡고 컨테이너는 크기만 채운다.
  return (
    <div className="absolute inset-0 z-0">
      <div ref={containerRef} className="h-full w-full bg-zinc-200" />
    </div>
  );
}
