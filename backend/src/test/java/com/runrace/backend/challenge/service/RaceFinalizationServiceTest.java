package com.runrace.backend.challenge.service;

import static com.runrace.backend.challenge.service.RaceFinalizationService.RACE_RESULT_ORDER;
import static com.runrace.backend.challenge.service.RaceFinalizationService.firstFinisher;
import static com.runrace.backend.challenge.service.RaceFinalizationService.resolveWinner;
import static com.runrace.backend.challenge.service.RaceFinalizationService.topByDistance;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.user.domain.AppUser;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.context.ApplicationEventPublisher;

/** 레이스 순위·우승자 결정 규칙과 종료 확정 부작용의 회귀 테스트. */
class RaceFinalizationServiceTest {

  private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

  private static AppUser user(String nickname) {
    return AppUser.builder().id(java.util.UUID.randomUUID()).nickname(nickname).build();
  }

  private static ChallengeMember member(AppUser u, double km, OffsetDateTime finishedAt) {
    return ChallengeMember.builder()
        .user(u)
        .totalKm(BigDecimal.valueOf(km))
        .finishedAt(finishedAt)
        .build();
  }

  private static Challenge challenge(AppUser winner, OffsetDateTime endAt) {
    return Challenge.builder().winner(winner).endAt(endAt).build();
  }

  private static List<String> nicks(List<ChallengeMember> ms) {
    return ms.stream().map(m -> m.getUser().getNickname()).toList();
  }

  @Test
  void 종료확정은_승인대기_실내런만_거부저장한_뒤_경품을_추첨한다() {
    ChallengeRepository challengeRepository = mock(ChallengeRepository.class);
    ChallengeMemberRepository memberRepository = mock(ChallengeMemberRepository.class);
    ChallengeWorkoutRepository workoutRepository = mock(ChallengeWorkoutRepository.class);
    ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
    PrizeDrawingService prizeDrawingService = mock(PrizeDrawingService.class);
    RaceFinalizationService service = new RaceFinalizationService(
        challengeRepository,
        memberRepository,
        workoutRepository,
        eventPublisher,
        prizeDrawingService);

    Challenge challenge = Challenge.builder().id(10L).endAt(T0).build();
    ChallengeWorkout pending = ChallengeWorkout.builder()
        .id(100L)
        .approvalStatus(ApprovalStatus.PENDING)
        .build();
    ChallengeWorkout approved = ChallengeWorkout.builder()
        .id(101L)
        .approvalStatus(ApprovalStatus.APPROVED)
        .build();
    when(workoutRepository.findAllByChallengeIdAndApprovalStatus(
        10L, ApprovalStatus.PENDING)).thenReturn(List.of(pending));

    service.finalizeRace(challenge, List.of(), null);

    assertEquals(ApprovalStatus.REJECTED, pending.getApprovalStatus());
    assertEquals(ApprovalStatus.APPROVED, approved.getApprovalStatus());
    InOrder order = inOrder(workoutRepository, prizeDrawingService);
    order.verify(workoutRepository)
        .findAllByChallengeIdAndApprovalStatus(10L, ApprovalStatus.PENDING);
    order.verify(workoutRepository).saveAll(List.of(pending));
    order.verify(prizeDrawingService).drawIfNeeded(challenge, List.of());
    verify(challengeRepository).save(challenge);
  }

  @Nested
  class RaceResultOrder {
    @Test
    void 완주자는_미완주자보다_앞선다() {
      ChallengeMember finisher = member(user("F"), 3, T0.plusHours(1));
      ChallengeMember runner = member(user("R"), 99, null);
      List<ChallengeMember> sorted = Stream.of(runner, finisher).sorted(RACE_RESULT_ORDER).toList();
      assertEquals(List.of("F", "R"), nicks(sorted));
    }

    @Test
    void 완주자끼리는_완주시각이_빠른_순() {
      ChallengeMember early = member(user("early"), 10, T0.plusHours(1));
      ChallengeMember late = member(user("late"), 10, T0.plusHours(5));
      List<ChallengeMember> sorted = Stream.of(late, early).sorted(RACE_RESULT_ORDER).toList();
      assertEquals(List.of("early", "late"), nicks(sorted));
    }

