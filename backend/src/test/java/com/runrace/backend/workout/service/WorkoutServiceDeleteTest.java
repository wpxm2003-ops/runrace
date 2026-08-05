package com.runrace.backend.workout.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
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
import com.runrace.backend.workout.domain.PersonalBest;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.repository.PersonalBestRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

/** 운동 삭제 시 FK 참조 정리 회귀 잠금. */
@ExtendWith(MockitoExtension.class)
class WorkoutServiceDeleteTest {

  @Mock WorkoutSessionRepository workoutRepository;
  @Mock AppUserRepository userRepository;
  @Mock ChallengeProgressService challengeProgressService;
  @Mock CrewMatchService crewMatchService;
  @Mock IndoorApprovalService indoorApprovalService;
  @Mock ChallengeWorkoutRepository challengeWorkoutRepository;
  @Mock IndoorRunApprovalRepository indoorRunApprovalRepository;
  @Mock ImageUploadService imageUploadService;
  @Mock PersonalBestRepository personalBestRepository;
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
        personalBestRepository,
        shoeService,
        eventPublisher,
        new ObjectMapper(),
        com.runrace.backend.workout.elevation.TerrainElevationSource.disabled());
    userId = UUID.randomUUID();
    principal = new AuthPrincipal(userId, "uid");
  }

  /**
   * personal_best.workout_id는 ON DELETE 없는 FK라(V33), 이 정리를 빼면 개인 기록을 세운
   * 운동은 삭제가 FK 위반으로 통째 롤백된다. 순서도 중요 — 참조를 먼저 지워야 한다.
   */
  @Test
  void 개인기록을_세운_운동은_그_기록을_먼저_지우고_삭제한다() {
    WorkoutSession session = WorkoutSession.builder().id(42L).user(user).pathJson("[]").build();
    PersonalBest pb = PersonalBest.of(userId, "5k", 300, 5_000, 42L);
    when(workoutRepository.findByIdAndUserId(42L, userId)).thenReturn(Optional.of(session));
    when(personalBestRepository.findAllByWorkoutId(42L)).thenReturn(List.of(pb));

    service.deleteForUser(principal, 42L);

    InOrder order = inOrder(personalBestRepository, workoutRepository);
    order.verify(personalBestRepository).deleteAll(List.of(pb));
    order.verify(workoutRepository).delete(session);
  }

  @Test
  void 개인기록이_없으면_빈_목록으로_호출하고_정상_삭제한다() {
    WorkoutSession session = WorkoutSession.builder().id(43L).user(user).pathJson("[]").build();
    when(workoutRepository.findByIdAndUserId(43L, userId)).thenReturn(Optional.of(session));
    when(personalBestRepository.findAllByWorkoutId(43L)).thenReturn(List.of());

    service.deleteForUser(principal, 43L);

    verify(personalBestRepository).deleteAll(List.of());
    verify(workoutRepository).delete(session);
    verify(eventPublisher, org.mockito.Mockito.never()).publishEvent(any());
  }
}
