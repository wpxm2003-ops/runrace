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
/**
 * streets-v12 — 공원 초록·물 파랑 등 러너에게 필요한 지형 색이 들어간다.
 * light-v11은 더 가볍지만 데이터 오버레이용 무채색 베이스맵이라 지형이 전혀 구분되지 않는다.
 */
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
/**
 * CJK 글자는 기기 폰트로 렌더한다. 지정하지 않으면 한글 글리프를 서버에서 내려받는데,
 * 글자 수가 많아 요청이 무겁다(한국에서 체감 로딩이 느린 주된 원인).
 */
const LOCAL_IDEOGRAPH_FONT = "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
/** 카카오 지도 level 3과 비슷한 배율. */
const DEFAULT_ZOOM = 16;

const SOURCE_IDS = {
  route: "workout-route",
  gaps: "workout-route-gaps",
  position: "workout-position",
  ghostRoute: "ghost-route",
  ghostTrail: "ghost-trail",
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
  /** 유령 현재 위치 — HTML 마커(👻)로 그리므로 GeoJSON 소스가 아니다. */
  ghostPoint: LatLng | null;
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

  map.addLayer({
    id: SOURCE_IDS.ghostRoute,
    type: "line",
    source: SOURCE_IDS.ghostRoute,
    paint: {
      "line-color": "#8b5cf6",
      "line-width": 3,
      "line-opacity": 0.25,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: SOURCE_IDS.ghostTrail,
    type: "line",
    source: SOURCE_IDS.ghostTrail,
    paint: { "line-color": "#8b5cf6", "line-width": 4, "line-opacity": 0.75 },
  });
  map.addLayer({
    id: SOURCE_IDS.route,
    type: "line",
    source: SOURCE_IDS.route,
    paint: { "line-color": "#FF5A16", "line-width": 5, "line-opacity": 0.9 },
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
    id: SOURCE_IDS.position,
    type: "circle",
    source: SOURCE_IDS.position,
    paint: {
      "circle-radius": 8,
      "circle-color": "#3b82f6",
      "circle-stroke-color": "#FF5A16",
      "circle-stroke-width": 3,
    },
  });
}

function updateMapData(map: mapboxgl.Map, data: MapData) {
  if (!map.loaded()) return;
  for (const key of Object.keys(SOURCE_IDS) as (keyof typeof SOURCE_IDS)[]) {
    (map.getSource(SOURCE_IDS[key]) as GeoJSONSource | undefined)?.setData(data[key]);
  }
}

/** 카카오 지도의 유령 오버레이(👻)와 동일한 모양의 HTML 마커 요소. */
function createGhostMarkerElement() {
  const el = document.createElement("div");
  el.style.cssText =
    "width:22px;height:22px;border-radius:50%;background:rgba(139,92,246,0.35);" +
    "border:2px dashed #8b5cf6;display:flex;align-items:center;justify-content:center;font-size:11px;";
  el.textContent = "👻";
  return el;
}

function syncGhostMarker(
  map: mapboxgl.Map,
  markerRef: { current: mapboxgl.Marker | null },
  point: LatLng | null,
) {
  if (!point) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }
  if (!markerRef.current) {
    markerRef.current = new mapboxgl.Marker({ element: createGhostMarkerElement() });
    markerRef.current.setLngLat(coordinates(point)).addTo(map);
    return;
  }
  markerRef.current.setLngLat(coordinates(point));
}

function fitPathBounds(map: mapboxgl.Map, path: LatLng[]) {
  if (path.length < 2) return;
  const bounds = path.reduce(
    (nextBounds, point) => nextBounds.extend(coordinates(point)),
    new mapboxgl.LngLatBounds(coordinates(path[0]), coordinates(path[0])),
  );
  map.fitBounds(bounds, { padding: 36, duration: 0 });
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
  const ghostMarkerRef = useRef<mapboxgl.Marker | null>(null);
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
      ghostPoint: currentGhostPosition,
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
      localIdeographFontFamily: LOCAL_IDEOGRAPH_FONT,
    });
    mapRef.current = map;

    map.on("load", () => {
      if (!latestDataRef.current) return;
      addMapData(map, latestDataRef.current);
      syncGhostMarker(map, ghostMarkerRef, latestDataRef.current.ghostPoint);
      const viewport = latestViewportRef.current;
      if (viewport.follow && viewport.position) {
        map.jumpTo({ center: coordinates(viewport.position), zoom: DEFAULT_ZOOM });
      } else if (viewport.path.length >= 2) {
        fitPathBounds(map, viewport.path);
      }
      map.resize();
    });

    const parent = containerRef.current.parentElement;
    const observer =
      parent && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            map.resize();
            // 카드 레이아웃 확정 등으로 크기가 바뀌어도 전체 경로가 계속 보이게 (카카오와 동일)
            const viewport = latestViewportRef.current;
            if (!viewport.follow && viewport.path.length >= 2) {
              fitPathBounds(map, viewport.path);
            }
          })
        : null;
    if (parent) observer?.observe(parent);

    return () => {
      observer?.disconnect();
      map.remove();
      ghostMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateMapData(map, data);
    if (map.loaded()) syncGhostMarker(map, ghostMarkerRef, data.ghostPoint);
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
    fitPathBounds(map, path);
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