    @Test
    void 미완주자끼리는_누적거리_내림차순() {
      ChallengeMember far = member(user("far"), 8.5, null);
      ChallengeMember near = member(user("near"), 2.0, null);
      List<ChallengeMember> sorted = Stream.of(near, far).sorted(RACE_RESULT_ORDER).toList();
      assertEquals(List.of("far", "near"), nicks(sorted));
    }

    @Test
    void 완주_미완주_혼합_전체_정렬() {
      ChallengeMember f1 = member(user("f1"), 5, T0.plusHours(2));
      ChallengeMember f2 = member(user("f2"), 5, T0.plusHours(1));
      ChallengeMember r1 = member(user("r1"), 9, null);
      ChallengeMember r2 = member(user("r2"), 4, null);
      List<ChallengeMember> sorted = Stream.of(r1, f1, r2, f2).sorted(RACE_RESULT_ORDER).toList();
      // 완주자(빠른순) f2,f1 → 미완주(거리순) r1,r2
      assertEquals(List.of("f2", "f1", "r1", "r2"), nicks(sorted));
    }
  }

  @Nested
  class FirstFinisher {
    @Test
    void 가장_먼저_완주한_사용자() {
      AppUser early = user("early");
      ChallengeMember m1 = member(user("late"), 5, T0.plusHours(3));
      ChallengeMember m2 = member(early, 5, T0.plusHours(1));
      ChallengeMember m3 = member(user("never"), 5, null);
      assertSame(early, firstFinisher(List.of(m1, m2, m3)));
    }

    @Test
    void 완주자가_없으면_null() {
      assertNull(firstFinisher(List.of(member(user("a"), 5, null))));
    }
  }

  @Nested
  class TopByDistance {
    @Test
    void 누적거리_최상위() {
      AppUser top = user("top");
      ChallengeMember m1 = member(user("a"), 3, null);
      ChallengeMember m2 = member(top, 7, null);
      assertSame(top, topByDistance(List.of(m1, m2)));
    }

    @Test
    void 거리_동률이면_먼저_완주한_사용자() {
      AppUser earlier = user("earlier");
      ChallengeMember m1 = member(user("later"), 5, T0.plusHours(2));
      ChallengeMember m2 = member(earlier, 5, T0.plusHours(1));
      assertSame(earlier, topByDistance(List.of(m1, m2)));
    }

    @Test
    void 전원_0km이면_null() {
      ChallengeMember m1 = member(user("a"), 0, null);
      ChallengeMember m2 = member(user("b"), 0, null);
      assertNull(topByDistance(List.of(m1, m2)));
    }
  }

  @Nested
  class ResolveWinner {
    @Test
    void 참여자가_1명이면_null() {
      ChallengeMember solo = member(user("solo"), 10, T0.plusHours(1));
      assertNull(resolveWinner(challenge(null, T0), List.of(solo), T0.plusDays(1)));
    }

    @Test
    void 이미_확정된_승자가_있으면_그대로() {
      AppUser declared = user("declared");
      ChallengeMember m1 = member(user("a"), 99, T0.plusHours(1)); // 완주·최다거리지만
      ChallengeMember m2 = member(user("b"), 1, null);
      assertSame(declared, resolveWinner(challenge(declared, T0), List.of(m1, m2), T0.plusDays(1)));
    }

    @Test
    void 확정승자_없고_완주자가_있으면_첫_완주자() {
      AppUser first = user("first");
      ChallengeMember m1 = member(user("b"), 50, null);
      ChallengeMember m2 = member(first, 5, T0.plusHours(1));
      assertSame(first, resolveWinner(challenge(null, T0.plusDays(10)), List.of(m1, m2), T0));
    }

