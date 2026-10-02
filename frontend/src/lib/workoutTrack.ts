/** 운동 추적 도메인의 하위 모듈을 기존 단일 진입점으로 호환 제공한다. */
export * from "./workoutSessionModels";
export * from "./workoutPath";
export * from "./workoutIdle";
export * from "./workoutVehicle";
export * from "./workoutDisplay";
export { computeBestSegments, computeKmSplits } from "./workoutPathAnalysis";
export type { KmSplit } from "./workoutPathAnalysis";
export {
  foregroundGapLooksLikeMovement,
  geolocationBlockedCode,
  geolocationErrorCode,
  GPS_FOREGROUND_RECOVERY_GAP_MS,
  GPS_WATCHDOG_TIMEOUT_MS,
  IDLE_GAP_MOVEMENT_THRESHOLD_M,
  shouldResetIdleAnchorAfterForegroundGap,
  shouldRestartGpsWatch,
} from "./workoutGpsWatchdog";
export type { GeoErrorCode } from "./workoutGpsWatchdog";
