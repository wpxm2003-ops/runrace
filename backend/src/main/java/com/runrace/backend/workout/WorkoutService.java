package com.runrace.backend.workout;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
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
    if (durationSec < 1) throw new IllegalArgumentException("duration_too_short");
    if (path == null || path.isEmpty()) throw new IllegalArgumentException("path_empty");

    var user = appUserRepository.findById(principal.userId()).orElseThrow();
    var session = new WorkoutSession();
    session.setUser(user);
    session.setStartedAt(startedAt);
    session.setEndedAt(endedAt);
    session.setDurationSec(durationSec);
    session.setDistanceM(distanceM);
    session.setCalories(calories);
    session.setAvgPaceSecPerKm(avgPaceSecPerKm);
    session.setPathJson(toJson(path));
    session.setCreatedAt(OffsetDateTime.now());
    return workoutSessionRepository.save(session);
  }

  @Transactional(readOnly = true)
  public WorkoutSession getForUser(UUID userId, Long id) {
    return workoutSessionRepository.findByIdAndUserId(id, userId).orElseThrow();
  }

  @Transactional(readOnly = true)
  public List<WorkoutSession> listForUser(UUID userId) {
    return workoutSessionRepository.findAllByUserIdOrderByCreatedAtDesc(userId);
  }

  @Transactional
  public void deleteForUser(AuthPrincipal principal, Long id) {
    WorkoutSession session =
        workoutSessionRepository.findByIdAndUserId(id, principal.userId()).orElseThrow();
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
