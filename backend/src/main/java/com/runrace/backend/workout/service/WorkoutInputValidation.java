package com.runrace.backend.workout.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.Distance;
import com.runrace.backend.common.KstTime;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.List;

/** 운동 저장 입력의 범위·시간·경로 일관성 검증. */
final class WorkoutInputValidation {
  private static final int MAX_DISTANCE_M = Distance.MAX_DISTANCE_M;
  private static final int MAX_DURATION_SEC = Distance.MAX_DURATION_SEC;
  private static final int MAX_CALORIES = 100_000;
  private static final int MAX_PATH_POINTS = 100_000;
  private static final int STARTED_AT_FUTURE_SKEW_MIN = 10;
  private static final int MAX_PATH_POINT_SPACING_M = 50;
  private static final int TIME_CONSISTENCY_TOLERANCE_SEC = 5;
  private static final int MIN_DISTANCE_FOR_PACE_M = 10;
  private static final double MIN_LAT = -90;
  private static final double MAX_LAT = 90;
  private static final double MIN_LNG = -180;
  private static final double MAX_LNG = 180;
  private static final long MIN_UTC_OFFSET_MIN = -12 * 60;
  private static final long MAX_UTC_OFFSET_MIN = 14 * 60;

  private WorkoutInputValidation() {}

  static void validateGps(
      OffsetDateTime startedAt,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<WorkoutService.PathPoint> path) {
    if (durationSec < 1 || durationSec > MAX_DURATION_SEC) {
      throw ApiException.badRequest("duration_invalid");
    }
    if (distanceM < 0 || distanceM > MAX_DISTANCE_M) {
      throw ApiException.badRequest("distance_invalid");
    }
    if (calories < 0 || calories > MAX_CALORIES) {
      throw ApiException.badRequest("calories_invalid");
    }
    if (avgPaceSecPerKm != null && avgPaceSecPerKm < 0) {
      throw ApiException.badRequest("pace_invalid");
    }
    if (path == null || path.isEmpty()) {
      throw ApiException.badRequest("path_empty");
    }
    if (path.size() > MAX_PATH_POINTS) {
      throw ApiException.badRequest("path_too_large");
    }
    if (startedAt == null || endedAt == null || !endedAt.isAfter(startedAt)) {
      throw ApiException.badRequest("time_range_invalid");
    }
    if (startedAt.isAfter(OffsetDateTime.now().plusMinutes(STARTED_AT_FUTURE_SKEW_MIN))) {
      throw ApiException.badRequest("started_at_future");
    }
    long wallClockSec = Duration.between(startedAt, endedAt).getSeconds();
    if (durationSec > wallClockSec + TIME_CONSISTENCY_TOLERANCE_SEC) {
      throw ApiException.badRequest("duration_exceeds_time_range");
    }
    int minPathPoints = (int) Math.ceil(distanceM / (double) MAX_PATH_POINT_SPACING_M);
    if (path.size() < minPathPoints) {
      throw ApiException.badRequest("path_too_sparse");
    }
    validatePathPoints(path);
  }

  private static void validatePathPoints(List<WorkoutService.PathPoint> path) {
    Long previousTime = null;
    boolean allSameCoordinate = path.size() > 1;
    double firstLat = path.get(0).lat();
    double firstLng = path.get(0).lng();
    for (WorkoutService.PathPoint point : path) {
      if (!Double.isFinite(point.lat()) || !Double.isFinite(point.lng())
          || point.lat() < MIN_LAT || point.lat() > MAX_LAT
          || point.lng() < MIN_LNG || point.lng() > MAX_LNG) {
        throw ApiException.badRequest("path_point_invalid");
      }
      if (point.lat() != firstLat || point.lng() != firstLng) {
        allSameCoordinate = false;
      }
      Long time = point.t();
      if (time != null) {
        if (time < 0 || (previousTime != null && time < previousTime)) {
          throw ApiException.badRequest("path_point_invalid");
        }
        previousTime = time;
      }
    }
    if (allSameCoordinate) {
      throw ApiException.badRequest("path_all_same_point");
    }
  }

  static void validateIndoor(int distanceM, int durationSec) {
    if (durationSec < 1 || durationSec > MAX_DURATION_SEC) {
      throw ApiException.badRequest("duration_invalid");
    }
    if (distanceM <= 0 || distanceM > MAX_DISTANCE_M) {
      throw ApiException.badRequest("distance_invalid");
    }
  }

  static OffsetDateTime parseStartedAt(String startedAt) {
    if (startedAt == null || startedAt.isBlank()) {
      throw ApiException.badRequest("started_at_invalid");
    }
    OffsetDateTime start;
    try {
      start = OffsetDateTime.parse(startedAt);
    } catch (DateTimeParseException exception) {
      throw ApiException.badRequest("started_at_invalid");
    }
    if (start.isAfter(OffsetDateTime.now().plusMinutes(STARTED_AT_FUTURE_SKEW_MIN))) {
      throw ApiException.badRequest("started_at_future");
    }
    return start;
  }

  static LocalDateTime resolveStartedAtLocal(String startedAtLocal, OffsetDateTime startedAt) {
    if (startedAtLocal != null && !startedAtLocal.isBlank()) {
      try {
        LocalDateTime local = LocalDateTime.parse(startedAtLocal);
        long offsetMin = Duration.between(
            startedAt.toInstant(), local.atOffset(ZoneOffset.UTC).toInstant()).toMinutes();
        if (offsetMin >= MIN_UTC_OFFSET_MIN && offsetMin <= MAX_UTC_OFFSET_MIN) return local;
      } catch (DateTimeParseException ignored) {
        // Preserve the historical KST fallback for invalid or manipulated wall-clock values.
      }
    }
    return startedAt.atZoneSameInstant(KstTime.ZONE).toLocalDateTime();
  }

  static Integer avgPaceSecPerKm(long distanceM, long durationSec) {
    if (distanceM < MIN_DISTANCE_FOR_PACE_M) return null;
    return (int) Math.round(durationSec / (distanceM / 1000.0));
  }
}
