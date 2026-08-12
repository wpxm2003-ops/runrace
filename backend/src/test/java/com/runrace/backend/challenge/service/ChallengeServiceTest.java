package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class ChallengeServiceTest {

  @Mock AppUserRepository appUserRepository;
  @Mock ChallengeRepository challengeRepository;
  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock ChallengeWorkoutRepository challengeWorkoutRepository;
  @Mock WorkoutSessionRepository workoutSessionRepository;
  @Mock ApplicationEventPublisher eventPublisher;
  @Mock RivalRepository rivalRepository;
  @Mock RaceFinalizationService raceFinalization;
  @Mock ActivityHistoryService activityHistoryService;

  @InjectMocks ChallengeService service;

  private static final OffsetDateTime PAST   = OffsetDateTime.parse("2020-01-01T00:00:00Z");
  private static final OffsetDateTime FUTURE = OffsetDateTime.parse("2999-01-01T00:00:00Z");

  private static AppUser user(UUID id) {
    return AppUser.builder().id(id).nickname("nick").build();
  }

  private static Challenge challenge(UUID creatorId, OffsetDateTime startAt, OffsetDateTime endAt) {
    return Challenge.builder()
        .id(1L)
        .creator(user(creatorId))
        .startAt(startAt)
        .endAt(endAt)
        .maxMembers(10)
        .goalKm(BigDecimal.valueOf(5))
        .build();
  }

  // ── hasStarted ───────────────────────────────────────────────────────────

  @Nested class HasStarted {
    @Test void 시작전이면_false() {
      Challenge c = challenge(UUID.randomUUID(), FUTURE, FUTURE.plusDays(7));
      assertEquals(false, ChallengeService.hasStarted(c, OffsetDateTime.now()));
    }

    @Test void 시작시각_이후이면_true() {
      Challenge c = challenge(UUID.randomUUID(), PAST, FUTURE);
      assertEquals(true, ChallengeService.hasStarted(c, OffsetDateTime.now()));
    }
  }

  // ── isEnded ──────────────────────────────────────────────────────────────

  @Nested class IsEnded {
    @Test void 종료_플래그가_true면_날짜_무관하게_true() {
      Challenge c = challenge(UUID.randomUUID(), FUTURE, FUTURE.plusDays(7));
      c.end();
      assertEquals(true, ChallengeService.isEnded(c, OffsetDateTime.now()));
    }

    @Test void 종료시각_지나면_true() {
      Challenge c = challenge(UUID.randomUUID(), PAST, PAST.plusDays(1));
      assertEquals(true, ChallengeService.isEnded(c, OffsetDateTime.now()));
    }

    @Test void 아직_종료되지_않으면_false() {
      Challenge c = challenge(UUID.randomUUID(), PAST, FUTURE);
      assertEquals(false, ChallengeService.isEnded(c, OffsetDateTime.now()));
    }

    @Test void endAt_null이면_false() {
      Challenge c = challenge(UUID.randomUUID(), PAST, null);
      assertEquals(false, ChallengeService.isEnded(c, OffsetDateTime.now()));
    }
  }

  // ── progressPercent ──────────────────────────────────────────────────────

  @Nested class ProgressPercent {
    private static Challenge goal(double km) {
      return Challenge.builder().goalKm(BigDecimal.valueOf(km)).build();
    }

    private static ChallengeMember memberKm(double km) {
      return ChallengeMember.builder().totalKm(BigDecimal.valueOf(km)).build();
    }

    // BigDecimal.equals()는 scale 포함 비교 → compareTo로 값만 비교한다.

    @Test void 절반_진행이면_50() {
      assertEquals(0, BigDecimal.valueOf(50).compareTo(
          service.progressPercent(memberKm(5), goal(10))));
    }

    @Test void 초과_진행은_100으로_클램프() {
      assertEquals(0, BigDecimal.valueOf(100).compareTo(
          service.progressPercent(memberKm(15), goal(10))));
    }

    @Test void 정확히_목표_도달이면_100() {
      assertEquals(0, BigDecimal.valueOf(100).compareTo(
          service.progressPercent(memberKm(10), goal(10))));
    }

    @Test void 목표거리_0이면_0() {
      assertEquals(0, BigDecimal.ZERO.compareTo(
          service.progressPercent(memberKm(5), goal(0))));
    }
  }

  // ── validateRoomInput (createRoom 경유, 검증 실패는 DB 호출 전 발생) ────

  @Nested class ValidateRoomInput {
    private final AuthPrincipal p = new AuthPrincipal(UUID.randomUUID(), "uid");
    private final OffsetDateTime start = OffsetDateTime.now().plusDays(1);
    private final OffsetDateTime end   = start.plusDays(7);

    @Test void 목표거리_0이면_invalid_goal_km() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createRoom(p, "Title", BigDecimal.ZERO, 5, start, end, "ko", null));
      assertEquals("invalid_goal_km", ex.code());
    }

    @Test void 목표거리_1001이면_invalid_goal_km() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createRoom(p, "Title", BigDecimal.valueOf(1001), 5, start, end, "ko", null));
      assertEquals("invalid_goal_km", ex.code());
    }

    @Test void 최대인원_0이면_invalid_max_members() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createRoom(p, "Title", BigDecimal.valueOf(5), 0, start, end, "ko", null));
      assertEquals("invalid_max_members", ex.code());
    }

    @Test void 최대인원_51이면_invalid_max_members() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createRoom(p, "Title", BigDecimal.valueOf(5), 51, start, end, "ko", null));
      assertEquals("invalid_max_members", ex.code());
    }

    @Test void 종료가_시작보다_이전이면_invalid_date_range() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createRoom(p, "Title", BigDecimal.valueOf(5), 5, start, start.minusHours(1), "ko", null));
      assertEquals("invalid_date_range", ex.code());
    }

    @Test void 기간_31일_초과이면_race_duration_too_long() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createRoom(p, "Title", BigDecimal.valueOf(5), 5, start, start.plusDays(32), "ko", null));
      assertEquals("race_duration_too_long", ex.code());
    }

    @Test void 제목_빈값이면_invalid_title() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.createRoom(p, "  ", BigDecimal.valueOf(5), 5, start, end, "ko", null));
      assertEquals("invalid_title", ex.code());
    }
  }

  // ── joinRoom ─────────────────────────────────────────────────────────────

  @Nested class JoinRoom {
    private final UUID userId = UUID.randomUUID();
    private final AuthPrincipal p = new AuthPrincipal(userId, "uid");

    @Test void 이미_시작된_방이면_already_started() {
      Challenge c = challenge(UUID.randomUUID(), PAST, FUTURE);
      when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(c));

      ApiException ex = assertThrows(ApiException.class, () -> service.joinRoom(p, 1L));
      assertEquals("already_started", ex.code());
    }

    @Test void 종료된_방이면_ended() {
      // startAt이 미래라 hasStarted=false → ensureNotStarted 통과, isEnded(플래그)=true → ended
      Challenge c = challenge(UUID.randomUUID(), FUTURE, FUTURE.plusDays(7));
      c.end();
      when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(c));

      ApiException ex = assertThrows(ApiException.class, () -> service.joinRoom(p, 1L));
      assertEquals("ended", ex.code());
    }

    @Test void 이미_멤버면_already_member() {
      Challenge c = challenge(UUID.randomUUID(), FUTURE, FUTURE.plusDays(7));
      when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(1L), any()))
          .thenReturn(Optional.of(ChallengeMember.builder().build()));

      ApiException ex = assertThrows(ApiException.class, () -> service.joinRoom(p, 1L));
      assertEquals("already_member", ex.code());
    }

    @Test void 방이_꽉_찼으면_room_full() {
      Challenge c = challenge(UUID.randomUUID(), FUTURE, FUTURE.plusDays(7));
      when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(any(), any()))
          .thenReturn(Optional.empty());
      when(challengeMemberRepository.countByChallengeId(1L)).thenReturn(10L); // maxMembers=10

      ApiException ex = assertThrows(ApiException.class, () -> service.joinRoom(p, 1L));
      assertEquals("room_full", ex.code());
    }

    /**
     * 정원 확인~저장 사이의 동시 가입 경합(TOCTOU)을 막으려면 이 조회가 잠금이어야 한다.
     * findById(비잠금)로 되돌아가면 이 테스트가 실패해 회귀를 잡는다.
     */
    @Test void 정상_참가는_잠긴_조회를_사용한다() {
      Challenge c = challenge(UUID.randomUUID(), FUTURE, FUTURE.plusDays(7));
      when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(1L, userId))
          .thenReturn(Optional.empty());
      when(challengeMemberRepository.countByChallengeId(1L)).thenReturn(3L); // maxMembers=10
      when(appUserRepository.getRequired(userId)).thenReturn(user(userId));

      service.joinRoom(p, 1L);

      verify(challengeRepository).findByIdForUpdate(1L);
      verify(challengeRepository, never()).findById(1L);
      verify(challengeMemberRepository).saveAndFlush(any(ChallengeMember.class));
    }
  }

  // ── updateRoom ───────────────────────────────────────────────────────────

  @Nested class UpdateRoom {
    private final UUID ownerId = UUID.randomUUID();
    private final AuthPrincipal p = new AuthPrincipal(ownerId, "uid");
    private final OffsetDateTime start = OffsetDateTime.now().plusDays(1);
    private final OffsetDateTime end = start.plusDays(7);

    @Test void 정원_축소가_실제_인원보다_작으면_max_members_too_small() {
      Challenge c = challenge(ownerId, start, end);
      when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.countByChallengeId(1L)).thenReturn(4L);

      ApiException ex = assertThrows(ApiException.class,
          () -> service.updateRoom(p, 1L, "Title", BigDecimal.valueOf(5), 3, start, end, null));

      assertEquals("max_members_too_small", ex.code());
    }

    /**
     * 정원 확인~저장 사이의 동시 가입 경합(TOCTOU)을 막으려면 이 조회가 잠금이어야 한다.
     * findByIdWithDetails(비잠금)로 되돌아가면 이 테스트가 실패해 회귀를 잡는다.
     */
    @Test void 정상_수정은_잠긴_조회를_사용한다() {
      Challenge c = challenge(ownerId, start, end);
      when(challengeRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.countByChallengeId(1L)).thenReturn(2L);

      service.updateRoom(p, 1L, "새제목", BigDecimal.valueOf(5), 10, start, end, null);

      verify(challengeRepository).findByIdForUpdate(1L);
      verify(challengeRepository, never()).findByIdWithDetails(any());
      verify(challengeRepository).save(c);
    }
  }

  // ── leaveRoom ────────────────────────────────────────────────────────────

  @Nested class LeaveRoom {
    @Test void 방장은_탈퇴_불가_owner_cannot_leave() {
      UUID ownerId = UUID.randomUUID();
      AuthPrincipal p = new AuthPrincipal(ownerId, "uid");
      Challenge c = challenge(ownerId, FUTURE, FUTURE.plusDays(7)); // 방장=ownerId
      when(challengeRepository.findById(1L)).thenReturn(Optional.of(c));

      ApiException ex = assertThrows(ApiException.class, () -> service.leaveRoom(p, 1L));
      assertEquals("owner_cannot_leave", ex.code());
    }

    @Test void 멤버가_아닌_사람의_탈퇴시도_not_member() {
      UUID ownerId = UUID.randomUUID();
      UUID otherId = UUID.randomUUID();
      AuthPrincipal p = new AuthPrincipal(otherId, "uid");
      Challenge c = challenge(ownerId, FUTURE, FUTURE.plusDays(7));
      when(challengeRepository.findById(1L)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(1L), eq(otherId)))
          .thenReturn(Optional.empty());

      ApiException ex = assertThrows(ApiException.class, () -> service.leaveRoom(p, 1L));
      assertEquals("not_member", ex.code());
    }
  }
}
