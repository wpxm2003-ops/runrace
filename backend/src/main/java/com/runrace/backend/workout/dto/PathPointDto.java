package com.runrace.backend.workout.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * breakBefore=true이면 직전 좌표와 거리를 이어 계산하지 않는 명시적 경로 단절이다.
 * 구형 클라이언트·저장 JSON에는 필드가 없으므로 nullable Boolean으로 둔다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PathPointDto(
    double lat, double lng, Long t, Double ele, Boolean breakBefore) {

  public PathPointDto(double lat, double lng, Long t, Double ele) {
    this(lat, lng, t, ele, null);
  }
}
