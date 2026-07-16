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
    // 관용 파싱 — 정상 쓰기 경로(normalizeSubTDays)로는 항상 유효 CSV지만, 수동 DB 편집·배치 등으로
    // 비정수 토큰이 섞여도 GET이 500나지 않도록 숫자 토큰만 취한다.
    int[] days = p.getSubTDays() == null || p.getSubTDays().isBlank()
        ? new int[0]
        : Arrays.stream(p.getSubTDays().split(","))
            .map(String::trim)
            .filter(s -> s.matches("-?\\d+"))
            .mapToInt(Integer::parseInt)
            .toArray();
    return new TrainingPlanResponse(
        p.getVdot(), p.getThresholdPaceSec(), days,
        p.getSourceDistanceM(), p.getSourceTimeSec());
  }
}
