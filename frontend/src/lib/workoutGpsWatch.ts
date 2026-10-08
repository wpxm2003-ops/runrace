import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { startBackgroundWatch, type GeoCoords } from "./backgroundGeo";
import { waitForNativePermissions } from "./nativePermissions";
import type { GeoErrorState } from "./useWorkoutGpsWarmup";
import type { WorkoutStatus } from "./workoutTrack";

type StartWorkoutGpsWatchOptions = {
  ownerUid: string;
  watchSequence: MutableRefObject<number>;
  status: MutableRefObject<WorkoutStatus>;
  stopWatch: MutableRefObject<(() => void) | null>;
  watchStartedAt: MutableRefObject<number | null>;
  isCurrentSessionOwner: (expectedUid?: string) => boolean;
  clearWatch: () => void;
  appendPosition: (coords: GeoCoords) => void;
  setGeoErrorState: Dispatch<SetStateAction<GeoErrorState | null>>;
  notification?: { title: string; message: string };
};

/** 권한 대기와 비동기 등록 경쟁까지 포함한 네이티브 GPS 워처 시작 수명주기. */
export function startWorkoutGpsWatch({
  ownerUid,
  watchSequence,
  status,
  stopWatch,
  watchStartedAt,
  isCurrentSessionOwner,
  clearWatch,
  appendPosition,
  setGeoErrorState,
  notification,
}: StartWorkoutGpsWatchOptions): void {
  setGeoErrorState(null);
  clearWatch();
  watchStartedAt.current = Date.now();
  const sequence = watchSequence.current;
  const isLiveWatch = () => watchSequence.current === sequence
    && status.current === "running"
    && isCurrentSessionOwner(ownerUid);

  void waitForNativePermissions().then(() => {
    if (!isLiveWatch()) return;
    return startBackgroundWatch(
      (coords) => {
        if (!isLiveWatch()) return;
        setGeoErrorState(null);
        appendPosition(coords);
      },
      (message) => {
        if (isLiveWatch()) setGeoErrorState({ text: message });
      },
      notification?.title ?? "운동 기록 중",
      notification?.message ?? "RunRace가 백그라운드에서 경로를 기록하고 있습니다.",
    )
      .then((stop) => {
        if (!isLiveWatch()) {
          stop();
          return;
        }
        stopWatch.current = stop;
      })
      .catch((error: unknown) => {
        if (isLiveWatch()) {
          setGeoErrorState({ text: error instanceof Error ? error.message : String(error) });
        }
      });
  });
}
