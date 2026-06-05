import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

export type GeoCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
};

type PositionCallback = (coords: GeoCoords) => void;
type ErrorCallback = (msg: string) => void;

/**
 * 백그라운드 GPS 감시 시작.
 * - 네이티브 앱(Android/iOS): Capacitor 백그라운드 위치 플러그인 사용
 * - 웹: navigator.geolocation 폴백
 * 반환값은 감시를 중단하는 cleanup 함수.
 */
export async function startBackgroundWatch(
  onPosition: PositionCallback,
  onError: ErrorCallback,
  notificationTitle: string,
  notificationMessage: string,
): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: notificationTitle,
        backgroundMessage: notificationMessage,
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (position, error) => {
        if (error) {
          onError(error.message ?? "위치 오류");
          return;
        }
        if (position) {
          onPosition({
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
            speed: position.speed ?? null,
          });
        }
      },
    );

    return () => {
      BackgroundGeolocation.removeWatcher({ id });
    };
  }

  // 웹 폴백
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
      });
    },
    (err) => onError(err.message),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
