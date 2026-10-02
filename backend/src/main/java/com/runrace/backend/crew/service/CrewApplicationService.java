package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.ForbiddenTextChars;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewJoinRequest;
import com.runrace.backend.crew.domain.CrewJoinRequestStatus;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.dto.CrewJoinRequestRow;
import com.runrace.backend.crew.dto.MyApplicationRow;
import com.runrace.backend.crew.repository.CrewJoinRequestRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.event.CrewEvents;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 크루 가입 신청의 제출·결정·조회 흐름을 전담한다. */
@Service
@RequiredArgsConstructor
public class CrewApplicationService {

  static final int APPLY_MESSAGE_MAX = 100;
  static final int REJECT_REASON_MAX = 100;
  static final int APPLY_COOLDOWN_HOURS = 24;
  static final int APPLY_DAILY_CAP = 10;

  private final CrewRepository crewRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final CrewJoinRequestRepository crewJoinRequestRepository;
  private final AppUserRepository appUserRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final ActivityHistoryService activityHistoryService;

  @Transactional
  public void apply(UUID meId, long crewId, String rawMessage) {
    Crew crew = crewRepository.getRequired(crewId);
    String message = validateBoundedText(rawMessage, APPLY_MESSAGE_MAX, "invalid_apply_message");
    AppUser applicant = appUserRepository.getRequiredForUpdate(meId);
    if (crewMemberRepository.existsByUserId(meId)) {
      throw ApiException.conflict("already_in_crew");
    }
    if (crewMemberRepository.countByCrewId(crewId) >= crew.getMaxMembers()) {
      throw ApiException.conflict("crew_full");
    }
    if (crewJoinRequestRepository.existsByCrewIdAndUserIdAndStatus(
        crewId, meId, CrewJoinRequestStatus.PENDING)) {
      throw ApiException.conflict("already_pending");
    }
    if (isInCooldown(crewId, meId)) {
      throw ApiException.conflict("apply_cooldown");
    }
    OffsetDateTime dailyWindowStart = OffsetDateTime.now().minusHours(24);
    if (crewJoinRequestRepository.countByUserIdAndCreatedAtAfter(meId, dailyWindowStart)
        >= APPLY_DAILY_CAP) {
      throw ApiException.conflict("apply_rate_limited");
    }

    CrewJoinRequest request = CrewJoinRequest.of(crew, applicant, message);
    crewJoinRequestRepository.save(request);
    activityHistoryService.recordSelf(
        meId, ActivityAction.CREW_APPLICATION_SUBMITTED,
        ActivityTargetType.CREW_APPLICATION, request.getId(), Map.of("crewId", crewId));
    eventPublisher.publishEvent(new CrewEvents.CrewApplyReceived(
        crew.getLeader().getId(), applicant.getNickname(), crewId));
  }

  @Transactional(noRollbackFor = ApiException.class)
  public void approve(UUID leaderId, long requestId) {
    UUID applicantId = crewJoinRequestRepository.findApplicantUserId(requestId)
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    Long crewId = crewJoinRequestRepository.findCrewId(requestId)
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    AppUser applicant = appUserRepository.getRequiredForUpdate(applicantId);
    Crew crew = lockCrew(crewId);
    List<CrewJoinRequest> locked =
        crewJoinRequestRepository.findAllByIdsForUpdate(lockIdsForApplicant(requestId, applicantId));
    CrewJoinRequest request = locked.stream()
        .filter(r -> r.getId() == requestId)
        .findFirst()
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
    validateLeaderPending(request, leaderId);
    requireApplicantStillJoinable(request, crew, applicantId);

    crewMemberRepository.save(
        CrewMember.builder().crew(crew).user(applicant).joinedAt(OffsetDateTime.now()).build());
    request.approve(leaderId);
    crewJoinRequestRepository.save(request);
    cancelAlreadyLocked(locked, requestId);

    activityHistoryService.record(
        leaderId, applicantId, ActivityAction.CREW_APPLICATION_APPROVED,
        ActivityTargetType.CREW_APPLICATION, requestId, Map.of("crewId", crewId));
    activityHistoryService.record(
        leaderId, applicantId, ActivityAction.CREW_JOINED,
        ActivityTargetType.CREW, crewId,
        Map.of("method", "application", "requestId", requestId));
    eventPublisher.publishEvent(
        new CrewEvents.CrewApplyApproved(applicantId, crew.getName(), crew.getId()));
  }

