package com.runrace.backend.workout;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.ChallengeService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.workout.dto.WorkoutSummaryResponse;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkoutService {
  private final WorkoutSessionRepository workoutSessionRepository;
  private final AppUserRepository appUserRepository;
  private final ChallengeService challengeService;
  private final ObjectMapper objectMapper;

  @Transactional
  public WorkoutSession create(
      AuthPrincipal principal,
      OffsetDateTime startedAt,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<PathPoint> path
  ) {
    if (durationSec < 1) {
      throw ApiException.badRequest("duration_too_short");
    }
    if (path == null || path.isEmpty()) {
      throw ApiException.badRequest("path_empty");
    }

    AppUser user = appUserRepository.getRequired(principal.userId());
    WorkoutSession session = new WorkoutSession();
    session.setUser(user);
    session.setStartedAt(startedAt);
    session.setEndedAt(endedAt);
    session.setDurationSec(durationSec);
    session.setDistanceM(distanceM);
    session.setCalories(calories);
    session.setAvgPaceSecPerKm(avgPaceSecPerKm);
    session.setPathJson(toJson(path));
    session.setCreatedAt(OffsetDateTime.now());
    WorkoutSession saved = workoutSessionRepository.save(session);

    // 현재 참여 중인 진행 대결에 운동 거리 반영
    challengeService.applyWorkoutDistance(principal.userId(), saved.getId(), distanceM);

    return saved;
  }

  @Transactional(readOnly = true)
  public WorkoutSession getForUser(UUID userId, Long id) {
    return workoutSessionRepository
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  /** 공개 공유 페이지용 — 소유자 확인 없이 ID로만 조회. */
  @Transactional(readOnly = true)
  public WorkoutSession getForShare(Long id) {
    return workoutSessionRepository
        .findById(id)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  private static final ZoneId LIST_ZONE = ZoneId.of("Asia/Seoul");

  @Transactional(readOnly = true)
  public List<WorkoutSession> listForUser(UUID userId) {
    return workoutSessionRepository.findAllByUserIdOrderByCreatedAtDesc(userId);
  }

  @Transactional(readOnly = true)
  public WorkoutSummaryResponse summaryForUser(UUID userId) {
    List<WorkoutSession> sessions = listForUser(userId);
    long totalDistanceM = 0;
    long totalDurationSec = 0;
    int totalCalories = 0;
    Set<String> days = new HashSet<>();

    for (WorkoutSession session : sessions) {
      totalDistanceM += session.getDistanceM();
      totalDurationSec += session.getDurationSec();
      totalCalories += session.getCalories();
      OffsetDateTime started = session.getStartedAt();
      LocalDate local = started.atZoneSameInstant(LIST_ZONE).toLocalDate();
      days.add(
          String.format("%d-%02d-%02d", local.getYear(), local.getMonthValue(), local.getDayOfMonth()));
    }

    Integer avgPaceSecPerKm =
        totalDistanceM >= 10
            ? (int) Math.round(totalDurationSec / (totalDistanceM / 1000.0))
            : null;

    return new WorkoutSummaryResponse(
        totalDistanceM,
        totalDurationSec,
        totalCalories,
        sessions.size(),
        days.size(),
        avgPaceSecPerKm);
  }

  @Transactional(readOnly = true)
  public List<WorkoutSession> listForUserInYear(UUID userId, int year) {
    OffsetDateTime from =
        LocalDate.of(year, 1, 1).atStartOfDay(LIST_ZONE).toOffsetDateTime();
    OffsetDateTime to =
        LocalDate.of(year + 1, 1, 1).atStartOfDay(LIST_ZONE).toOffsetDateTime();
    return workoutSessionRepository
        .findAllByUserIdAndStartedAtGreaterThanEqualAndStartedAtLessThanOrderByStartedAtDesc(
            userId, from, to);
  }

  @Transactional
  public void deleteForUser(AuthPrincipal principal, Long id) {
    WorkoutSession session =
        workoutSessionRepository
            .findByIdAndUserId(id, principal.userId())
            .orElseThrow(() -> ApiException.notFound("workout_not_found"));
    // 레이스에 반영된 거리 먼저 차감 (cascade 삭제 전에 호출해야 함)
    challengeService.reverseWorkoutDistance(session.getId());
    workoutSessionRepository.delete(session);
  }

  private String toJson(List<PathPoint> path) {
    try {
      return objectMapper.writeValueAsString(path);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("path_json_encode_failed", e);
    }
  }

  public List<PathPoint> parsePath(String pathJson) {
    try {
      return objectMapper.readValue(
          pathJson,
          objectMapper.getTypeFactory().constructCollectionType(List.class, PathPoint.class));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("path_json_decode_failed", e);
    }
  }

  public record PathPoint(double lat, double lng) {}
}
