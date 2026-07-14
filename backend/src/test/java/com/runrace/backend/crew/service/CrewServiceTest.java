package com.runrace.backend.crew.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
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

@ExtendWith(MockitoExtension.class)
class CrewServiceTest {

  @Mock CrewRepository crewRepository;
  @Mock CrewMemberRepository crewMemberRepository;
  @Mock AppUserRepository appUserRepository;

  @InjectMocks CrewService service;

  private final UUID meId = UUID.randomUUID();

  private AppUser user(UUID id) {
    return AppUser.builder().id(id).nickname("u-" + id.toString().substring(0, 4)).build();
  }

  private Crew crew(UUID leaderId) {
    return Crew.builder()
        .id(1L)
        .name("달밤크루")
        .joinCode("ABC234")
        .leader(user(leaderId))
        .maxMembers(30)
        .createdAt(OffsetDateTime.now())
        .build();
  }

  private CrewMember member(Crew crew, UUID userId) {
    return CrewMember.builder().crew(crew).user(user(userId)).joinedAt(OffsetDateTime.now()).build();
  }

  // ── create ───────────────────────────────────────────────────────────────

  @Nested class Create {
    @Test void 이름이_짧으면_invalid_crew_name() {
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "a"));
      assertEquals("invalid_crew_name", ex.code());
    }

    @Test void 금지문자_포함이면_invalid_crew_name() {
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤<크루>"));
      assertEquals("invalid_crew_name", ex.code());
    }

    @Test void 이미_크루_소속이면_already_in_crew() {
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(true);
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤크루"));
      assertEquals("already_in_crew", ex.code());
    }

    @Test void 이름_중복이면_crew_name_taken() {
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewRepository.existsByName("달밤크루")).thenReturn(true);
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤크루"));
      assertEquals("crew_name_taken", ex.code());
    }

    @Test void 정상_생성은_크루와_멤버십을_저장() {
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewRepository.existsByName("달밤크루")).thenReturn(false);
      when(crewRepository.existsByJoinCode(any())).thenReturn(false);
      when(appUserRepository.getRequired(meId)).thenReturn(user(meId));
      when(crewRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

      service.create(meId, " 달밤크루 ");

      verify(crewRepository).save(any(Crew.class));
      verify(crewMemberRepository).save(any(CrewMember.class));
    }
  }

  // ── join ─────────────────────────────────────────────────────────────────

  @Nested class Join {
    @Test void 없는_코드면_crew_not_found() {
      when(crewRepository.findByJoinCode("ZZZZ99")).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.join(meId, "zzzz99"));
      assertEquals("crew_not_found", ex.code());
    }

    @Test void 이미_크루_소속이면_already_in_crew() {
      when(crewRepository.findByJoinCode("ABC234")).thenReturn(Optional.of(crew(UUID.randomUUID())));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(true);
      ApiException ex = assertThrows(ApiException.class, () -> service.join(meId, "abc234"));
      assertEquals("already_in_crew", ex.code());
    }

    @Test void 정원_초과면_crew_full() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findByJoinCode("ABC234")).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(c.getId())).thenReturn(30);
      ApiException ex = assertThrows(ApiException.class, () -> service.join(meId, "ABC234"));
      assertEquals("crew_full", ex.code());
    }

    @Test void 정상_가입은_멤버십_저장() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findByJoinCode("ABC234")).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(c.getId())).thenReturn(3);
      when(appUserRepository.getRequired(meId)).thenReturn(user(meId));

      service.join(meId, " abc234 ");

      verify(crewMemberRepository).save(any(CrewMember.class));
    }
  }

  // ── leave ────────────────────────────────────────────────────────────────

  @Nested class Leave {
    @Test void 미소속이면_not_in_crew() {
      when(crewMemberRepository.findByUserId(meId)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.leave(meId));
      assertEquals("not_in_crew", ex.code());
    }

    @Test void 리더면_leader_cannot_leave() {
      Crew c = crew(meId);
      when(crewMemberRepository.findByUserId(meId)).thenReturn(Optional.of(member(c, meId)));
      ApiException ex = assertThrows(ApiException.class, () -> service.leave(meId));
      assertEquals("leader_cannot_leave", ex.code());
    }

    @Test void 일반_멤버는_멤버십_삭제() {
      Crew c = crew(UUID.randomUUID());
      CrewMember m = member(c, meId);
      when(crewMemberRepository.findByUserId(meId)).thenReturn(Optional.of(m));

      service.leave(meId);

      verify(crewMemberRepository).delete(m);
    }
  }

  // ── 리더 관리 ─────────────────────────────────────────────────────────────

  @Nested class LeaderOps {
    @Test void 리더가_아니면_수정_불가_not_leader() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.update(meId, 1L, "새이름", null, null));
      assertEquals("not_leader", ex.code());
    }

    @Test void 리더가_아니면_해체_불가_not_leader() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class, () -> service.disband(meId, 1L));
      assertEquals("not_leader", ex.code());
    }

    @Test void 자기_자신은_내보낼_수_없다() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class, () -> service.kick(meId, 1L, meId));
      assertEquals("cannot_kick_self", ex.code());
    }

    @Test void 정상_내보내기는_멤버십_삭제() {
      Crew c = crew(meId);
      UUID targetId = UUID.randomUUID();
      CrewMember target = member(c, targetId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.findByCrewIdAndUserId(1L, targetId)).thenReturn(Optional.of(target));

      service.kick(meId, 1L, targetId);

      verify(crewMemberRepository).delete(target);
    }

    @Test void 이름_수정시_중복이면_crew_name_taken() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewRepository.existsByName("새이름")).thenReturn(true);
      ApiException ex = assertThrows(ApiException.class,
          () -> service.update(meId, 1L, "새이름", null, null));
      assertEquals("crew_name_taken", ex.code());
    }

    @Test void 같은_이름_유지하며_공지만_수정은_중복검사_안탐() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));

      service.update(meId, 1L, "달밤크루", "토요일 7시 반포", null);

      verify(crewRepository, never()).existsByName(any());
      verify(crewRepository).save(c);
      assertEquals("토요일 7시 반포", c.getNotice());
    }

    @Test void 주간목표_범위_밖이면_invalid_week_goal() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.update(meId, 1L, "달밤크루", null, java.math.BigDecimal.valueOf(10000)));
      assertEquals("invalid_week_goal", ex.code());
    }

    @Test void 주간목표_정상값은_저장() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));

      service.update(meId, 1L, "달밤크루", null, java.math.BigDecimal.valueOf(100));

      assertEquals(java.math.BigDecimal.valueOf(100), c.getWeekGoalKm());
      verify(crewRepository).save(c);
    }
  }

  // ── 계정 탈퇴 연동 ────────────────────────────────────────────────────────

  @Nested class Withdrawal {
    @Test void 미소속이면_아무_일도_없다() {
      when(crewMemberRepository.findByUserId(meId)).thenReturn(Optional.empty());
      service.removeMembershipForWithdrawal(meId);
      verify(crewRepository, never()).delete(any());
      verify(crewMemberRepository, never()).delete(any());
    }

    @Test void 혼자인_리더_탈퇴는_크루_삭제() {
      Crew c = crew(meId);
      CrewMember mine = member(c, meId);
      when(crewMemberRepository.findByUserId(meId)).thenReturn(Optional.of(mine));
      when(crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(c.getId()))
          .thenReturn(List.of(mine));

      service.removeMembershipForWithdrawal(meId);

      verify(crewRepository).delete(c);
      verify(crewMemberRepository, never()).delete(any());
    }

    @Test void 리더_탈퇴는_가장_오래된_멤버에게_승계() {
      Crew c = crew(meId);
      CrewMember mine = member(c, meId);
      UUID successorId = UUID.randomUUID();
      CrewMember successor = member(c, successorId);
      when(crewMemberRepository.findByUserId(meId)).thenReturn(Optional.of(mine));
      when(crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(c.getId()))
          .thenReturn(List.of(mine, successor));

      service.removeMembershipForWithdrawal(meId);

      assertEquals(successorId, c.getLeader().getId());
      verify(crewRepository).save(c);
      verify(crewMemberRepository).delete(mine);
    }

    @Test void 일반_멤버_탈퇴는_멤버십만_삭제() {
      Crew c = crew(UUID.randomUUID());
      CrewMember mine = member(c, meId);
      when(crewMemberRepository.findByUserId(meId)).thenReturn(Optional.of(mine));

      service.removeMembershipForWithdrawal(meId);

      verify(crewMemberRepository).delete(mine);
      verify(crewRepository, never()).delete(any());
    }
  }
}
