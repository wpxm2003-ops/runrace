package com.runrace.backend.training.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.training.domain.TrainingPlan;
import com.runrace.backend.training.dto.TrainingPlanRequest;
import com.runrace.backend.training.repository.TrainingPlanRepository;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** NSM 훈련 플랜 — 사용자당 1개 upsert + 조회. */
@Service
@RequiredArgsConstructor
public class TrainingPlanService {

  private final TrainingPlanRepository trainingPlanRepository;

  @Transactional(readOnly = true)
  public Optional<TrainingPlan> getActive(UUID userId) {
    return trainingPlanRepository.findByUserId(userId);
  }

  @Transactional
  public TrainingPlan save(UUID userId, TrainingPlanRequest req) {
    String csv = normalizeSubTDays(req.subTDays());
    if (!(req.vdot() > 0)) throw ApiException.badRequest("invalid_vdot"); // NaN/음수/0 차단
    if (req.thresholdPaceSec() <= 0) throw ApiException.badRequest("invalid_threshold");
    if (req.sourceDistanceM() <= 0 || req.sourceTimeSec() <= 0) {
      throw ApiException.badRequest("invalid_source_record");
    }

    TrainingPlan plan = trainingPlanRepository.findByUserId(userId).orElse(null);
    if (plan == null) {
      plan = TrainingPlan.of(userId, req.vdot(), req.thresholdPaceSec(), csv,
          req.sourceDistanceM(), req.sourceTimeSec());
    } else {
      plan.update(req.vdot(), req.thresholdPaceSec(), csv,
          req.sourceDistanceM(), req.sourceTimeSec());
    }
    return trainingPlanRepository.save(plan);
  }

  /** sub-T 요일 검증·정규화 — 2~3개, 0~6 범위, 중복 제거·정렬 후 CSV. */
  private static String normalizeSubTDays(int[] days) {
    if (days == null) throw ApiException.badRequest("invalid_sub_t_days");
    int[] cleaned = Arrays.stream(days).distinct().sorted().toArray();
    if (cleaned.length < 2 || cleaned.length > 3) {
      throw ApiException.badRequest("invalid_sub_t_days");
    }
    for (int d : cleaned) {
      if (d < 0 || d > 6) throw ApiException.badRequest("invalid_sub_t_days");
    }
    return Arrays.stream(cleaned).mapToObj(Integer::toString).collect(Collectors.joining(","));
  }
}
