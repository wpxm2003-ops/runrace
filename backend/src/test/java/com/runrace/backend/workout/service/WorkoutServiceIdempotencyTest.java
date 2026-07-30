package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
        null, // personalBestRepository — 이 테스트 경로는 삭제를 타지 않는다
        shoeService,
        eventPublisher,
        new ObjectMapper());
    userId = UUID.randomUUID();
    principal = new AuthPrincipal(userId, "uid");
    when(userRepository.getRequiredForUpdate(userId)).thenReturn(user);
  }

  @Test
  void gpsRetryReturnsExistingWorkoutWithoutRepeatingSideEffects() {
    UUID clientWorkoutId = UUID.randomUUID();
    OffsetDateTime startedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
    OffsetDateTime endedAt = startedAt.plusSeconds(300);
    WorkoutSession existing = workout(
        WorkoutType.GPS, clientWorkoutId, startedAt, endedAt, 300, 50, 65, 300, null);
    when(workoutRepository.findByUserIdAndClientWorkoutId(userId, clientWorkoutId))
        .thenReturn(Optional.of(existing));

    WorkoutService.SavedWorkout result = service.create(
        principal,
        startedAt,
        endedAt,
        300,
        50,
        65,
        300,
        List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)),
        null,
        null,
        clientWorkoutId);

    assertSame(existing, result.session());
    // 멱등 히트임을 호출자에게 알려야 컨트롤러가 PB·성과 재계산을 건너뛴다.
    // 재계산하면 이미 갱신된 PB와 등호로 비교돼 "갱신 없음"이라는 틀린 응답이 나간다.
    assertTrue(result.deduplicated());
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

    WorkoutService.SavedWorkout result =
        service.createIndoor(principal, 2_000, 600, startedAt.toString(), null, clientWorkoutId);

    assertSame(existing, result.session());
    assertTrue(result.deduplicated());
    verify(workoutRepository, never()).save(any());
    verifyNoInteractions(indoorApprovalService, shoeService);
  }

  /**
   * 신규 저장은 deduplicated=false여야 한다 — 이 값이 잘못 true가 되면 컨트롤러가 축하 계산을
   * 통째로 건너뛰어 PB·성과가 한 번도 표시되지 않는다(가드가 뒤집혔을 때 조용히 실패하는 방향).
   */
  @Test
  void freshIndoorSaveIsNotMarkedAsDeduplicated() {
    UUID clientWorkoutId = UUID.randomUUID();
    OffsetDateTime startedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
    when(workoutRepository.findByUserIdAndClientWorkoutId(userId, clientWorkoutId))
        .thenReturn(Optional.empty());
    when(workoutRepository.save(any(WorkoutSession.class))).thenAnswer(inv -> inv.getArgument(0));

    WorkoutService.SavedWorkout result =
        service.createIndoor(principal, 2_000, 600, startedAt.toString(), null, clientWorkoutId);

    assertFalse(result.deduplicated());
    verify(workoutRepository).save(any(WorkoutSession.class));
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
        40,
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
            45,
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
