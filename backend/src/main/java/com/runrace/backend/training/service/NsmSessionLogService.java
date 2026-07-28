package com.runrace.backend.training.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.KstTime;
import com.runrace.backend.training.domain.NsmSessionLog;
import com.runrace.backend.training.dto.NsmSessionLogRequest;
import com.runrace.backend.training.dto.NsmWeeklyProgressResponse;
import com.runrace.backend.training.repository.NsmSessionLogRepository;
import com.runrace.backend.training.repository.TrainingPlanRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** NSM sub-T 세션 수행 로그 — 기록(런 저장 직후)과 주간 진척 조회. */
@Service
@RequiredArgsConstructor
public class NsmSessionLogService {

  private static final ZoneId KST = KstTime.ZONE;
  private static final Set<String> KINDS = Set.of("SHORT", "MEDIUM", "LONG");

  private final NsmSessionLogRepository logRepository;
  private final TrainingPlanRepository trainingPlanRepository;

  /**
   * sub-T 세션 수행을 기록한다. 같은 운동 기록으로 재전송되면 멱등하게 무시한다
   * (저장 재시도·중복 호출 방어 — 유니크 인덱스와 이중 방어).
   */
  @Transactional
  public void log(UUID userId, NsmSessionLogRequest req) {
    if (req.day() < 0 || req.day() > 6) {
      throw ApiException.badRequest("invalid_session_day");
    }
    if (req.kind() == null || !KINDS.contains(req.kind())) {
      throw ApiException.badRequest("invalid_session_kind");
    }
    if (req.workoutId() != null && logRepository.existsByWorkoutId(req.workoutId())) {
      return; // 이미 기록됨 — 멱등
    }
    try {
      logRepository.save(NsmSessionLog.of(
          userId, req.workoutId(), req.day(), req.kind(),
          req.targetPaceSec(), req.repsPlanned(), req.repsDone(), req.completed()));
    } catch (DataIntegrityViolationException e) {
      // 동시 전송 레이스 — 유니크 인덱스가 막은 경우. 이미 기록됐으므로 성공으로 본다.
    }
  }

  /** 이번 주(월요일 KST 0시 기준) 완주한 sub-T 세션 수 + 플랜상 목표 횟수. */
  @Transactional(readOnly = true)
  public NsmWeeklyProgressResponse weeklyProgress(UUID userId) {
    OffsetDateTime weekStart = LocalDate.now(KST)
        .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        .atStartOfDay(KST)
        .toOffsetDateTime();
    long completed =
        logRepository.countByUserIdAndCompletedIsTrueAndCompletedAtGreaterThanEqual(userId, weekStart);
    int planned = trainingPlanRepository.findByUserId(userId)
        .map(plan -> plan.getSessionsPerWeek())
        .orElse(0);
    return new NsmWeeklyProgressResponse(completed, planned);
  }
}
