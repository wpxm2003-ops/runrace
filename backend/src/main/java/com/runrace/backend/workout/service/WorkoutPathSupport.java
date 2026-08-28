package com.runrace.backend.workout.service;

import com.runrace.backend.workout.dto.PathPointDto;
import java.util.List;

/** GPS 경로의 저장 정규화와 공유 페이지의 위치 마스킹 규칙. */
final class WorkoutPathSupport {
  private static final double COORD_SCALE = 1_000_000d;
  private static final double SHARE_PATH_TRUNCATE_M = 250;

  private WorkoutPathSupport() {}

  static List<WorkoutService.PathPoint> roundForStorage(List<WorkoutService.PathPoint> path) {
    return path.stream()
        .map(p -> new WorkoutService.PathPoint(
            roundCoord(p.lat()), roundCoord(p.lng()), p.t(), roundElevation(p.ele()), p.breakBefore()))
        .toList();
  }

  static Double roundElevation(Double value) {
    if (value == null || !Double.isFinite(value)) return null;
    return Math.round(value * 10d) / 10d;
  }

  static List<PathPointDto> truncateForShare(List<PathPointDto> path) {
    if (path.size() < 2) return List.of();
    int startIdx = trimStart(path);
    int endIdx = trimEnd(path);
    return endIdx <= startIdx ? List.of() : path.subList(startIdx, endIdx + 1);
  }

  private static int trimStart(List<PathPointDto> path) {
    int index = 0;
    double distance = 0;
    while (index < path.size() - 1 && distance < SHARE_PATH_TRUNCATE_M) {
      distance += creditedMeters(path.get(index), path.get(index + 1));
      index++;
    }
    return index;
  }

  private static int trimEnd(List<PathPointDto> path) {
    int index = path.size() - 1;
    double distance = 0;
    while (index > 0 && distance < SHARE_PATH_TRUNCATE_M) {
      distance += creditedMeters(path.get(index - 1), path.get(index));
      index--;
    }
    return index;
  }

  private static double roundCoord(double value) {
    return Math.round(value * COORD_SCALE) / COORD_SCALE;
  }

  private static double creditedMeters(PathPointDto a, PathPointDto b) {
    return Boolean.TRUE.equals(b.breakBefore()) ? 0 : haversineMeters(a, b);
  }

  private static double haversineMeters(PathPointDto a, PathPointDto b) {
    double toRad = Math.PI / 180;
    double dLat = (b.lat() - a.lat()) * toRad;
    double dLng = (b.lng() - a.lng()) * toRad;
    double lat1 = a.lat() * toRad;
    double lat2 = b.lat() * toRad;
    double h = Math.pow(Math.sin(dLat / 2), 2)
        + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  }
}
