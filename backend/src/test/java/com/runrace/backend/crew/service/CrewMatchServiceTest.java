package com.runrace.backend.crew.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMatch;
import com.runrace.backend.crew.domain.CrewMatchRoster;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewMatchRepository;
import com.runrace.backend.crew.repository.CrewMatchRosterRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class CrewMatchServiceTest {

  @Mock CrewRepository crewRepository;
  @Mock CrewMemberRepository crewMemberRepository;
  @Mock CrewMatchRepository crewMatchRepository;
  @Mock CrewMatchRosterRepository crewMatchRosterRepository;
  @Mock WorkoutSessionRepository workoutSessionRepository;
  @Mock ApplicationEventPublisher eventPublisher;

  @InjectMocks CrewMatchService service;

  private final UUID leaderId = UUID.randomUUID();

  private AppUser user(UUID id) {
    return AppUser.builder().id(id).nickname("u-" + id.toString().substring(0, 4)).build();
  }

  private Crew crew(long id, UUID leaderUserId, String name) {
    return Crew.builder()
        .id(id).name(name).joinCode("C" + id + "DE24")
        .leader(user(leaderUserId)).maxMembers(300)
        .createdAt(OffsetDateTime.now())
        .build();
  }

  private CrewMember member(Crew crew, UUID userId) {
    return CrewMember.builder().crew(crew).user(user(userId)).joinedAt(OffsetDateTime.now()).build();
  }

  /** 리더 소속 크루 + 멤버 3명(리더 포함) 목킹 후 (크루, 로스터 후보 id 목록) 반환. */
  private Object[] myCrewWithMembers() {
    Crew mine = crew(1L, leaderId, "우리크루");
    UUID m2 = UUID.randomUUID();
    UUID m3 = UUID.randomUUID();
    when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
    when(crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(1L))
        .thenReturn(List.of(member(mine, leaderId), member(mine, m2), member(mine, m3)));
    return new Object[] {mine, List.of(leaderId, m2, m3)};
  }

  // ── create ───────────────────────────────────────────────────────────────

  @Nested class Create {
    @Test void 리더가_아니면_not_leader() {
      Crew mine = crew(1L, UUID.randomUUID(), "우리크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(leaderId, "상대크루", 3, 7, List.of()));
      assertEquals("not_leader", ex.code());
    }

    @Test void 로스터_인원_범위_밖이면_invalid_roster_size() {
      Crew mine = crew(1L, leaderId, "우리크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(leaderId, "상대크루", 2, 7, List.of()));
      assertEquals("invalid_roster_size", ex.code());
    }

    @Test void 기간_범위_밖이면_invalid_duration() {
      Crew mine = crew(1L, leaderId, "우리크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(leaderId, "상대크루", 3, 15, List.of()));
      assertEquals("invalid_duration", ex.code());
    }

    @Test void 자기_크루에_도전하면_cannot_challenge_self() {
      Crew mine = crew(1L, leaderId, "우리크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      when(crewRepository.findByName("우리크루")).thenReturn(Optional.of(mine));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(leaderId, "우리크루", 3, 7, List.of()));
      assertEquals("cannot_challenge_self", ex.code());
    }

    @Test void 상대_인원이_로스터보다_적으면_opponent_too_small() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      when(crewRepository.findByName("상대크루")).thenReturn(Optional.of(other));
      when(crewMemberRepository.countByCrewId(2L)).thenReturn(2);
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(leaderId, "상대크루", 3, 7, List.of()));
      assertEquals("opponent_too_small", ex.code());
    }

    @Test void 이미_활성_대결이_있으면_match_already_active() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      when(crewRepository.findByName("상대크루")).thenReturn(Optional.of(other));
      when(crewMemberRepository.countByCrewId(2L)).thenReturn(5);
      when(crewMatchRepository.findActiveByCrewId(eq(1L), any()))
          .thenReturn(List.of(CrewMatch.builder()
              .challengerCrew(mine).opponentCrew(other)
              .rosterSize(3).durationDays(7).createdAt(OffsetDateTime.now()).build()));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(leaderId, "상대크루", 3, 7, List.of()));
      assertEquals("match_already_active", ex.code());
    }

    @Test void 로스터에_크루_밖_사람이_있으면_roster_not_member() {
      Object[] ctx = myCrewWithMembers();
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewRepository.findByName("상대크루")).thenReturn(Optional.of(other));
      when(crewMemberRepository.countByCrewId(2L)).thenReturn(5);
      when(crewMatchRepository.findActiveByCrewId(any(), any())).thenReturn(List.of());
      List<UUID> roster = List.of(leaderId, UUID.randomUUID(), UUID.randomUUID());
      ApiException ex = assertThrows(ApiException.class,
          () -> service.create(leaderId, "상대크루", 3, 7, roster));
      assertEquals("roster_not_member", ex.code());
      assertTrue(ctx.length > 0);
    }

    @Test void 정상_도전은_매치와_로스터_저장() {
      Object[] ctx = myCrewWithMembers();
      @SuppressWarnings("unchecked")
      List<UUID> roster = (List<UUID>) ctx[1];
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewRepository.findByName("상대크루")).thenReturn(Optional.of(other));
      when(crewMemberRepository.countByCrewId(2L)).thenReturn(5);
      when(crewMatchRepository.findActiveByCrewId(any(), any())).thenReturn(List.of());
      // 실제 저장소처럼 id가 부여된 엔티티를 돌려준다(도전장 푸시 이벤트가 matchId를 쓴다).
      when(crewMatchRepository.save(any())).thenAnswer(inv -> {
        CrewMatch m = inv.getArgument(0);
        return CrewMatch.builder()
            .id(10L)
            .challengerCrew(m.getChallengerCrew())
            .opponentCrew(m.getOpponentCrew())
            .rosterSize(m.getRosterSize())
            .durationDays(m.getDurationDays())
            .createdAt(m.getCreatedAt())
            .build();
      });

      service.create(leaderId, "상대크루", 3, 7, roster);

      verify(crewMatchRepository).save(any(CrewMatch.class));
      verify(crewMatchRosterRepository, times(3)).save(any(CrewMatchRoster.class));
      verify(eventPublisher).publishEvent(any(com.runrace.backend.event.CrewMatchEvents.ChallengeReceived.class));
    }
  }

  // ── accept / decline / cancel ────────────────────────────────────────────

  @Nested class Accept {
    @Test void 상대_크루_리더가_아니면_not_opponent_leader() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      // 내 크루(1L)가 도전자인 매치 — 수락 권한은 상대(2L) 리더에게만 있다.
      CrewMatch match = CrewMatch.builder()
          .id(10L).challengerCrew(mine).opponentCrew(other)
          .rosterSize(3).durationDays(7).createdAt(OffsetDateTime.now()).build();
      when(crewMatchRepository.findByIdWithCrews(10L)).thenReturn(Optional.of(match));

      ApiException ex = assertThrows(ApiException.class,
          () -> service.accept(leaderId, 10L, List.of()));
      assertEquals("not_opponent_leader", ex.code());
    }

    @Test void 만료된_도전장이면_match_expired() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew challenger = crew(2L, UUID.randomUUID(), "도전크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      CrewMatch match = CrewMatch.builder()
          .id(10L).challengerCrew(challenger).opponentCrew(mine)
          .rosterSize(3).durationDays(7)
          .createdAt(OffsetDateTime.now().minusDays(8)).build();
      when(crewMatchRepository.findByIdWithCrews(10L)).thenReturn(Optional.of(match));

      ApiException ex = assertThrows(ApiException.class,
          () -> service.accept(leaderId, 10L, List.of()));
      assertEquals("match_expired", ex.code());
    }

    @Test void 정상_수락은_다음날_0시_KST_시작으로_확정_및_출전_푸시() {
      Object[] ctx = myCrewWithMembers();
      @SuppressWarnings("unchecked")
      List<UUID> roster = (List<UUID>) ctx[1];
      Crew mine = (Crew) ctx[0];
      Crew challenger = crew(2L, UUID.randomUUID(), "도전크루");
      CrewMatch match = CrewMatch.builder()
          .id(10L).challengerCrew(challenger).opponentCrew(mine)
          .rosterSize(3).durationDays(7).createdAt(OffsetDateTime.now()).build();
      when(crewMatchRepository.findByIdWithCrews(10L)).thenReturn(Optional.of(match));
      when(crewMatchRepository.findActiveByCrewId(eq(2L), any())).thenReturn(List.of(match));
      // 성사 푸시 대상 — 도전 크루 로스터 1명 + 수락 크루 로스터(리더 포함) 중 리더 제외
      UUID challengerRunner = UUID.randomUUID();
      when(crewMatchRosterRepository.findAllByMatchId(10L)).thenReturn(List.of(
          CrewMatchRoster.builder().match(match).crewId(2L).user(user(challengerRunner)).build(),
          CrewMatchRoster.builder().match(match).crewId(1L).user(user(leaderId)).build()));

      service.accept(leaderId, 10L, roster);

      assertEquals(CrewMatch.Status.ACCEPTED, match.getStatus());
      assertEquals(0, match.getStartAt().atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).getHour());
      assertEquals(match.getStartAt().plusDays(7), match.getEndAt());
      verify(crewMatchRosterRepository, times(3)).save(any(CrewMatchRoster.class));
      verify(eventPublisher).publishEvent(any(com.runrace.backend.event.CrewMatchEvents.MatchConfirmed.class));
    }
  }

  @Nested class DeclineCancel {
    @Test void 거절은_상태_전이만() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew challenger = crew(2L, UUID.randomUUID(), "도전크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      CrewMatch match = CrewMatch.builder()
          .id(10L).challengerCrew(challenger).opponentCrew(mine)
          .rosterSize(3).durationDays(7).createdAt(OffsetDateTime.now()).build();
      when(crewMatchRepository.findByIdWithCrews(10L)).thenReturn(Optional.of(match));

      service.decline(leaderId, 10L);

      assertEquals(CrewMatch.Status.DECLINED, match.getStatus());
    }

    @Test void 취소는_도전_크루_리더만_그리고_삭제() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));
      CrewMatch match = CrewMatch.builder()
          .id(10L).challengerCrew(mine).opponentCrew(other)
          .rosterSize(3).durationDays(7).createdAt(OffsetDateTime.now()).build();
      when(crewMatchRepository.findByIdWithCrews(10L)).thenReturn(Optional.of(match));

      service.cancel(leaderId, 10L);

      verify(crewMatchRepository).delete(match);
    }
  }

  // ── 종료 확정(승자 판정) ──────────────────────────────────────────────────

  @Nested class Finalize {
    @Test void 기간_종료된_매치는_myMatches에서_승자_확정() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));

      OffsetDateTime start = OffsetDateTime.now().minusDays(8);
      CrewMatch match = CrewMatch.builder()
          .id(10L).challengerCrew(mine).opponentCrew(other)
          .rosterSize(3).durationDays(7).createdAt(start.minusDays(1)).build();
      match.accept(start, start.plusDays(7)); // endAt은 과거 → 확정 대상

      UUID myRunner = UUID.randomUUID();
      UUID opRunner = UUID.randomUUID();
      when(crewMatchRepository.findActiveByCrewId(eq(1L), any())).thenReturn(List.of(match));
      when(crewMatchRosterRepository.findAllByMatchId(10L)).thenReturn(List.of(
          CrewMatchRoster.builder().match(match).crewId(1L).user(user(myRunner)).build(),
          CrewMatchRoster.builder().match(match).crewId(2L).user(user(opRunner)).build()));
      when(workoutSessionRepository.aggregateDistanceBetweenByType(anyList(), any(), any(), any()))
          .thenReturn(List.of(
              agg(myRunner, 30_000), // 우리 크루 30km
              agg(opRunner, 20_000))); // 상대 20km
      when(crewMatchRepository.findEndedByCrewId(eq(1L), any(Pageable.class))).thenReturn(List.of());

      service.myMatches(leaderId);

      assertTrue(match.isEnded());
      assertEquals(1L, match.getWinnerCrewId());
    }

    @Test void 동점이면_무승부로_확정() {
      Crew mine = crew(1L, leaderId, "우리크루");
      Crew other = crew(2L, UUID.randomUUID(), "상대크루");
      when(crewMemberRepository.findByUserId(leaderId)).thenReturn(Optional.of(member(mine, leaderId)));

      OffsetDateTime start = OffsetDateTime.now().minusDays(8);
      CrewMatch match = CrewMatch.builder()
          .id(10L).challengerCrew(mine).opponentCrew(other)
          .rosterSize(3).durationDays(7).createdAt(start.minusDays(1)).build();
      match.accept(start, start.plusDays(7));

      when(crewMatchRepository.findActiveByCrewId(eq(1L), any())).thenReturn(List.of(match));
      when(crewMatchRosterRepository.findAllByMatchId(10L)).thenReturn(List.of());
      when(crewMatchRepository.findEndedByCrewId(eq(1L), any(Pageable.class))).thenReturn(List.of());

      service.myMatches(leaderId);

      assertTrue(match.isEnded());
      assertNull(match.getWinnerCrewId());
    }
  }

  private static WorkoutSessionRepository.UserDistanceAgg agg(UUID userId, long distanceM) {
    return new WorkoutSessionRepository.UserDistanceAgg() {
      @Override public UUID getUserId() { return userId; }
      @Override public long getDistanceM() { return distanceM; }
      @Override public long getRuns() { return 1; }
    };
  }
}
