package com.runrace.backend.crew.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewJoinRequest;
import com.runrace.backend.crew.domain.CrewJoinRequestStatus;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.repository.CrewJoinRequestRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.event.CrewEvents;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.List;
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

@ExtendWith(MockitoExtension.class)
class CrewServiceTest {

  @Mock CrewRepository crewRepository;
  @Mock CrewMemberRepository crewMemberRepository;
  @Mock CrewJoinRequestRepository crewJoinRequestRepository;
  @Mock AppUserRepository appUserRepository;
  @Mock ImageUploadService imageUploadService;
  @Mock ApplicationEventPublisher eventPublisher;

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

  private CrewJoinRequest pendingRequest(Crew crew, UUID applicantId, long id) {
    return CrewJoinRequest.builder()
        .id(id)
        .crew(crew)
        .user(user(applicantId))
        .status(CrewJoinRequestStatus.PENDING)
        .createdAt(OffsetDateTime.now())
        .build();
  }

  // ── create ───────────────────────────────────────────────────────────────

  @Nested class Create {
    @Test void 이름이_짧으면_invalid_crew_name() {
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "a", "SEOUL"));
      assertEquals("invalid_crew_name", ex.code());
    }

    @Test void 금지문자_포함이면_invalid_crew_name() {
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤<크루>", "SEOUL"));
      assertEquals("invalid_crew_name", ex.code());
    }

    @Test void 제어문자_포함이면_invalid_crew_name() {
      // ForbiddenTextChars(공유 유틸)로 교체 후 새로 막힌 케이스 — 프론트 stripForbiddenText는
      // 이미 제어문자를 걸러내므로 정상 UI 경로에선 발생하지 않고, API 직접호출 방어용.
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤\t크루", "SEOUL"));
      assertEquals("invalid_crew_name", ex.code());
    }

    @Test void 이미_크루_소속이면_already_in_crew() {
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(true);
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤크루", "SEOUL"));
      assertEquals("already_in_crew", ex.code());
    }

    @Test void 이름_중복이면_crew_name_taken() {
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewRepository.existsByName("달밤크루")).thenReturn(true);
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤크루", "SEOUL"));
      assertEquals("crew_name_taken", ex.code());
    }

    @Test void 지역이_유효하지_않으면_invalid_region() {
      ApiException ex = assertThrows(ApiException.class, () -> service.create(meId, "달밤크루", "ZZZZ"));
      assertEquals("invalid_region", ex.code());
    }

    @Test void 정상_생성은_크루와_멤버십을_저장() {
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewRepository.existsByName("달밤크루")).thenReturn(false);
      when(crewRepository.existsByJoinCode(any())).thenReturn(false);
      when(appUserRepository.getRequired(meId)).thenReturn(user(meId));
      when(crewRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

      service.create(meId, " 달밤크루 ", "seoul");

      ArgumentCaptor<Crew> captor = ArgumentCaptor.forClass(Crew.class);
      verify(crewRepository).save(captor.capture());
      assertEquals("SEOUL", captor.getValue().getRegion());
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
          () -> service.update(meId, 1L, null, null));
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

    @Test void 공지_수정시_크루명은_유지된다() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));

      String originalName = c.getName();
      service.update(meId, 1L, "토요일 7시 반포", null);

      verify(crewRepository, never()).existsByName(any());
      verify(crewRepository).save(c);
      assertEquals(originalName, c.getName());
      assertEquals("토요일 7시 반포", c.getNotice());
    }

    @Test void 주간목표_범위_밖이면_invalid_week_goal() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class,
          () -> service.update(meId, 1L, null, java.math.BigDecimal.valueOf(10000)));
      assertEquals("invalid_week_goal", ex.code());
    }

    @Test void 주간목표_정상값은_저장() {
      Crew c = crew(meId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));

      service.update(meId, 1L, null, java.math.BigDecimal.valueOf(100));

      assertEquals(java.math.BigDecimal.valueOf(100), c.getWeekGoalKm());
      verify(crewRepository).save(c);
    }
  }

  // ── 발견 목록(지역 필터) ─────────────────────────────────────────────────

  @Nested class Discover {
    @Test void 유효하지_않은_지역이면_invalid_region() {
      ApiException ex = assertThrows(ApiException.class, () -> service.discover("ZZZZ", 0, 10));
      assertEquals("invalid_region", ex.code());
    }

    @Test void 빈_지역은_전체_조회로_허용() {
      when(crewRepository.findDiscoverableRich("", 11, 0L)).thenReturn(List.of());

      service.discover(null, 0, 10);

      verify(crewRepository).findDiscoverableRich("", 11, 0L);
    }

    @Test void 소문자_지역코드는_대문자로_정규화되어_전달() {
      when(crewRepository.findDiscoverableRich("SEOUL", 11, 0L)).thenReturn(List.of());

      service.discover("seoul", 0, 10);

      verify(crewRepository).findDiscoverableRich("SEOUL", 11, 0L);
    }

    @Test void 페이지는_offset으로_환산되어_전달() {
      when(crewRepository.findDiscoverableRich("", 11, 10L)).thenReturn(List.of());

      service.discover(null, 1, 10);

      verify(crewRepository).findDiscoverableRich("", 11, 10L);
    }
  }

  // ── 가입신청(승인제) ─────────────────────────────────────────────────────

  @Nested class Apply {
    @Test void 크루가_없으면_crew_not_found() {
      when(crewRepository.findById(1L)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.apply(meId, 1L, null));
      assertEquals("crew_not_found", ex.code());
    }

    @Test void 금지문자_메시지면_invalid_apply_message() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      ApiException ex = assertThrows(ApiException.class, () -> service.apply(meId, 1L, "<script>"));
      assertEquals("invalid_apply_message", ex.code());
    }

    @Test void 이미_크루_소속이면_already_in_crew() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(true);
      ApiException ex = assertThrows(ApiException.class, () -> service.apply(meId, 1L, null));
      assertEquals("already_in_crew", ex.code());
    }

    @Test void 정원_초과면_crew_full() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(1L)).thenReturn(30);
      ApiException ex = assertThrows(ApiException.class, () -> service.apply(meId, 1L, null));
      assertEquals("crew_full", ex.code());
    }

    @Test void 이미_대기중_신청이_있으면_already_pending() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(1L)).thenReturn(3);
      when(crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
          1L, meId, CrewJoinRequestStatus.PENDING)).thenReturn(true);

      ApiException ex = assertThrows(ApiException.class, () -> service.apply(meId, 1L, null));

      assertEquals("already_pending", ex.code());
    }

    @Test void 거절_24시간_이내면_apply_cooldown() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(1L)).thenReturn(3);
      when(crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
          1L, meId, CrewJoinRequestStatus.PENDING)).thenReturn(false);
      when(crewJoinRequestRepository.findLastRejectedAt(1L, meId))
          .thenReturn(Optional.of(OffsetDateTime.now().minusHours(1)));

      ApiException ex = assertThrows(ApiException.class, () -> service.apply(meId, 1L, null));

      assertEquals("apply_cooldown", ex.code());
    }

    @Test void 거절_24시간_지나면_쿨다운_통과() {
      UUID leaderId = UUID.randomUUID();
      Crew c = crew(leaderId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(1L)).thenReturn(3);
      when(crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
          1L, meId, CrewJoinRequestStatus.PENDING)).thenReturn(false);
      when(crewJoinRequestRepository.findLastRejectedAt(1L, meId))
          .thenReturn(Optional.of(OffsetDateTime.now().minusHours(25)));
      when(crewJoinRequestRepository.countByUserIdAndCreatedAtAfter(eq(meId), any())).thenReturn(0L);
      when(appUserRepository.getRequired(meId)).thenReturn(user(meId));

      service.apply(meId, 1L, null);

      verify(crewJoinRequestRepository).save(any(CrewJoinRequest.class));
    }

    @Test void 도배_상한_초과면_apply_rate_limited() {
      Crew c = crew(UUID.randomUUID());
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(1L)).thenReturn(3);
      when(crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
          1L, meId, CrewJoinRequestStatus.PENDING)).thenReturn(false);
      when(crewJoinRequestRepository.findLastRejectedAt(1L, meId)).thenReturn(Optional.empty());
      when(crewJoinRequestRepository.countByUserIdAndCreatedAtAfter(eq(meId), any())).thenReturn(10L);

      ApiException ex = assertThrows(ApiException.class, () -> service.apply(meId, 1L, null));

      assertEquals("apply_rate_limited", ex.code());
    }

    @Test void 정상_신청은_저장되고_리더에게_이벤트_발행() {
      UUID leaderId = UUID.randomUUID();
      Crew c = crew(leaderId);
      when(crewRepository.findById(1L)).thenReturn(Optional.of(c));
      when(crewMemberRepository.existsByUserId(meId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(1L)).thenReturn(3);
      when(crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
          1L, meId, CrewJoinRequestStatus.PENDING)).thenReturn(false);
      when(crewJoinRequestRepository.findLastRejectedAt(1L, meId)).thenReturn(Optional.empty());
      when(crewJoinRequestRepository.countByUserIdAndCreatedAtAfter(eq(meId), any())).thenReturn(0L);
      when(appUserRepository.getRequired(meId)).thenReturn(user(meId));

      service.apply(meId, 1L, " 잘_부탁드려요 ");

      verify(crewJoinRequestRepository).save(any(CrewJoinRequest.class));
      ArgumentCaptor<CrewEvents.CrewApplyReceived> captor =
          ArgumentCaptor.forClass(CrewEvents.CrewApplyReceived.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals(leaderId, captor.getValue().leaderId());
      assertEquals(1L, captor.getValue().crewId());
    }
  }

  @Nested class Approve {
    @Test void 요청이_없으면_request_not_found() {
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.approve(meId, 1L));
      assertEquals("request_not_found", ex.code());
    }

    @Test void 리더가_아니면_not_leader() {
      Crew c = crew(UUID.randomUUID());
      CrewJoinRequest req = pendingRequest(c, UUID.randomUUID(), 1L);
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));

      ApiException ex = assertThrows(ApiException.class, () -> service.approve(meId, 1L));

      assertEquals("not_leader", ex.code());
    }

    @Test void 이미_처리된_요청이면_request_already_decided() {
      Crew c = crew(meId);
      CrewJoinRequest req = pendingRequest(c, UUID.randomUUID(), 1L);
      req.cancel();
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));

      ApiException ex = assertThrows(ApiException.class, () -> service.approve(meId, 1L));

      assertEquals("request_already_decided", ex.code());
    }

    @Test void 신청자가_이미_다른_경로로_가입돼있으면_요청_취소되고_applicant_already_in_crew() {
      Crew c = crew(meId);
      UUID applicantId = UUID.randomUUID();
      CrewJoinRequest req = pendingRequest(c, applicantId, 1L);
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));
      when(crewMemberRepository.existsByUserId(applicantId)).thenReturn(true);

      ApiException ex = assertThrows(ApiException.class, () -> service.approve(meId, 1L));

      assertEquals("applicant_already_in_crew", ex.code());
      assertFalse(req.isPending());
      assertEquals(CrewJoinRequestStatus.CANCELED, req.getStatus());
      verify(crewJoinRequestRepository).save(req);
      verify(crewMemberRepository, never()).save(any());
    }

    @Test void 정원_찼으면_crew_full() {
      Crew c = crew(meId);
      UUID applicantId = UUID.randomUUID();
      CrewJoinRequest req = pendingRequest(c, applicantId, 1L);
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));
      when(crewMemberRepository.existsByUserId(applicantId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(c.getId())).thenReturn(30);

      ApiException ex = assertThrows(ApiException.class, () -> service.approve(meId, 1L));

      assertEquals("crew_full", ex.code());
    }

    @Test void 정상_승인은_멤버십_생성_타_pending_자동취소_이벤트발행() {
      Crew c = crew(meId);
      UUID applicantId = UUID.randomUUID();
      CrewJoinRequest req = pendingRequest(c, applicantId, 10L);
      Crew otherCrew = crew(UUID.randomUUID());
      CrewJoinRequest otherPending = pendingRequest(otherCrew, applicantId, 20L);

      when(crewJoinRequestRepository.findWithCrewAndUserById(10L)).thenReturn(Optional.of(req));
      when(crewMemberRepository.existsByUserId(applicantId)).thenReturn(false);
      when(crewMemberRepository.countByCrewId(c.getId())).thenReturn(3);
      when(crewJoinRequestRepository.findPendingByUserId(applicantId))
          .thenReturn(List.of(req, otherPending));

      service.approve(meId, 10L);

      verify(crewMemberRepository).save(any(CrewMember.class));
      assertEquals(CrewJoinRequestStatus.APPROVED, req.getStatus());
      assertEquals(CrewJoinRequestStatus.CANCELED, otherPending.getStatus());
      verify(crewJoinRequestRepository).save(req);
      verify(crewJoinRequestRepository).save(otherPending);
      verify(crewJoinRequestRepository, times(2)).save(any(CrewJoinRequest.class));

      ArgumentCaptor<CrewEvents.CrewApplyApproved> captor =
          ArgumentCaptor.forClass(CrewEvents.CrewApplyApproved.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals(applicantId, captor.getValue().applicantId());
      assertEquals(c.getId(), captor.getValue().crewId());
    }
  }

  @Nested class Reject {
    @Test void 요청이_없으면_request_not_found() {
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.reject(meId, 1L, null));
      assertEquals("request_not_found", ex.code());
    }

    @Test void 리더가_아니면_not_leader() {
      Crew c = crew(UUID.randomUUID());
      CrewJoinRequest req = pendingRequest(c, UUID.randomUUID(), 1L);
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));

      ApiException ex = assertThrows(ApiException.class, () -> service.reject(meId, 1L, null));

      assertEquals("not_leader", ex.code());
    }

    @Test void 이미_처리된_요청이면_request_already_decided() {
      Crew c = crew(meId);
      CrewJoinRequest req = pendingRequest(c, UUID.randomUUID(), 1L);
      req.cancel();
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));

      ApiException ex = assertThrows(ApiException.class, () -> service.reject(meId, 1L, null));

      assertEquals("request_already_decided", ex.code());
    }

    @Test void 금지문자_사유면_invalid_reject_reason() {
      Crew c = crew(meId);
      CrewJoinRequest req = pendingRequest(c, UUID.randomUUID(), 1L);
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));

      ApiException ex = assertThrows(ApiException.class, () -> service.reject(meId, 1L, "<sql>"));

      assertEquals("invalid_reject_reason", ex.code());
    }

    @Test void 정상_거절은_사유와_함께_이벤트_발행() {
      Crew c = crew(meId);
      UUID applicantId = UUID.randomUUID();
      CrewJoinRequest req = pendingRequest(c, applicantId, 1L);
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));

      service.reject(meId, 1L, " 활동이_적어요 ");

      assertEquals(CrewJoinRequestStatus.REJECTED, req.getStatus());
      verify(crewJoinRequestRepository).save(req);
      ArgumentCaptor<CrewEvents.CrewApplyRejected> captor =
          ArgumentCaptor.forClass(CrewEvents.CrewApplyRejected.class);
      verify(eventPublisher).publishEvent(captor.capture());
      assertEquals(applicantId, captor.getValue().applicantId());
      assertEquals("활동이_적어요", captor.getValue().reason());
    }

    @Test void 사유없이_거절도_허용() {
      Crew c = crew(meId);
      CrewJoinRequest req = pendingRequest(c, UUID.randomUUID(), 1L);
      when(crewJoinRequestRepository.findWithCrewAndUserById(1L)).thenReturn(Optional.of(req));

      service.reject(meId, 1L, null);

      assertEquals(CrewJoinRequestStatus.REJECTED, req.getStatus());
    }
  }

  @Nested class CancelApplication {
    @Test void 요청이_없으면_request_not_found() {
      when(crewJoinRequestRepository.findById(1L)).thenReturn(Optional.empty());
      ApiException ex = assertThrows(ApiException.class, () -> service.cancelApplication(meId, 1L));
      assertEquals("request_not_found", ex.code());
    }

    @Test void 내_신청이_아니면_not_your_request() {
      Crew c = crew(UUID.randomUUID());
      CrewJoinRequest req = pendingRequest(c, UUID.randomUUID(), 1L);
      when(crewJoinRequestRepository.findById(1L)).thenReturn(Optional.of(req));

      ApiException ex = assertThrows(ApiException.class, () -> service.cancelApplication(meId, 1L));

      assertEquals("not_your_request", ex.code());
    }

    @Test void 이미_처리된_요청이면_request_already_decided() {
      Crew c = crew(UUID.randomUUID());
      CrewJoinRequest req = pendingRequest(c, meId, 1L);
      req.cancel();
      when(crewJoinRequestRepository.findById(1L)).thenReturn(Optional.of(req));

      ApiException ex = assertThrows(ApiException.class, () -> service.cancelApplication(meId, 1L));

      assertEquals("request_already_decided", ex.code());
    }

    @Test void 정상_취소는_상태변경후_저장() {
      Crew c = crew(UUID.randomUUID());
      CrewJoinRequest req = pendingRequest(c, meId, 1L);
      when(crewJoinRequestRepository.findById(1L)).thenReturn(Optional.of(req));

      service.cancelApplication(meId, 1L);

      assertEquals(CrewJoinRequestStatus.CANCELED, req.getStatus());
      verify(crewJoinRequestRepository).save(req);
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
