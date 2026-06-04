package com.runrace.backend.workout;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.ChallengeService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.List;
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
    challengeService.applyWorkoutDistance(principal.userId(), distanceM);

    return saved;
  }

  @Transactional(readOnly = true)
  public WorkoutSession getForUser(UUID userId, Long id) {
    return workoutSessionRepository
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  @Transactional(readOnly = true)
  public List<WorkoutSession> listForUser(UUID userId) {
    return workoutSessionRepository.findAllByUserIdOrderByCreatedAtDesc(userId);
  }

  @Transactional
  public void deleteForUser(AuthPrincipal principal, Long id) {
    WorkoutSession session =
        workoutSessionRepository
            .findByIdAndUserId(id, principal.userId())
            .orElseThrow(() -> ApiException.notFound("workout_not_found"));
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