  @Transactional
  public void reject(UUID leaderId, long requestId, String rawReason) {
    CrewJoinRequest request = requirePendingRequestAsLeader(leaderId, requestId);
    Crew crew = request.getCrew();
    String reason = validateBoundedText(rawReason, REJECT_REASON_MAX, "invalid_reject_reason");
    request.reject(leaderId, reason);
    crewJoinRequestRepository.save(request);
    activityHistoryService.record(
        leaderId, request.getUser().getId(), ActivityAction.CREW_APPLICATION_REJECTED,
        ActivityTargetType.CREW_APPLICATION, requestId, Map.of("crewId", crew.getId()));
    eventPublisher.publishEvent(new CrewEvents.CrewApplyRejected(
        request.getUser().getId(), crew.getName(), reason, crew.getId()));
  }

  @Transactional
  public void cancelApplication(UUID meId, long requestId) {
    CrewJoinRequest request = lockRequest(requestId);
    if (!request.getUser().getId().equals(meId)) {
      throw ApiException.forbidden("not_your_request");
    }
    if (!request.isPending()) {
      throw ApiException.conflict("request_already_decided");
    }
    request.cancel();
    crewJoinRequestRepository.save(request);
    activityHistoryService.recordSelf(
        meId, ActivityAction.CREW_APPLICATION_CANCELLED,
        ActivityTargetType.CREW_APPLICATION, requestId,
        Map.of("crewId", request.getCrew().getId()));
  }

  @Transactional(readOnly = true)
  public List<MyApplicationRow> myApplications(UUID meId) {
    return crewJoinRequestRepository.findPendingByUserId(meId).stream()
        .map(r -> new MyApplicationRow(
            r.getId(), r.getCrew().getId(), r.getCrew().getName(), r.getCreatedAt()))
        .toList();
  }

  @Transactional(readOnly = true)
  public List<CrewJoinRequestRow> leaderInbox(UUID meId) {
    CrewMember membership = CrewGuards.requireMembership(crewMemberRepository, meId);
    if (!membership.getCrew().isLeader(meId)) {
      throw ApiException.forbidden("not_leader");
    }
    return crewJoinRequestRepository.findPendingByCrewId(membership.getCrew().getId()).stream()
        .map(r -> new CrewJoinRequestRow(
            r.getId(), r.getUser().getId(), r.getUser().getNickname(),
            r.getMessage(), r.getCreatedAt()))
        .toList();
  }

  private Crew lockCrew(Long crewId) {
    List<Crew> crews = crewRepository.findAllByIdsForUpdate(List.of(crewId));
    if (crews.size() != 1) throw ApiException.notFound("crew_not_found");
    return crews.get(0);
  }

  private List<Long> lockIdsForApplicant(long requestId, UUID applicantId) {
    TreeSet<Long> ids = new TreeSet<>(crewJoinRequestRepository.findPendingIdsByUserId(applicantId));
    ids.add(requestId);
    return List.copyOf(ids);
  }

  private void cancelAlreadyLocked(List<CrewJoinRequest> locked, long exceptRequestId) {
    for (CrewJoinRequest pending : locked) {
      if (pending.getId() == exceptRequestId || !pending.isPending()) continue;
      pending.cancel();
      crewJoinRequestRepository.save(pending);
    }
  }

  private CrewJoinRequest lockRequest(long requestId) {
    return crewJoinRequestRepository.findAllByIdsForUpdate(List.of(requestId)).stream()
        .findFirst()
        .orElseThrow(() -> ApiException.notFound("request_not_found"));
  }

  private CrewJoinRequest requirePendingRequestAsLeader(UUID leaderId, long requestId) {
    CrewJoinRequest request = lockRequest(requestId);
    validateLeaderPending(request, leaderId);
    return request;
  }

  private static void validateLeaderPending(CrewJoinRequest request, UUID leaderId) {
    if (!request.getCrew().isLeader(leaderId)) throw ApiException.forbidden("not_leader");
    if (!request.isPending()) throw ApiException.conflict("request_already_decided");
  }

  private void requireApplicantStillJoinable(
      CrewJoinRequest request, Crew crew, UUID applicantId) {
    if (crewMemberRepository.existsByUserId(applicantId)) {
      request.cancel();
      crewJoinRequestRepository.save(request);
      throw ApiException.conflict("applicant_already_in_crew");
    }
    if (crewMemberRepository.countByCrewId(crew.getId()) >= crew.getMaxMembers()) {
      throw ApiException.conflict("crew_full");
    }
  }

  private boolean isInCooldown(long crewId, UUID userId) {
    return crewJoinRequestRepository.findLastRejectedAt(crewId, userId)
        .map(last -> last.isAfter(OffsetDateTime.now().minusHours(APPLY_COOLDOWN_HOURS)))
        .orElse(false);
  }

  private static String validateBoundedText(String raw, int maxLen, String errorCode) {
    if (raw == null) return null;
    String text = raw.trim();
    if (text.isEmpty()) return null;
    if (text.length() > maxLen || ForbiddenTextChars.containsForbidden(text)) {
      throw ApiException.badRequest(errorCode);
    }
    return text;
  }
}
