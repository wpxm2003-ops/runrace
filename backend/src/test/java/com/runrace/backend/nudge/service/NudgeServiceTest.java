package com.runrace.backend.nudge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.event.NudgeEvents;
import com.runrace.backend.nudge.repository.NudgeRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
class NudgeServiceTest {

  @Mock AppUserRepository appUserRepository;
  @Mock ChallengeRepository challengeRepository;
  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock CrewMemberRepository crewMemberRepository;
  @Mock NudgeRepository nudgeRepository;
  @Mock ApplicationEventPublisher eventPublisher;

  @InjectMocks NudgeService service;

  private final UUID senderId = UUID.randomUUID();
  private final UUID targetId = UUID.randomUUID();

  private AppUser user(UUID id, String nickname) {
    return AppUser.builder().id(id).nickname(nickname).build();
  }

  private Challenge challenge(OffsetDateTime startAt, OffsetDateTime endAt, boolean ended, Long crewId) {
    return Challenge.builder()
        .id(1L)
        .creator(user(UUID.randomUUID(), "creator"))
        .startAt(startAt)
        .endAt(endAt)
        .createdAt(OffsetDateTime.now())
        .title("레이스")
        .goalKm(BigDecimal.TEN)
        .maxMembers(10)
        .isEnded(ended)
        .crewId(crewId)
        .build();
  }

  private Crew crew(long id, UUID leaderId) {
    return Crew.builder()
        .id(id)
        .name("달밤크루" + id)
        .joinCode("ABC" + id)
        .leader(user(leaderId, "leader"))
        .maxMembers(30)
        .createdAt(OffsetDateTime.now())
        .build();
  }

  private CrewMember member(Crew crew, UUID userId) {
    return CrewMember.builder().crew(crew).user(user(userId, "m")).joinedAt(OffsetDateTime.now()).build();
  }

  private void stubUsers() {
    when(appUserRepository.getRequired(senderId)).thenReturn(user(senderId, "sender"));
    when(appUserRepository.getRequired(targetId)).thenReturn(user(targetId, "target"));
  }

  // ── nudge (같은 레이스 참가자) ──────────────────────────────────────

  @Nested class RaceNudge {
    private final Long challengeId = 10L;
    private final AuthPrincipal principal = new AuthPrincipal(senderId, "fb-uid");

