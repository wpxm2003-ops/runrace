package com.runrace.backend.training.dto;

import com.runrace.backend.training.domain.TrainingPlan;
import java.util.Arrays;

/** NSM 플랜 응답. 주간 스케줄은 threshold + subTDays로 프론트가 생성한다. */
public record TrainingPlanResponse(
    double vdot,
    int thresholdPaceSec,
    int[] subTDays,
    int sourceDistanceM,
    int sourceTimeSec) {

  public static TrainingPlanResponse from(TrainingPlan p) {
    int[] days = p.getSubTDays() == null || p.getSubTDays().isBlank()
        ? new int[0]
        : Arrays.stream(p.getSubTDays().split(",")).map(String::trim).mapToInt(Integer::parseInt).toArray();
    return new TrainingPlanResponse(
        p.getVdot(), p.getThresholdPaceSec(), days,
        p.getSourceDistanceM(), p.getSourceTimeSec());
  }
}