    @Test
    void 완주자_없고_기간만료면_누적거리_최상위() {
      AppUser top = user("top");
      ChallengeMember m1 = member(user("a"), 3, null);
      ChallengeMember m2 = member(top, 8, null);
      // now(T0+1d) > endAt(T0) → 기간 만료
      assertSame(top, resolveWinner(challenge(null, T0), List.of(m1, m2), T0.plusDays(1)));
    }

    @Test
    void 완주자_없고_기간_미만료면_null() {
      ChallengeMember m1 = member(user("a"), 3, null);
      ChallengeMember m2 = member(user("b"), 8, null);
      // now(T0) < endAt(T0+10d) → 아직 진행 중
      assertNull(resolveWinner(challenge(null, T0.plusDays(10)), List.of(m1, m2), T0));
    }

    @Test
    void 기간만료여도_전원_0km이면_null() {
      ChallengeMember m1 = member(user("a"), 0, null);
      ChallengeMember m2 = member(user("b"), 0, null);
      assertNull(resolveWinner(challenge(null, T0), List.of(m1, m2), T0.plusDays(1)));
    }
  }

  /**
   * 표시 정렬(라이브 반영)과 확정 정렬(final_rank 기준)의 분리 — 둘이 같은 comparator를 쓰면
   * 종료 화면에서 순서·메달이 확정 순위와 어긋난다.
   */
  @Nested
  class DisplayOrder {

    private static ChallengeMember live(AppUser u, double totalKm, double liveKm, OffsetDateTime at) {
      return ChallengeMember.builder()
          .user(u)
          .totalKm(BigDecimal.valueOf(totalKm))
          .liveKm(BigDecimal.valueOf(liveKm))
          .liveUpdatedAt(at)
          .build();
    }

    @Test
    void 신선한_라이브를_접어_정렬한다() {
      // 확정만 보면 b(5km)가 앞이지만, a는 지금 8km를 뛰는 중이다.
      ChallengeMember a = live(user("a"), 0, 8, T0.minusMinutes(1));
      ChallengeMember b = member(user("b"), 5, null);

      assertEquals(List.of("a", "b"), nicks(Stream.of(b, a)
          .sorted(RaceFinalizationService.displayOrder(T0, m -> true)).toList()));
    }

    @Test
    void 신선하지_않은_라이브는_무시한다() {
      ChallengeMember a = live(user("a"), 0, 8, T0.minusMinutes(30));
      ChallengeMember b = member(user("b"), 5, null);

      assertEquals(List.of("b", "a"), nicks(Stream.of(a, b)
          .sorted(RaceFinalizationService.displayOrder(T0, m -> true)).toList()));
    }

    @Test
    void 공유를_끈_멤버의_지각_라이브값은_정렬에서_제외한다() {
      ChallengeMember hidden = live(user("hidden"), 0, 8, T0.minusMinutes(1));
      ChallengeMember visible = member(user("visible"), 5, null);

      assertEquals(List.of("visible", "hidden"), nicks(Stream.of(hidden, visible)
          .sorted(RaceFinalizationService.displayOrder(T0, m -> m != hidden)).toList()));
    }

    @Test
    void 확정_정렬은_라이브를_보지_않는다() {
      // 같은 입력이라도 RACE_RESULT_ORDER는 확정값만 본다 — final_rank가 잠정값에 흔들리면 안 된다.
      ChallengeMember a = live(user("a"), 0, 8, T0.minusMinutes(1));
      ChallengeMember b = member(user("b"), 5, null);

      assertEquals(List.of("b", "a"), nicks(Stream.of(a, b).sorted(RACE_RESULT_ORDER).toList()));
    }

    @Test
    void 완주자_우선_규칙은_라이브와_무관하게_유지된다() {
      ChallengeMember finished = member(user("done"), 1, T0.minusHours(1));
      ChallengeMember running = live(user("running"), 0, 50, T0.minusMinutes(1));

      assertEquals(List.of("done", "running"), nicks(Stream.of(running, finished)
          .sorted(RaceFinalizationService.displayOrder(T0, m -> true)).toList()));
    }
  }
}