    @Test void 자기자신이면_cannot_nudge_self() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, senderId, 0));
      assertEquals("cannot_nudge_self", ex.code());
    }

    @Test void 레이스없으면_challenge_not_found() {
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("challenge_not_found", ex.code());
    }

    @Test void 시작전이면_race_not_in_progress() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.plusDays(1), now.plusDays(10), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("race_not_in_progress", ex.code());
    }

    @Test void 종료플래그면_race_not_in_progress() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(10), now.plusDays(10), true, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("race_not_in_progress", ex.code());
    }

    @Test void 종료시각지났으면_race_not_in_progress() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(10), now.minusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("race_not_in_progress", ex.code());
    }

    @Test void 보낸사람이_참가자아니면_forbidden() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(challengeId, senderId))
          .thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("forbidden", ex.code());
    }

    @Test void 받는사람이_참가자아니면_not_member() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(challengeId, senderId))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      when(challengeMemberRepository.findByChallengeIdAndUserId(challengeId, targetId))
          .thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("not_member", ex.code());
    }

    @Test void 일일한도_넘으면_conflict() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(challengeId), any()))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      when(nudgeRepository.existsBySenderIdAndReceiverIdAndSentAtGreaterThanEqual(eq(senderId), eq(targetId), any()))
          .thenReturn(true);
      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("nudge_daily_limit", ex.code());
    }

    @Test void 동시요청_유니크제약위반이면_nudge_daily_limit() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(challengeId), any()))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      stubUsers();
      when(nudgeRepository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("dup"));

      ApiException ex = assertThrows(ApiException.class,
          () -> service.nudge(principal, challengeId, targetId, 0));
      assertEquals("nudge_daily_limit", ex.code());
    }

    @Test void 정상발송_크루레이스면_titleKey_crew_race() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, 5L);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(challengeId), any()))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      stubUsers();

      service.nudge(principal, challengeId, targetId, 0);

      ArgumentCaptor<NudgeEvents.NudgeSent> captor = ArgumentCaptor.forClass(NudgeEvents.NudgeSent.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals("nudge.title.crew_race", captor.getValue().titleKey());
    }

    @Test void 정상발송_일반레이스면_titleKey_race() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(challengeId), any()))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      stubUsers();

      service.nudge(principal, challengeId, targetId, 0);

      ArgumentCaptor<NudgeEvents.NudgeSent> captor = ArgumentCaptor.forClass(NudgeEvents.NudgeSent.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals("nudge.title.race", captor.getValue().titleKey());
    }

    @Test void variant범위밖이면_preset0() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(challengeId), any()))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      stubUsers();

      service.nudge(principal, challengeId, targetId, 99);

      ArgumentCaptor<NudgeEvents.NudgeSent> captor = ArgumentCaptor.forClass(NudgeEvents.NudgeSent.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals("nudge.preset.0", captor.getValue().bodyKey());
    }

    @Test void variant범위안이면_해당preset() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(challengeId), any()))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      stubUsers();

      service.nudge(principal, challengeId, targetId, 2);

      ArgumentCaptor<NudgeEvents.NudgeSent> captor = ArgumentCaptor.forClass(NudgeEvents.NudgeSent.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals("nudge.preset.2", captor.getValue().bodyKey());
    }

    @Test void 보낸사람_닉네임없으면_친구로대체() {
      OffsetDateTime now = OffsetDateTime.now();
      Challenge c = challenge(now.minusDays(1), now.plusDays(1), false, null);
      when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(c));
      when(challengeMemberRepository.findByChallengeIdAndUserId(eq(challengeId), any()))
          .thenReturn(Optional.of(mock(ChallengeMember.class)));
      when(appUserRepository.getRequired(senderId)).thenReturn(user(senderId, null));
      when(appUserRepository.getRequired(targetId)).thenReturn(user(targetId, "target"));

      service.nudge(principal, challengeId, targetId, 0);

      ArgumentCaptor<NudgeEvents.NudgeSent> captor = ArgumentCaptor.forClass(NudgeEvents.NudgeSent.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals("친구", captor.getValue().senderNickname());
    }
  }

  // ── crewNudge (같은 크루 멤버) ──────────────────────────────────────

  @Nested class CrewNudgeTest {
    private final AuthPrincipal principal = new AuthPrincipal(senderId, "fb-uid");

    @Test void 자기자신이면_cannot_nudge_self() {
      ApiException ex = assertThrows(ApiException.class,
          () -> service.crewNudge(principal, senderId, 0));
      assertEquals("cannot_nudge_self", ex.code());
    }

    @Test void 내가크루없으면_not_in_crew() {
      when(crewMemberRepository.findByUserId(senderId)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class,
          () -> service.crewNudge(principal, targetId, 0));
      assertEquals("not_in_crew", ex.code());
    }

    @Test void 상대가크루없으면_not_crew_mate() {
      Crew myCrew = crew(1, senderId);
      when(crewMemberRepository.findByUserId(senderId)).thenReturn(Optional.of(member(myCrew, senderId)));
      when(crewMemberRepository.findByUserId(targetId)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class,
          () -> service.crewNudge(principal, targetId, 0));
      assertEquals("not_crew_mate", ex.code());
    }

    @Test void 다른크루소속이면_not_crew_mate() {
      Crew myCrew = crew(1, senderId);
      Crew otherCrew = crew(2, UUID.randomUUID());
      when(crewMemberRepository.findByUserId(senderId)).thenReturn(Optional.of(member(myCrew, senderId)));
      when(crewMemberRepository.findByUserId(targetId)).thenReturn(Optional.of(member(otherCrew, targetId)));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.crewNudge(principal, targetId, 0));
      assertEquals("not_crew_mate", ex.code());
    }

    @Test void 일일한도_넘으면_conflict() {
      Crew myCrew = crew(1, senderId);
      when(crewMemberRepository.findByUserId(senderId)).thenReturn(Optional.of(member(myCrew, senderId)));
      when(crewMemberRepository.findByUserId(targetId)).thenReturn(Optional.of(member(myCrew, targetId)));
      when(nudgeRepository.existsBySenderIdAndReceiverIdAndSentAtGreaterThanEqual(eq(senderId), eq(targetId), any()))
          .thenReturn(true);
      ApiException ex = assertThrows(ApiException.class,
          () -> service.crewNudge(principal, targetId, 0));
      assertEquals("nudge_daily_limit", ex.code());
    }

    @Test void 정상발송_titleKey_crew() {
      Crew myCrew = crew(1, senderId);
      when(crewMemberRepository.findByUserId(senderId)).thenReturn(Optional.of(member(myCrew, senderId)));
      when(crewMemberRepository.findByUserId(targetId)).thenReturn(Optional.of(member(myCrew, targetId)));
      stubUsers();

      service.crewNudge(principal, targetId, 0);

      ArgumentCaptor<NudgeEvents.NudgeSent> captor = ArgumentCaptor.forClass(NudgeEvents.NudgeSent.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals("nudge.title.crew", captor.getValue().titleKey());
      assertEquals(targetId, captor.getValue().receiverUserId());
    }
  }
}
