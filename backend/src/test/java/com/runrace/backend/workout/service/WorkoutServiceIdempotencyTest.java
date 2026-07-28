package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.challenge.service.ChallengeProgressService;
import com.runrace.backend.challenge.service.IndoorApprovalService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.service.CrewMatchService;
import com.runrace.backend.shoe.service.ShoeService;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.domain.WorkoutType;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class WorkoutServiceIdempotencyTest {

  @Mock WorkoutSessionRepository workoutRepository;
  @Mock AppUserRepository userRepository;
  @Mock ChallengeProgressService challengeProgressService;
  @Mock CrewMatchService crewMatchService;
  @Mock IndoorApprovalService indoorApprovalService;
  @Mock ChallengeWorkoutRepository challengeWorkoutRepository;
  @Mock IndoorRunApprovalRepository indoorRunApprovalRepository;
  @Mock ImageUploadService imageUploadService;
  @Mock ShoeService shoeService;
  @Mock ApplicationEventPublisher eventPublisher;
  @Mock AppUser user;

  private WorkoutService service;
  private UUID userId;
  private AuthPrincipal principal;

  @BeforeEach
  void setUp() {
    service = new WorkoutService(
        workoutRepository,
        userRepository,
        challengeProgressService,
        crewMatchService,
        indoorApprovalService,
        challengeWorkoutRepository,
        indoorRunApprovalRepository,
        imageUploadService,
        shoeService,
        eventPublisher,
        new ObjectMapper());
    userId = UUID.randomUUID();
    principal = new AuthPrincipal(userId, "uid");
    when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));
  }

  @Test
  void gpsRetryReturnsExistingWorkoutWithoutRepeatingSideEffects() {
    UUID clientWorkoutId = UUID.randomUUID();
    OffsetDateTime startedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
    OffsetDateTime endedAt = startedAt.plusSeconds(300);
    WorkoutSession existing = workout(
        WorkoutType.GPS, clientWorkoutId, startedAt, endedAt, 300, 1_000, 65, 300, null);
    when(workoutRepository.findByUserIdAndClientWorkoutId(userId, clientWorkoutId))
        .thenReturn(Optional.of(existing));

    WorkoutSession result = service.create(
        principal,
        startedAt,
        endedAt,
        300,
        1_000,
        65,
        300,
        List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)),
        null,
        null,
        clientWorkoutId);

    assertSame(existing, result);
    verify(workoutRepository, never()).save(any());
    verifyNoInteractions(
        challengeProgressService, crewMatchService, shoeService, eventPublisher);
  }

  @Test
  void indoorRetryReturnsExistingWorkoutWithoutRepeatingSideEffects() {
    UUID clientWorkoutId = UUID.randomUUID();
    OffsetDateTime startedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
    WorkoutSession existing = workout(
        WorkoutType.INDOOR,
        clientWorkoutId,
        startedAt,
        startedAt.plusSeconds(600),
        600,
        2_000,
        130,
        300,
        null);
    when(workoutRepository.findByUserIdAndClientWorkoutId(userId, clientWorkoutId))
        .thenReturn(Optional.of(existing));

    WorkoutSession result =
        service.createIndoor(principal, 2_000, 600, startedAt.toString(), null, clientWorkoutId);

    assertSame(existing, result);
    verify(workoutRepository, never()).save(any());
    verifyNoInteractions(indoorApprovalService, shoeService);
  }

  @Test
  void reusedRequestIdWithDifferentPayloadIsRejected() {
    UUID clientWorkoutId = UUID.randomUUID();
    OffsetDateTime startedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
    WorkoutSession existing = workout(
        WorkoutType.GPS,
        clientWorkoutId,
        startedAt,
        startedAt.plusSeconds(300),
        300,
        1_000,
        65,
        300,
        null);
    when(workoutRepository.findByUserIdAndClientWorkoutId(userId, clientWorkoutId))
        .thenReturn(Optional.of(existing));

    ApiException error = assertThrows(
        ApiException.class,
        () -> service.create(
            principal,
            startedAt,
            startedAt.plusSeconds(300),
            300,
            1_001,
            65,
            300,
            List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)),
            null,
            null,
            clientWorkoutId));

    assertEquals("workout_request_id_reused", error.code());
    verify(workoutRepository, never()).save(any());
  }

  private WorkoutSession workout(
      WorkoutType type,
      UUID clientWorkoutId,
      OffsetDateTime startedAt,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      String imageUrl) {
    return WorkoutSession.builder()
        .id(99L)
        .user(user)
        .clientWorkoutId(clientWorkoutId)
        .workoutType(type)
        .startedAt(startedAt)
        .endedAt(endedAt)
        .durationSec(durationSec)
        .distanceM(distanceM)
        .calories(calories)
        .avgPaceSecPerKm(avgPaceSecPerKm)
        .imageUrl(imageUrl)
        .pathJson("[]")
        .createdAt(startedAt)
        .build();
  }
}
