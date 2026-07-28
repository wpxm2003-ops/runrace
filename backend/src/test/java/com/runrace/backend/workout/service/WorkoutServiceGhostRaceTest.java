package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.challenge.service.ChallengeProgressService;
import com.runrace.backend.challenge.service.IndoorApprovalService;
import com.runrace.backend.crew.service.CrewMatchService;
import com.runrace.backend.shoe.service.ShoeService;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.dto.GhostRaceResultDto;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

class WorkoutServiceGhostRaceTest {

  @Test
  void 삭제된_고스트는_버리고_본_운동은_저장한다() {
    WorkoutSessionRepository workoutRepository = mock(WorkoutSessionRepository.class);
    AppUserRepository userRepository = mock(AppUserRepository.class);
    ChallengeProgressService challengeProgressService = mock(ChallengeProgressService.class);
    CrewMatchService crewMatchService = mock(CrewMatchService.class);
    IndoorApprovalService indoorApprovalService = mock(IndoorApprovalService.class);
    ChallengeWorkoutRepository challengeWorkoutRepository = mock(ChallengeWorkoutRepository.class);
    IndoorRunApprovalRepository indoorRunApprovalRepository = mock(IndoorRunApprovalRepository.class);
    ImageUploadService imageUploadService = mock(ImageUploadService.class);
    ShoeService shoeService = mock(ShoeService.class);
    ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);

    UUID userId = UUID.randomUUID();
    AppUser user = mock(AppUser.class);
    WorkoutSession persisted = mock(WorkoutSession.class);
    when(persisted.getId()).thenReturn(99L);
    when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));
    when(workoutRepository.findByIdAndUserId(7L, userId)).thenReturn(Optional.empty());
    when(workoutRepository.save(any(WorkoutSession.class))).thenReturn(persisted);

    WorkoutService service = new WorkoutService(
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

    OffsetDateTime startedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
    GhostRaceResultDto result =
        new GhostRaceResultDto(2_345.67, 900_123, 710_178, 189_945);

    service.create(
        new AuthPrincipal(userId, "uid"),
        startedAt,
        startedAt.plusSeconds(1_000),
        1_000,
        3_000,
        200,
        333,
        List.of(new WorkoutService.PathPoint(37.0, 127.0, 0L)),
        7L,
        result,
        UUID.randomUUID());

    ArgumentCaptor<WorkoutSession> sessionCaptor = ArgumentCaptor.forClass(WorkoutSession.class);
    org.mockito.Mockito.verify(workoutRepository).save(sessionCaptor.capture());
    assertNull(sessionCaptor.getValue().getGhostWorkoutId());
    assertNull(sessionCaptor.getValue().getGhostResultJson());
  }
}
