package com.runrace.backend.training.dto;

import com.runrace.backend.common.IsoTime;
import com.runrace.backend.training.domain.NsmRetestLog;

/** 역치 추이 그래프의 점 하나(재측정 1회). */
public record NsmRetestPointDto(
    Long id,
    String createdAt,
    double vdot,
    int thresholdPaceSec,
    int sourceDistanceM,
    int sourceTimeSec) {

  public static NsmRetestPointDto from(NsmRetestLog log) {
    return new NsmRetestPointDto(
        log.getId(),
        IsoTime.format(log.getCreatedAt()),
        log.getVdot(),
        log.getThresholdPaceSec(),
        log.getSourceDistanceM(),
        log.getSourceTimeSec());
  }
}
