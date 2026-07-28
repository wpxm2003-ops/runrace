package com.runrace.backend.training.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.training.domain.NsmRetestLog;
import com.runrace.backend.training.domain.TrainingPlan;
import com.runrace.backend.training.dto.TrainingPlanRequest;
import com.runrace.backend.training.repository.NsmRetestLogRepository;
import com.runrace.backend.training.repository.TrainingPlanRepository;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Map;
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
  private final NsmRetestLogRepository retestLogRepository;

  /** 볼륨 밴드별 sub-T 요일 수 제약(최소,최대) — 런갤 NSM 볼륨 티어 표 기준. 미지정 시 레거시 기본(2~3). */
  private static final Map<Integer, int[]> BAND_DAY_LIMITS = Map.of(
      0, new int[] {1, 1},
      1, new int[] {1, 2},
      2, new int[] {2, 2},
      3, new int[] {2, 3},
      4, new int[] {2, 3});

  @Transactional(readOnly = true)
  public Optional<TrainingPlan> getActive(UUID userId) {
    return trainingPlanRepository.findByUserId(userId);
  }

  /** 내 활성 플랜 취소(삭제). 플랜이 없으면 멱등 no-op. */
  @Transactional
  public void cancel(UUID userId) {
    trainingPlanRepository.findByUserId(userId).ifPresent(trainingPlanRepository::delete);
  }

  @Transactional
  public TrainingPlan save(UUID userId, TrainingPlanRequest req) {
    String csv = normalizeSubTDays(req.subTDays(), req.weeklyBand());
    // NaN·Infinity·음수/0 차단 + 현실 상한(VDOT은 세계기록권도 ~85). isFinite가 NaN·Infinity 동시 차단.
    if (!Double.isFinite(req.vdot()) || req.vdot() <= 0 || req.vdot() > 100) {
      throw ApiException.badRequest("invalid_vdot");
    }
    // 역치 페이스 현실 범위(초/km): 2'30"~10'00" — 프론트(nsm.ts MIN/MAX_REALISTIC_THRESHOLD_SEC)와 동일 범위로 정합.
    if (req.thresholdPaceSec() < 150 || req.thresholdPaceSec() > 600) {
      throw ApiException.badRequest("invalid_threshold");
    }
    if (req.sourceDistanceM() <= 0 || req.sourceTimeSec() <= 0) {
      throw ApiException.badRequest("invalid_source_record");
    }

    TrainingPlan plan = trainingPlanRepository.findByUserId(userId).orElse(null);
    if (plan == null) {
      plan = TrainingPlan.of(userId, req.vdot(), req.thresholdPaceSec(), csv,
          req.sourceDistanceM(), req.sourceTimeSec(), req.weeklyBand());
    } else {
      plan.update(req.vdot(), req.thresholdPaceSec(), csv,
          req.sourceDistanceM(), req.sourceTimeSec(), req.weeklyBand());
    }
    plan = trainingPlanRepository.save(plan);
    recordRetestIfChanged(userId, req);
    return plan;
  }

  /** 이 시간 안의 연속 저장은 새 재측정이 아니라 직전 입력의 정정으로 본다(1시간 안에 5K를 두 번 재는 사람은 없다). */
  private static final Duration RETEST_CORRECTION_WINDOW = Duration.ofHours(1);

  /**
   * 새로 입력한 원본 기록(거리·시간)이 직전 재측정과 다르면 재측정 이력을 남긴다.
   * 밴드만 바꾸는 등 원본 기록이 그대로인 저장은 "새 재측정"이 아니므로 로그하지 않는다.
   * 단, 직전 로그가 {@link #RETEST_CORRECTION_WINDOW} 이내면 오타 정정으로 보고
   * 새 행을 쌓는 대신 직전 행을 고친다 — 정정이 재측정 2건으로 남으면 0일짜리 블록이 생기고
   * 추이 그래프에 가짜 점이 찍힌다. 정정 결과가 그 이전 재측정과 같은 기록으로 돌아가면
   * (잘못 넣었다가 되돌린 것) 행 자체를 지워 이력을 원상복구한다.
   * training_plan은 upsert라 이 순간을 놓치면 과거 재측정 이력은 영영 복원할 수 없다.
   */
  private void recordRetestIfChanged(UUID userId, TrainingPlanRequest req) {
    NsmRetestLog last = retestLogRepository.findTopByUserIdOrderByCreatedAtDesc(userId).orElse(null);
    boolean recordChanged = last == null
        || last.getSourceDistanceM() != req.sourceDistanceM()
        || last.getSourceTimeSec() != req.sourceTimeSec();
    if (!recordChanged) return;

    boolean withinCorrectionWindow = last != null
        && last.getCreatedAt().isAfter(OffsetDateTime.now().minus(RETEST_CORRECTION_WINDOW));
    if (withinCorrectionWindow) {
      NsmRetestLog beforeLast = retestLogRepository
          .findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(userId, last.getCreatedAt())
          .orElse(null);
      boolean revertedToPrevious = beforeLast != null
          && beforeLast.getSourceDistanceM() == req.sourceDistanceM()
          && beforeLast.getSourceTimeSec() == req.sourceTimeSec();
      if (revertedToPrevious) {
        retestLogRepository.delete(last);
      } else {
        last.correctTo(req.vdot(), req.thresholdPaceSec(),
            req.sourceDistanceM(), req.sourceTimeSec(), req.weeklyBand());
        retestLogRepository.save(last);
      }
      return;
    }

    retestLogRepository.save(NsmRetestLog.of(
        userId, req.vdot(), req.thresholdPaceSec(),
        req.sourceDistanceM(), req.sourceTimeSec(), req.weeklyBand()));
  }

  /** sub-T 요일 검증·정규화 — 볼륨 밴드별 최소/최대(미지정 시 2~3), 0~6 범위, 중복 제거·정렬 후 CSV. */
  private static String normalizeSubTDays(int[] days, Integer weeklyBand) {
    if (days == null) throw ApiException.badRequest("invalid_sub_t_days");
    int[] cleaned = Arrays.stream(days).distinct().sorted().toArray();

    int min = 2;
    int max = 3;
    if (weeklyBand != null) {
      int[] limits = BAND_DAY_LIMITS.get(weeklyBand);
      if (limits == null) throw ApiException.badRequest("invalid_weekly_band");
      min = limits[0];
      max = limits[1];
    }
    if (cleaned.length < min || cleaned.length > max) {
      throw ApiException.badRequest("invalid_sub_t_days");
    }
    for (int d : cleaned) {
      if (d < 0 || d > 6) throw ApiException.badRequest("invalid_sub_t_days");
    }
    return Arrays.stream(cleaned).mapToObj(Integer::toString).collect(Collectors.joining(","));
  }
}
